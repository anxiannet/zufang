import { supabaseRequest } from "../db/pool";

type ListingIndexQueueInput = {
  id: string;
  postal_code: string | null;
  status?: string | null;
};

type NormalizedListingIndexQueueInput = {
  id: string;
  postal_code: string;
  status?: string | null;
};

type CommuteJobRow = {
  id: string;
  listing_index_id: string;
  postal_code: string | null;
  status: string;
};

export type CommuteQueueSummary = {
  scanned: number;
  enqueued: number;
  skipped: number;
  errors: number;
};

const POSTAL_CODE_PATTERN = /^\d{6}$/;

export async function enqueueCommuteJobForListingIndex(row: NormalizedListingIndexQueueInput): Promise<"enqueued" | "skipped"> {
  if (row.status && row.status !== "active") return "skipped";

  const postal = String(row.postal_code ?? "").trim();
  if (!POSTAL_CODE_PATTERN.test(postal)) return "skipped";

  const existingRows = await supabaseRequest<CommuteJobRow[]>(
    `commute_enrichment_jobs?select=id,listing_index_id,postal_code,status&listing_index_id=eq.${encodeURIComponent(row.id)}&limit=1`
  );
  const existing = existingRows[0];

  if (existing && existing.status === "completed" && existing.postal_code === postal) {
    return "skipped";
  }

  await supabaseRequest("commute_enrichment_jobs?on_conflict=listing_index_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      listing_index_id: row.id,
      postal_code: postal,
      status: "pending",
      retry_count: 0,
      last_error: null,
      updated_at: new Date().toISOString()
    })
  });

  return "enqueued";
}

export async function enqueueMissingCommuteJobs(limit = 100): Promise<CommuteQueueSummary> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const rows = await supabaseRequest<ListingIndexQueueInput[]>(
    `listing_indexes?select=id,postal_code,status&status=eq.active&postal_code=not.is.null&travel_time_bus_ntu=is.null&order=indexed_at.desc.nullsfirst&limit=${safeLimit}`
  );

  const summary: CommuteQueueSummary = {
    scanned: rows.length,
    enqueued: 0,
    skipped: 0,
    errors: 0
  };

  for (const row of rows) {
    try {
      const normalizedRow = normalizeListingIndexQueueInput(row);
      if (!normalizedRow) {
        summary.skipped += 1;
        continue;
      }

      const result = await enqueueCommuteJobForListingIndex(normalizedRow);
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

function normalizeListingIndexQueueInput(row: ListingIndexQueueInput): NormalizedListingIndexQueueInput | null {
  const postal = String(row.postal_code ?? "").trim();
  if (!POSTAL_CODE_PATTERN.test(postal)) return null;

  return {
    id: row.id,
    postal_code: postal,
    status: row.status
  };
}
