import { ParsedListPage, parseListPage } from "../parser/zufangListParser.js";
import { logger } from "../utils/logger.js";
import { fetchHtml } from "./httpClient.js";
import { saveRawListPage } from "./rawStore.js";

export async function crawlListPage(pageUrl: string, page: number): Promise<ParsedListPage> {
  const started = Date.now();
  logger.info("[LIST_PAGE_FETCH]", {
    page,
    detail_url: null,
    source_id: null,
    reason: pageUrl,
    elapsed_ms: 0
  });

  const html = await fetchHtml(pageUrl);
  await saveRawListPage(page, html);
  const parsed = parseListPage(html, pageUrl);

  for (const listing of parsed.listings) {
    logger.info("[LIST_ITEM_FOUND]", {
      page,
      source_id: listing.sourceId,
      detail_url: listing.detailUrl,
      reason: listing.listPostedText ?? "posted_at_unknown",
      elapsed_ms: Date.now() - started
    });
  }

  return parsed;
}
