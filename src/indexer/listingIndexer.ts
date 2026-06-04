import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { processNewListingsWithOptions } from "../services/listingPipeline";

type IndexOptions = {
  limit?: number;
  offset?: number;
  source?: string;
  onlyActive?: boolean;
};

export type IndexSummary = {
  read: number;
  indexed: number;
  skipped: number;
  errors: number;
  reparsedFromHtml: number;
  fallbackFromStoredText: number;
};

export async function indexListings(options: IndexOptions = {}): Promise<IndexSummary> {
  if (options.offset && options.offset > 0) {
    logger.skip("legacy listing index offset ignored", {
      reason: "listing_indexes must be generated through listing_clean; offset pagination is not supported by processNewListings",
      offset: options.offset
    });
  }

  const limit = options.limit ?? Number.parseInt(process.env.INDEX_LIMIT ?? "200", 10);
  const source = options.source ?? config.source;
  const onlyActive = options.onlyActive ?? true;

  logger.info("legacy listing index delegated to listing pipeline", {
    limit,
    source,
    only_active: onlyActive
  });

  const pipelineSummary = await processNewListingsWithOptions({
    limit,
    source,
    onlyActive
  });

  return {
    read: pipelineSummary.found,
    indexed: pipelineSummary.indexed,
    skipped: Math.max(0, pipelineSummary.found - pipelineSummary.cleaned),
    errors: pipelineSummary.errors,
    reparsedFromHtml: 0,
    fallbackFromStoredText: 0
  };
}
