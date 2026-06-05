import { supabaseRequest } from "../db/pool";

type ListingIndexQueueInput = {
  id: string;
  postal_code: string | null;
  address_text: string | null;
  status?: string | null;
};

type CommuteJobRow = {
  id: string;
  listing_index_id: string;
  postal_code: string | null;
  address_text: string | null;
  status: string;
};

export type CommuteQueueSummary = {
  scanned: number;
  enqueued: number;
  skipped: number;
  errors: number;
};

export async function enqueueCommuteJobForListingIndex(row: ListingIndexQueueInput): Promise<"enqueued" | "skipped"> {
  if (row.status && row.status !== "active") return "skipped";
  if (!row.postal_code && !row.address_text) return "skipped";

  const existingRows = await supabaseRequest<CommuteJobRow[]>(
    `commute_enrichment_jobs?select=id,listing_index_id,postal_code,address_text,status&listing_index_id=eq.${encodeURIComponent(row.id)}&limit=1`
  );
  const existing = existingRows[0];
  const addressChanged = existing
    ? existing.postal_code !== row.postal_code || existing.address_text !== row.address_text
    : true;

  if (existing && existing.status === "completed" && !addressChanged) {
    return "skipped";
  }

  const nextStatus = existing?.status === "completed" && !addressChanged ? "completed" : "pending";
  await supabaseRequest("commute_enrichment_jobs?on_conflict=listing_index_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      listing_index_id: row.id,
      postal_code: row.postal_code,
      address_text: row.address_text,
      status: nextStatus,
      retry_count: nextStatus === "pending" ? 0 : undefined,
      last_error: nextStatus === "pending" ? null : undefined,
      updated_at: new Date().toISOString()
    })
  });

  return "enqueued";
}

export async function enqueueMissingCommuteJobs(limit = 100): Promise<CommuteQueueSummary> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const rows = await supabaseRequest<ListingIndexQueueInput[]>(
    `listing_indexes?select=id,postal_code,address_text,status&status=eq.active&or=(postal_code.not.is.null,address_text.not.is.null)&order=indexed_at.desc.nullslast&limit=${safeLimit}`
  );

  const summary: CommuteQueueSummary = {
    scanned: rows.length,
    enqueued: 0,
    skipped: 0,
    errors: 0
  };

  for (const row of rows) {
    try {
      const result = await enqueueCommuteJobForListingIndex(row);
      if (result === "enqueued") summary.enqueued += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.errors += 1;
      console.error("Failed to enqueue commute job", {
        listing_index_id: row.id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return summary;
}
