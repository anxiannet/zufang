import * as cheerio from "cheerio";
import {
  deleteStaleListing,
  findAllCandidateListings,
  findPublishedCandidateListings,
  findStaleListings,
  markRemovedFromSource,
  refreshStaleListingDetail
} from "../db/listingRepository";
import { StaleListingMaintenanceSummary } from "../models/listing";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { cleanText } from "../utils/textClean";
import { randomDelay } from "../utils/sleep";
import { fetchHtmlWithStatus, HttpStatusError } from "./httpClient";

const deletedNoticePatterns = [
  /帖子已经删除[，,]?\s*并且已经失效[。.]?\s*请不要联系[！!]?/,
  /此贴已经删除了[，,]?\s*请勿联系[！!]?/
];

export function getDeletedSourceNotice(html: string): string | null {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const text = cleanText($("body").text());

  for (const pattern of deletedNoticePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return null;
}

export function isSourceGoneHttpStatus(status: number): boolean {
  return status === 404 || status === 410;
}

type StaleListingMaintenanceOptions = {
  allCandidates?: boolean;
  publishedCandidates?: boolean;
};

export async function maintainPublishedCandidateListings(): Promise<StaleListingMaintenanceSummary> {
  return maintainStaleListings({ publishedCandidates: true });
}

export async function maintainStaleListings(options: StaleListingMaintenanceOptions = {}): Promise<StaleListingMaintenanceSummary> {
  const cutoff = new Date(Date.now() - config.staleListingRecheckDays * 24 * 60 * 60 * 1000);
  const listings = options.publishedCandidates
    ? await findPublishedCandidateListings(config.staleListingRecheckLimit)
    : options.allCandidates
      ? await findAllCandidateListings()
      : await findStaleListings(cutoff, config.staleListingRecheckLimit);
  const scope = options.publishedCandidates
    ? "published_candidates"
    : options.allCandidates
      ? "all_candidates"
      : "stale_ingestion";
  const summary: StaleListingMaintenanceSummary = {
    checked: 0,
    refreshed: 0,
    deleted: 0,
    removed: 0,
    errors: 0
  };

  logger.info("[STALE_LISTING_CHECK_STARTED]", {
    scope,
    cutoff: options.allCandidates || options.publishedCandidates ? null : cutoff.toISOString(),
    limit: options.allCandidates ? null : config.staleListingRecheckLimit,
    selected: listings.length
  });

  async function checkListing(listing: (typeof listings)[number]): Promise<void> {
    const started = Date.now();

    try {
      await randomDelay(config.minDetailDelayMs, config.maxDetailDelayMs);
      const { html } = await fetchHtmlWithStatus(listing.detail_url, config.maxRetries);
      summary.checked += 1;

      const deletedNotice = getDeletedSourceNotice(html);
      if (deletedNotice) {
        await deleteStaleListing(listing, deletedNotice);
        summary.deleted += 1;
        logger.info("[STALE_LISTING_DELETED]", {
          source: listing.source,
          source_id: listing.source_id,
          detail_url: listing.detail_url,
          reason: deletedNotice,
          elapsed_ms: Date.now() - started
        });
        return;
      }

      await refreshStaleListingDetail(listing, html, new Date());
      summary.refreshed += 1;
      logger.info("[STALE_LISTING_REFRESHED]", {
        source: listing.source,
        source_id: listing.source_id,
        detail_url: listing.detail_url,
        elapsed_ms: Date.now() - started
      });
    } catch (error) {
      summary.checked += 1;

      if (error instanceof HttpStatusError && isSourceGoneHttpStatus(error.status)) {
        if (options.publishedCandidates) {
          await deleteStaleListing(listing, `HTTP ${error.status}`);
          summary.deleted += 1;
          logger.info("[STALE_LISTING_DELETED]", {
            scope,
            source: listing.source,
            source_id: listing.source_id,
            detail_url: listing.detail_url,
            reason: `HTTP ${error.status}`,
            elapsed_ms: Date.now() - started
          });
          return;
        }

        await markRemovedFromSource(listing.source, listing.source_id);
        summary.removed += 1;
        logger.info("[STALE_LISTING_REMOVED]", {
          source: listing.source,
          source_id: listing.source_id,
          detail_url: listing.detail_url,
          status: error.status,
          elapsed_ms: Date.now() - started
        });
        return;
      }

      summary.errors += 1;
      logger.error("[STALE_LISTING_CHECK_ERROR]", {
        source: listing.source,
        source_id: listing.source_id,
        detail_url: listing.detail_url,
        reason: error instanceof Error ? error.message : String(error),
        elapsed_ms: Date.now() - started
      });
    }
  }

  if (options.allCandidates || options.publishedCandidates) {
    let nextIndex = 0;
    const workerCount = Math.min(config.detailConcurrency, listings.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < listings.length) {
          const listing = listings[nextIndex];
          nextIndex += 1;
          await checkListing(listing);
        }
      })
    );
  } else {
    for (const listing of listings) {
      await checkListing(listing);
    }
  }

  logger.info("[STALE_LISTING_CHECK_FINISHED]", summary as unknown as Record<string, unknown>);
  return summary;
}
