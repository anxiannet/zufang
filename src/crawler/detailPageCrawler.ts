import { ListListing, RawDetailListing } from "../models/listing";
import { config } from "../utils/config";
import { randomDelay } from "../utils/sleep";
import { logger } from "../utils/logger";
import { fetchHtmlWithStatus, HttpStatusError } from "./httpClient";
import { saveRawDetail } from "./rawStore";

export async function crawlDetailPage(listing: ListListing, page: number): Promise<RawDetailListing | null> {
  const started = Date.now();

  try {
    const delayMs = await randomDelay(config.minDetailDelayMs, config.maxDetailDelayMs);
    logger.info("[DETAIL_FETCH]", {
      source_id: listing.sourceId,
      detail_url: listing.detailUrl,
      page,
      reason: `delay_ms=${delayMs}`,
      elapsed_ms: 0
    });

    const { html } = await fetchHtmlWithStatus(listing.detailUrl, config.maxRetries);
    const detail: RawDetailListing = {
      source: listing.source,
      sourceId: listing.sourceId,
      detailUrl: listing.detailUrl,
      rawDetailHtml: html,
      scrapedAt: new Date()
    };
    await saveRawDetail(detail);

    logger.info("[DETAIL_RAW_SAVED]", {
      source_id: detail.sourceId,
      detail_url: detail.detailUrl,
      page,
      reason: "ok",
      elapsed_ms: Date.now() - started
    });

    return detail;
  } catch (error) {
    const status = error instanceof HttpStatusError ? error.status : null;
    logger.error("[DETAIL_FETCH_ERROR]", {
      source_id: listing.sourceId,
      detail_url: listing.detailUrl,
      page,
      reason: error instanceof Error ? error.message : String(error),
      status,
      elapsed_ms: Date.now() - started
    });
    throw error;
  }
}
