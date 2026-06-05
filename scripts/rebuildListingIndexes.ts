import { buildIndex } from "../src/services/listingPipelineParts/buildIndex";
import { CLEAN_TABLE, INDEX_TABLE } from "../src/services/listingPipelineParts/constants";
import { ListingCleanRow } from "../src/services/listingPipelineParts/types";
import { supabaseRequest } from "../src/db/pool";
import { enqueueCommuteJobForListingIndex } from "../src/services/commuteEnrichmentQueue";

const DEFAULT_BATCH_SIZE = 100;

async function main() {
  const batchSize = normalizeBatchSize(process.env.REBUILD_INDEX_BATCH_SIZE);
  const shouldClear = process.env.REBUILD_INDEX_CLEAR === "true";

  if (shouldClear) {
    throw new Error("REBUILD_INDEX_CLEAR=true is disabled: listing_indexes must be rebuilt with upsert/update only.");
  }

  let offset = 0;
  let read = 0;
  let indexed = 0;
  let errors = 0;

  while (true) {
    const rows = await fetchListingCleanRows(batchSize, offset);
    if (rows.length === 0) break;

    read += rows.length;

    for (const row of rows) {
      try {
        const indexRow = buildIndex(row);
        await upsertListingIndex(indexRow);
        indexed += 1;
      } catch (error) {
        errors += 1;
        console.error("Failed to rebuild listing index", {
          source: row.source,
          source_id: row.source_id,
          clean_listing_id: row.id,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  console.log(JSON.stringify({ read, indexed, errors, cleared: false }, null, 2));

  if (errors > 0) {
    process.exitCode = 1;
  }
}

async function fetchListingCleanRows(limit: number, offset: number): Promise<ListingCleanRow[]> {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.asc.nullslast",
    limit: String(limit),
    offset: String(offset)
  });

  return supabaseRequest<ListingCleanRow[]>(`${CLEAN_TABLE}?${params.toString()}`);
}

async function upsertListingIndex(row: ReturnType<typeof buildIndex>): Promise<void> {
  const result = await supabaseRequest<Array<{ id: string; postal_code: string | null; address_text: string | null; status: string | null }>>(`${INDEX_TABLE}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(row)
  });

  const indexRow = result[0];
  if (indexRow?.id) {
    await enqueueCommuteJobForListingIndex(indexRow);
  }
}

function normalizeBatchSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, 500);
}

main().catch((error) => {
  console.error("Failed to rebuild listing indexes", error);
  process.exit(1);
});
