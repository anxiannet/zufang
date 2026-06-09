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

type CommuteCacheRow = {
  listing_index_id: string;
};

export type CommuteQueueSummary = {
  scanned: number;
  enqueued: number;
  skipped: number;
  errors: number;
};

const POSTAL_CODE_PATTERN = /^\d{6}$/;
const NTU_SCHOOL_CODE = "NTU";
const BUS_MODE = "bus";

export async function enqueueCommuteJobForListingIndex(input: ListingIndexQueueInput): Promise<"enqueued" | "skipped"> {
  const row = normalizeListingIndexQueueInput(input);
  if (!row) return "skipped";
  if (row.status && row.status !== "active") return "skipped";

  const postal = row.postal_code;

  if (await hasExistingNtuBusCache(row.id)) {
    return "skipped";
  }

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
  const targetLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const scanLimit = Math.max(targetLimit, 1000);
  const rows = await supabaseRequest<ListingIndexQueueInput[]>(
    `listing_indexes?select=id,postal_code,status&status=eq.active&postal_code=not.is.null&order=indexed_at.desc.nullsfirst&limit=${scanLimit}`
  );

  const cachedListingIds = await fetchCachedNtuBusListingIds(rows.map((row) => row.id));
  const summary: CommuteQueueSummary = {
    scanned: rows.length,
    enqueued: 0,
    skipped: 0,
    errors: 0
  };

  for (const row of rows) {
    if (summary.enqueued >= targetLimit) {
      summary.skipped += 1;
      continue;
    }

    try {
      if (cachedListingIds.has(row.id)) {
        summary.skipped += 1;
        continue;
      }

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

function normalizeListingIndexQueueInput(row: ListingIndexQueueInput): NormalizedListingIndexQueueInput | null {
  const postal = String(row.postal_code ?? "").trim();
  if (!POSTAL_CODE_PATTERN.test(postal)) return null;

  return {
    id: row.id,
    postal_code: postal,
    status: row.status
  };
}

async function hasExistingNtuBusCache(listingIndexId: string): Promise<boolean> {
  const rows = await supabaseRequest<CommuteCacheRow[]>(
    `listing_commute_cache?select=listing_index_id&listing_index_id=eq.${encodeURIComponent(listingIndexId)}&school_code=eq.${NTU_SCHOOL_CODE}&mode=eq.${BUS_MODE}&duration_minutes=not.is.null&limit=1`
  );

  return rows.length > 0;
}

async function fetchCachedNtuBusListingIds(listingIndexIds: string[]): Promise<Set<string>> {
  if (listingIndexIds.length === 0) return new Set();

  const uniqueIds = [...new Set(listingIndexIds)];
  const ids = uniqueIds.map((id) => `"${id}"`).join(",");
  const rows = await supabaseRequest<CommuteCacheRow[]>(
    `listing_commute_cache?select=listing_index_id&listing_index_id=in.(${ids})&school_code=eq.${NTU_SCHOOL_CODE}&mode=eq.${BUS_MODE}&duration_minutes=not.is.null`
  );

  return new Set(rows.map((row) => row.listing_index_id));
}
