import { indexListings, IndexSummary } from "../indexer/listingIndexer";
import { supabaseRequest } from "../db/pool";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

type PostprocessAction =
  | "enqueue_geocoding_jobs"
  | "run_geocoding_edge_function"
  | "sync_geocoding_cache_to_listing_indexes"
  | "refresh_distance_commute_estimates";

type GeocodingStepResult = {
  action: PostprocessAction;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  data?: unknown;
};

export type PostCrawlPipelineSummary = {
  enabled: boolean;
  index?: IndexSummary;
  geocoding?: GeocodingStepResult[];
};

export async function runPostCrawlPipeline(): Promise<PostCrawlPipelineSummary> {
  if (!config.postCrawlPipelineEnabled) {
    logger.info("post crawl pipeline skipped", { reason: "disabled" });
    return { enabled: false };
  }

  logger.info("post crawl pipeline started", {
    index_limit: config.postCrawlIndexLimit,
    geocoding_limit: config.postCrawlGeocodingLimit
  });

  const index = await indexListings({
    limit: config.postCrawlIndexLimit,
    source: config.source,
    onlyActive: true
  });

  const geocoding: GeocodingStepResult[] = [];
  geocoding.push(await invokeRpc("enqueue_geocoding_jobs"));
  geocoding.push(await invokeGeocodingEdgeFunction());
  geocoding.push(await invokeRpc("sync_geocoding_cache_to_listing_indexes"));
  geocoding.push(await invokeRpc("refresh_distance_commute_estimates"));

  const summary = { enabled: true, index, geocoding };
  logger.info("post crawl pipeline finished", summary as unknown as Record<string, unknown>);
  return summary;
}

async function invokeRpc(action: Exclude<PostprocessAction, "run_geocoding_edge_function">): Promise<GeocodingStepResult> {
  const data = await supabaseRequest(`rpc/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  logger.info("post crawl rpc step finished", { action, data });
  return { action, ok: true, data };
}

async function invokeGeocodingEdgeFunction(): Promise<GeocodingStepResult> {
  const action = "run_geocoding_edge_function";
  if (!config.supabaseFunctionsJwt) {
    logger.skip("post crawl geocoding edge function skipped", {
      reason: "SUPABASE_FUNCTIONS_JWT is not configured"
    });
    return {
      action,
      ok: true,
      skipped: true,
      reason: "SUPABASE_FUNCTIONS_JWT is not configured"
    };
  }

  const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/admin-geocoding`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseFunctionsJwt}`
    },
    body: JSON.stringify({
      action: "run",
      limit: config.postCrawlGeocodingLimit
    })
  });

  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    throw new Error(`admin-geocoding run failed: ${response.status} ${text}`);
  }

  logger.info("post crawl geocoding edge function finished", { action, data });
  return { action, ok: true, data };
}

function parseJson(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
