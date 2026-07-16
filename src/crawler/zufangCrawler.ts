import dayjs from "dayjs";
import { hasExistingRawDetail, markRemovedFromSource, touchListingLastSeen, upsertRawListing } from "../db/listingRepository";
import { deletedListingKey, findDeletedListings } from "../db/deletedListingRepository";
import { CrawlMode, CrawlStats, CrawlSummary, CrawlTargetSummary, ListListing } from "../models/listing";
import { config, CrawlTarget } from "../utils/config";
import { HttpStatusError } from "./httpClient";
import { randomDelay } from "../utils/sleep";
import { logger } from "../utils/logger";
import { isOlderThanDays } from "../parser/timeParser";
import { crawlDetailPage } from "./detailPageCrawler";
import { crawlListPage } from "./listPageCrawler";
import { getListingExclusionMatch } from "./listingExclusion";
import { saveRawListItem } from "./rawStore";

type CrawlOptions = {
  days: number;
  maxPages?: number;
  maxDetails?: number;
  maxInserted?: number;
  mode?: CrawlMode;
};

type StatsTarget = {
  source: string;
  entryUrl: string;
  label: string;
};

export async function crawlZufang(): Promise<CrawlStats> {
  return crawlZufangInternal({
    days: config.crawlDays,
    maxPages: config.maxPagesPerRun,
    maxDetails: config.maxDetailsPerRun,
    maxInserted: config.maxInsertedPerRun,
    mode: "manual"
  });
}

export async function crawlZufangRecentListings(options: CrawlOptions): Promise<CrawlSummary> {
  const stats = await crawlZufangInternal({
    days: options.days,
    maxPages: options.maxPages ?? config.maxPagesPerRun,
    maxDetails: options.maxDetails ?? config.maxDetailsPerRun,
    maxInserted: options.maxInserted ?? config.maxInsertedPerRun,
    mode: options.mode ?? "manual"
  });

  return {
    inserted: stats.listingsInserted,
    targetInserted: options.maxInserted ?? config.maxInsertedPerRun,
    updated: stats.listingsUpdated,
    skipped: stats.listingsSkipped,
    errors: stats.errors,
    pagesFetched: stats.pagesVisited,
    detailsFetched: stats.detailsFetched,
    stoppedReason: stats.stopReason ?? undefined,
    targets: stats.targets
  };
}

async function crawlZufangInternal(options: Required<CrawlOptions>): Promise<CrawlStats & { targets: CrawlTargetSummary[] }> {
  const totalStats = createStats({
    source: "multi",
    entryUrl: "",
    label: "multi-source crawl"
  });
  const targets: CrawlTargetSummary[] = [];

  logger.info("crawl started", {
    mode: options.mode,
    days: options.days,
    max_pages_per_target: options.maxPages,
    max_details: options.maxDetails,
    max_inserted: options.maxInserted,
    detail_concurrency: config.detailConcurrency,
    targets: config.crawlTargets.map((target) => target.label)
  });

  for (const target of config.crawlTargets) {
    if (totalStats.listingsInserted >= options.maxInserted) {
      totalStats.stopReason = `达到本次新增目标 ${options.maxInserted}`;
      break;
    }

    if (totalStats.detailsFetched >= options.maxDetails) {
      totalStats.stopReason = `达到本次详情安全上限 ${options.maxDetails}`;
      break;
    }

    activateCrawlTarget(target);
    const remainingInserted = options.maxInserted - totalStats.listingsInserted;
    const remainingDetails = options.maxDetails - totalStats.detailsFetched;
    const targetStats = await crawlTargetInternal(target, {
      ...options,
      maxDetails: remainingDetails,
      maxInserted: remainingInserted
    });

    mergeStats(totalStats, targetStats);
    targets.push(toTargetSummary(targetStats));

    if (totalStats.listingsInserted >= options.maxInserted) {
      totalStats.stopReason = `达到本次新增目标 ${options.maxInserted}`;
      break;
    }
  }

  if (!totalStats.stopReason) {
    totalStats.stopReason = `所有采集源已完成，新增 ${totalStats.listingsInserted}/${options.maxInserted}`;
  }

  logger.info("crawl finished", totalStats as unknown as Record<string, unknown>);
  return { ...totalStats, targets };
}

function createStats(target: StatsTarget): CrawlStats {
  return {
    source: target.source,
    entryUrl: target.entryUrl,
    targetLabel: target.label,
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
}

async function crawlTargetInternal(target: CrawlTarget, options: Required<CrawlOptions>): Promise<CrawlStats> {
  const stats = createStats(target);
  let pageUrl: string | null = config.entryUrl;
  let page = 1;
  let detailsScheduled = 0;
  const crawlDays = options.days;
  const maxPages = options.maxPages;
  const maxDetails = options.maxDetails;
  const maxInserted = options.maxInserted;

  logger.info("crawl target started", {
    source: target.source,
    entry_url: target.entryUrl,
    target_label: target.label,
    mode: options.mode,
    days: crawlDays,
    max_pages: maxPages,
    max_details: maxDetails,
    max_inserted: maxInserted,
    detail_concurrency: config.detailConcurrency
  });

  while (pageUrl) {
    if (stats.pagesVisited >= maxPages) {
      stats.stopReason = `达到本次最大页数 ${maxPages}`;
      break;
    }

    if (detailsScheduled >= maxDetails) {
      stats.stopReason = `达到本次详情安全上限 ${maxDetails}`;
      break;
    }

    if (stats.listingsInserted >= maxInserted) {
      stats.stopReason = `达到本次新增目标 ${maxInserted}`;
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
    const deletedListingKeys = await findDeletedListings(parsed.listings);
    let pageHadOldListings = false;

    for (const listing of parsed.listings) {
      stats.listingsParsed += 1;

      if (deletedListingKeys.has(deletedListingKey(listing.source, listing.sourceId))) {
        stats.listingsSkipped += 1;
        logger.skip("listing skipped because it was admin deleted", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl
        });
        continue;
      }

      const listExclusion = getListingExclusionMatch(`${listing.listTitle ?? ""} ${listing.listRawText}`);
      if (listExclusion.excluded) {
        stats.listingsSkipped += 1;
        logger.skip("listing excluded before detail fetch", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl,
          keyword: listExclusion.keyword
        });
        continue;
      }

      await saveRawListItem(listing);
      await touchListingLastSeen(listing);

      if (listing.listPostedAt && isOlderThanDays(listing.listPostedAt, crawlDays) && !listing.isTop) {
        pageHadOldListings = true;
        stats.listingsSkipped += 1;
        logger.skip("old listing reached", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl,
          posted_at: dayjs(listing.listPostedAt).format("YYYY-MM-DD HH:mm:ss")
        });
        continue;
      }

      if (listing.listPostedAt && isOlderThanDays(listing.listPostedAt, crawlDays) && listing.isTop) {
        logger.info("top listing ignores old posted date", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl,
          posted_at: dayjs(listing.listPostedAt).format("YYYY-MM-DD HH:mm:ss")
        });
      }

      if (await hasExistingRawDetail(listing.source, listing.sourceId, listing.listRawHtml)) {
        stats.listingsSkipped += 1;
        logger.skip("listing detail already crawled, skip detail update", {
          page,
          source_id: listing.sourceId,
          detail_url: listing.detailUrl
        });
        continue;
      }

      if (detailsScheduled >= maxDetails) {
        stats.stopReason = `达到本次详情安全上限 ${maxDetails}`;
        break;
      }

      freshListings.push(listing);
      detailsScheduled += 1;
    }

    if (freshListings.length === 0 && pageHadOldListings) {
      stats.stopReason = `当前页只有超过 ${crawlDays} 天的房源，停止翻页`;
      break;
    }

    for (let index = 0; index < freshListings.length && stats.listingsInserted < maxInserted; ) {
      const remainingInsertTarget = maxInserted - stats.listingsInserted;
      const batchSize = Math.min(config.detailConcurrency, remainingInsertTarget);
      const batch = freshListings.slice(index, index + batchSize);
      index += batch.length;

      const results = await Promise.allSettled(
        batch.map((listing) => processDetail(listing, page, stats))
      );

      for (const result of results) {
        if (result.status === "rejected") {
          stats.errors += 1;
          logger.error("detail task failed", { page, reason: result.reason?.message ?? String(result.reason) });
        }
      }

      if (stats.listingsInserted >= maxInserted) {
        stats.stopReason = `达到本次新增目标 ${maxInserted}`;
        break;
      }
    }

    if (stats.stopReason) {
      break;
    }

    if (stats.listingsInserted >= maxInserted) {
      stats.stopReason = `达到本次新增目标 ${maxInserted}`;
      break;
    }

    pageUrl = parsed.nextPageUrl;
    if (!pageUrl) {
      stats.stopReason = "没有下一页";
      break;
    }

    page += 1;
  }

  logger.info("crawl target finished", stats as unknown as Record<string, unknown>);
  return stats;
}

function activateCrawlTarget(target: CrawlTarget): void {
  config.crawlSourceName = target.source;
  config.baseUrl = target.baseUrl;
  config.entryUrl = target.entryUrl;
  config.source = target.source;
  config.category = target.category;
}

function mergeStats(total: CrawlStats, current: CrawlStats): void {
  total.pagesVisited += current.pagesVisited;
  total.listingsParsed += current.listingsParsed;
  total.detailsFetched += current.detailsFetched;
  total.listingsSaved += current.listingsSaved;
  total.listingsSkipped += current.listingsSkipped;
  total.listingsChanged += current.listingsChanged;
  total.listingsInserted += current.listingsInserted;
  total.listingsUpdated += current.listingsUpdated;
  total.errors += current.errors;
}

function toTargetSummary(stats: CrawlStats): CrawlTargetSummary {
  return {
    source: stats.source,
    entryUrl: stats.entryUrl,
    targetLabel: stats.targetLabel,
    inserted: stats.listingsInserted,
    updated: stats.listingsUpdated,
    skipped: stats.listingsSkipped,
    errors: stats.errors,
    pagesFetched: stats.pagesVisited,
    detailsFetched: stats.detailsFetched,
    stoppedReason: stats.stopReason ?? undefined
  };
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

    const result = await upsertRawListing({ list: listing, detail });
    stats.listingsSaved += 1;
    if (result.inserted) {
      stats.listingsInserted += 1;
    } else {
      stats.listingsUpdated += 1;
    }

    if (result.changed) {
      stats.listingsChanged += 1;
    }

    logger.info("[DETAIL_RAW_UPSERTED]", {
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
