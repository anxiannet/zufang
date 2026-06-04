import { logger } from "../utils/logger";
import { buildIndex } from "./listingPipelineParts/buildIndex";
import { cleanListing } from "./listingPipelineParts/cleanListing";
import { DEFAULT_LIMIT, normalizeLimit } from "./listingPipelineParts/constants";
import { fetchUnprocessedIngestionListings } from "./listingPipelineParts/fetchIngestionListings";
import { upsertListingClean, upsertListingIndex } from "./listingPipelineParts/persistence";
import { ProcessNewListingsOptions, ProcessNewListingsSummary } from "./listingPipelineParts/types";

export type { ProcessNewListingsOptions, ProcessNewListingsSummary } from "./listingPipelineParts/types";
export { buildIndex } from "./listingPipelineParts/buildIndex";
export { cleanListing } from "./listingPipelineParts/cleanListing";

export async function processNewListings(limit = DEFAULT_LIMIT): Promise<ProcessNewListingsSummary> {
  return processNewListingsWithOptions({ limit });
}

export async function processNewListingsWithOptions(options: ProcessNewListingsOptions = {}): Promise<ProcessNewListingsSummary> {
  const limit = normalizeLimit(options.limit);
  const rows = await fetchUnprocessedIngestionListings({
    limit,
    source: options.source,
    onlyActive: options.onlyActive ?? true
  });

  const summary: ProcessNewListingsSummary = {
    found: rows.length,
    cleaned: 0,
    indexed: 0,
    errors: 0
  };

  logger.info("process new listings started", { found: rows.length, limit, source: options.source ?? "all" });

  for (const row of rows) {
    try {
      const cleanRowInput = cleanListing(row);
      if (!cleanRowInput) {
        summary.errors += 1;
        continue;
      }

      const cleanRow = await upsertListingClean(cleanRowInput);
      summary.cleaned += 1;

      const indexRow = buildIndex(cleanRow);
      await upsertListingIndex(indexRow);
      summary.indexed += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error("process new listing failed", {
        source: row.source,
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info("process new listings finished", summary as unknown as Record<string, unknown>);
  return summary;
}
