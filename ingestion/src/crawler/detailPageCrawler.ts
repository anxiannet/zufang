import { DetailListing, ListListing } from "../models/listing.js";
import { parseDetailPage } from "../parser/zufangDetailParser.js";
import { config } from "../utils/config.js";
import { randomDelay } from "../utils/sleep.js";
import { logger } from "../utils/logger.js";
import { fetchHtmlWithStatus, HttpStatusError } from "./httpClient.js";
import { saveRawDetail } from "./rawStore.js";

export async function crawlDetailPage(listing: ListListing, page: number): Promise<DetailListing | null> {
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
    const detail = parseDetailPage(html, listing.detailUrl);
    await saveRawDetail(detail);

    const missing = [
      ["title", detail.title],
      ["price", detail.price],
      ["posted_at", detail.postedAt],
      ["body_text", detail.bodyText]
    ].filter(([, value]) => value === null || value === "");

    if (missing.length > 0) {
      logger.info("[DETAIL_PARSE_WARN]", {
        source_id: listing.sourceId,
        detail_url: listing.detailUrl,
        page,
        reason: `missing=${missing.map(([key]) => key).join(",")}`,
        elapsed_ms: Date.now() - started
      });
    }

    logger.info("[DETAIL_PARSED]", {
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
