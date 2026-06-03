import dayjs from "dayjs";
import pLimit from "p-limit";
import { markRemovedFromSource, upsertListing } from "../db/listingRepository.js";
import { CrawlStats, DetailListing, Listing, ListListing } from "../models/listing.js";
import { config } from "../utils/config.js";
import { HttpStatusError } from "./httpClient.js";
import { randomDelay } from "../utils/sleep.js";
import { logger } from "../utils/logger.js";
import { isOlderThanDays } from "../parser/timeParser.js";
import { crawlDetailPage } from "./detailPageCrawler.js";
import { crawlListPage } from "./listPageCrawler.js";
import { saveRawListItem } from "./rawStore.js";

export async function crawlZufang(): Promise<CrawlStats> {
  const stats: CrawlStats = {
    pagesVisited: 0,
    listingsParsed: 0,
    detailsFetched: 0,
    listingsSaved: 0,
    listingsSkipped: 0,
    listingsChanged: 0,
    stopReason: null
  };

  let pageUrl: string | null = config.entryUrl;
  let page = 1;
  const detailLimit = pLimit(config.detailConcurrency);

  while (pageUrl) {
    const delayMs = await randomDelay(config.minPageDelayMs, config.maxPageDelayMs);
    logger.info("page delay completed", { page, delayMs });

    const parsed = await crawlListPage(pageUrl, page);
    stats.pagesVisited += 1;

    if (parsed.listings.length === 0) {
      stats.stopReason = "当前页未解析到房源";
      break;
    }

    const freshListings: ListListing[] = [];

    for (const listing of parsed.listings) {
      stats.listingsParsed += 1;
      await saveRawListItem(listing);

      if (listing.listPostedAt && isOlderThanDays(listing.listPostedAt, config.crawlDays)) {
        stats.stopReason = `发现超过 ${config.crawlDays} 天的房源，停止翻页`;
        logger.skip("old listing reached", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl,
          posted_at: dayjs(listing.listPostedAt).format("YYYY-MM-DD HH:mm:ss")
        });
        break;
      }

      freshListings.push(listing);
    }

    const results = await Promise.allSettled(
      freshListings.map((listing) =>
        detailLimit(async () => {
          await processDetail(listing, page, stats);
        })
      )
    );

    for (const result of results) {
      if (result.status === "rejected") {
        logger.error("detail task failed", { page, reason: result.reason?.message ?? String(result.reason) });
      }
    }

    if (stats.stopReason) {
      break;
    }

    pageUrl = parsed.nextPageUrl;
    if (!pageUrl) {
      stats.stopReason = "没有下一页";
      break;
    }

    page += 1;
  }

  logger.info("crawl finished", stats as unknown as Record<string, unknown>);
  return stats;
}

async function processDetail(listing: ListListing, page: number, stats: CrawlStats): Promise<void> {
  const started = Date.now();

  try {
    const detail = await crawlDetailPage(listing, page);
    if (!detail) {
      stats.listingsSkipped += 1;
      return;
    }

    stats.detailsFetched += 1;

    if (detail.postedAt && isOlderThanDays(detail.postedAt, config.crawlDays)) {
      stats.listingsSkipped += 1;
      logger.skip("[DETAIL_SKIPPED_OLD]", {
        source_id: listing.sourceId,
        detail_url: listing.detailUrl,
        page,
        reason: dayjs(detail.postedAt).format("YYYY-MM-DD HH:mm:ss"),
        elapsed_ms: Date.now() - started
      });
      return;
    }

    const merged = mergeListing(listing, detail);
    const result = await upsertListing(merged);
    stats.listingsSaved += 1;
    if (result.changed) {
      stats.listingsChanged += 1;
    }

    logger.info("[DETAIL_SAVED]", {
      source_id: listing.sourceId,
      detail_url: listing.detailUrl,
      page,
      reason: result.inserted ? "inserted" : result.changed ? "updated_changed" : "updated",
      elapsed_ms: Date.now() - started
    });
  } catch (error) {
    if (error instanceof HttpStatusError && (error.status === 404 || error.status === 410)) {
      await markRemovedFromSource(listing.source, listing.sourceId);
      stats.listingsSkipped += 1;
      return;
    }

    stats.listingsSkipped += 1;
    throw error;
  }
}

function mergeListing(list: ListListing, detail: DetailListing): Listing {
  const title = detail.title || list.listTitle || `zufang.sg ${list.sourceId}`;
  const category = detail.category || config.category;
  const price = detail.price ?? list.listPrice;
  const phone = detail.phone ?? list.listPhone;
  const postedAt = detail.postedAt ?? list.listPostedAt;
  const tags = detail.tags.length > 0 ? detail.tags : list.listTags;
  const mrtArea = detail.mrtArea ?? list.listMrtArea;
  const wechat = detail.wechat ?? list.listWechat;

  return {
    ...detail,
    source: list.source,
    sourceId: list.sourceId,
    detailUrl: list.detailUrl,
    listingUrl: list.detailUrl,
    title,
    category,
    price,
    phone,
    postedAt,
    tags,
    mrtArea,
    wechat,
    listTitle: list.listTitle,
    listPostedText: list.listPostedText,
    listPrice: list.listPrice,
    listContact: list.listContact,
    listRawHtml: list.listRawHtml,
    listRawText: list.listRawText,
    scrapedAt: detail.scrapedAt,
    isTop: list.isTop,
    latestSourceSnapshot: {
      source_id: list.sourceId,
      detail_url: list.detailUrl,
      title,
      posted_text: detail.postedText,
      posted_at: postedAt?.toISOString() ?? null,
      category,
      mrt_area: mrtArea,
      price,
      contact_text: detail.contactText,
      phone,
      whatsapp_url: detail.whatsappUrl,
      wechat,
      tags,
      body_text: detail.bodyText,
      cea_reg_no: detail.ceaRegNo
    }
  };
}
