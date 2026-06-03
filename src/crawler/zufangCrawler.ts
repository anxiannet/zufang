import dayjs from "dayjs";
import pLimit from "p-limit";
import { markRemovedFromSource, upsertListing } from "../db/listingRepository";
import { CrawlMode, CrawlStats, CrawlSummary, DetailListing, Listing, ListListing } from "../models/listing";
import { config } from "../utils/config";
import { HttpStatusError } from "./httpClient";
import { randomDelay } from "../utils/sleep";
import { logger } from "../utils/logger";
import { isOlderThanDays } from "../parser/timeParser";
import { crawlDetailPage } from "./detailPageCrawler";
import { crawlListPage } from "./listPageCrawler";
import { saveRawListItem } from "./rawStore";

type CrawlOptions = {
  days: number;
  maxPages?: number;
  maxDetails?: number;
  mode?: CrawlMode;
};

export async function crawlZufang(): Promise<CrawlStats> {
  return crawlZufangInternal({
    days: config.crawlDays,
    maxPages: config.maxPagesPerRun,
    maxDetails: config.maxDetailsPerRun,
    mode: "manual"
  });
}

export async function crawlZufangRecentListings(options: CrawlOptions): Promise<CrawlSummary> {
  const stats = await crawlZufangInternal({
    days: options.days,
    maxPages: options.maxPages ?? config.maxPagesPerRun,
    maxDetails: options.maxDetails ?? config.maxDetailsPerRun,
    mode: options.mode ?? "manual"
  });

  return {
    inserted: stats.listingsInserted,
    updated: stats.listingsUpdated,
    skipped: stats.listingsSkipped,
    errors: stats.errors,
    pagesFetched: stats.pagesVisited,
    detailsFetched: stats.detailsFetched,
    stoppedReason: stats.stopReason ?? undefined
  };
}

async function crawlZufangInternal(options: Required<CrawlOptions>): Promise<CrawlStats> {
  const stats: CrawlStats = {
    pagesVisited: 0,
    listingsParsed: 0,
    detailsFetched: 0,
    listingsSaved: 0,
    listingsSkipped: 0,
    listingsChanged: 0,
    listingsInserted: 0,
    listingsUpdated: 0,
    errors: 0,
    stopReason: null
  };

  let pageUrl: string | null = config.entryUrl;
  let page = 1;
  let detailsScheduled = 0;
  const detailLimit = pLimit(config.detailConcurrency);
  const crawlDays = options.days;
  const maxPages = options.maxPages;
  const maxDetails = options.maxDetails;

  logger.info("crawl started", {
    mode: options.mode,
    days: crawlDays,
    max_pages: maxPages,
    max_details: maxDetails,
    detail_concurrency: config.detailConcurrency
  });

  while (pageUrl) {
    if (stats.pagesVisited >= maxPages) {
      stats.stopReason = `达到本次最大页数 ${maxPages}`;
      break;
    }

    if (detailsScheduled >= maxDetails) {
      stats.stopReason = `达到本次最大详情数 ${maxDetails}`;
      break;
    }

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

      if (listing.listPostedAt && isOlderThanDays(listing.listPostedAt, crawlDays)) {
        stats.stopReason = `发现超过 ${crawlDays} 天的房源，停止翻页`;
        logger.skip("old listing reached", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl,
          posted_at: dayjs(listing.listPostedAt).format("YYYY-MM-DD HH:mm:ss")
        });
        break;
      }

      if (detailsScheduled >= maxDetails) {
        stats.stopReason = `达到本次最大详情数 ${maxDetails}`;
        break;
      }

      freshListings.push(listing);
      detailsScheduled += 1;
    }

    const results = await Promise.allSettled(
      freshListings.map((listing) =>
        detailLimit(async () => {
          await processDetail(listing, page, stats, crawlDays);
        })
      )
    );

    for (const result of results) {
      if (result.status === "rejected") {
        stats.errors += 1;
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

async function processDetail(listing: ListListing, page: number, stats: CrawlStats, crawlDays: number): Promise<void> {
  const started = Date.now();

  try {
    const detail = await crawlDetailPage(listing, page);
    if (!detail) {
      stats.listingsSkipped += 1;
      return;
    }

    stats.detailsFetched += 1;

    if (detail.postedAt && isOlderThanDays(detail.postedAt, crawlDays)) {
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
    if (result.inserted) {
      stats.listingsInserted += 1;
    } else {
      stats.listingsUpdated += 1;
    }

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
