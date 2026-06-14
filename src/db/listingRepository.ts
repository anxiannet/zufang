import { ListListing, RawDetailListing, StaleIngestionListing } from "../models/listing";
import { config } from "../utils/config";
import { supabaseRequest } from "./pool";

type ExistingListingRow = {
  id: string | number;
  raw_detail_html: string | null;
};

type SaveResult = {
  inserted: boolean;
  changed: boolean;
};

type RawListingInput = {
  list: ListListing;
  detail: RawDetailListing;
};

const OPTIONAL_INGESTION_COLUMNS = new Set(["list_phone", "list_wechat", "list_posted_at", "last_seen_at"]);

export async function touchListingLastSeen(listing: ListListing): Promise<void> {
  const row = {
    source: listing.source,
    source_id: listing.sourceId,
    listing_url: listing.detailUrl,
    detail_url: listing.detailUrl,
    list_title: listing.listTitle,
    list_price: listing.listPrice,
    list_contact: listing.listContact,
    list_raw_html: listing.listRawHtml,
    list_raw_text: listing.listRawText,
    list_phone: listing.listPhone,
    list_wechat: listing.listWechat,
    list_posted_at: listing.listPostedAt?.toISOString() ?? null,
    is_top: listing.isTop,
    removed_from_source: false,
    last_seen_at: new Date().toISOString()
  };

  await writeListingRow(`${config.listingTableName}?on_conflict=source,source_id`, "POST", row, "resolution=merge-duplicates,return=minimal");
}

export async function upsertRawListing(input: RawListingInput): Promise<SaveResult> {
  const existing = await findExistingListing(input.detail.source, input.detail.sourceId);
  const row = toRawListingRow(input);

  if (!existing) {
    await writeListingRow(`${config.listingTableName}?on_conflict=source,source_id`, "POST", row, "resolution=merge-duplicates,return=minimal");
    return { inserted: true, changed: false };
  }

  const changed = normalizeComparable(existing.raw_detail_html) !== normalizeComparable(row.raw_detail_html);

  await writeListingRow(
    `${config.listingTableName}?source=eq.${encodeURIComponent(input.detail.source)}&source_id=eq.${encodeURIComponent(input.detail.sourceId)}`,
    "PATCH",
    row,
    "return=minimal"
  );

  return { inserted: false, changed };
}

export async function markRemovedFromSource(source: string, sourceId: string): Promise<void> {
  await supabaseRequest(`${config.listingTableName}?source=eq.${encodeURIComponent(source)}&source_id=eq.${encodeURIComponent(sourceId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      removed_from_source: true,
      scraped_at: new Date().toISOString()
    })
  });
}

export async function findStaleListings(cutoff: Date, limit: number): Promise<StaleIngestionListing[]> {
  const params = new URLSearchParams({
    select: "id,source,source_id,listing_url,detail_url,list_title,scraped_at",
    detail_url: "not.is.null",
    removed_from_source: "eq.false",
    scraped_at: `lt.${cutoff.toISOString()}`,
    order: "scraped_at.asc",
    limit: String(limit)
  });

  const rows = await supabaseRequest<Array<Omit<StaleIngestionListing, "detail_url"> & { detail_url: string | null }>>(
    `${config.listingTableName}?${params.toString()}`
  );

  return rows.filter((row): row is StaleIngestionListing => Boolean(row.detail_url));
}

export async function findAllCandidateListings(): Promise<StaleIngestionListing[]> {
  const ingestionIds: Array<string | number> = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      select: "ingestion_listing_id",
      order: "ingestion_listing_id.asc",
      offset: String(offset),
      limit: String(pageSize)
    });
    const rows = await supabaseRequest<Array<{ ingestion_listing_id: string | number }>>(
      `listing_import_candidates?${params.toString()}`
    );
    ingestionIds.push(...rows.map((row) => row.ingestion_listing_id));
    if (rows.length < pageSize) break;
  }

  const listings: StaleIngestionListing[] = [];
  const chunkSize = 100;

  for (let index = 0; index < ingestionIds.length; index += chunkSize) {
    const chunk = ingestionIds.slice(index, index + chunkSize);
    const params = new URLSearchParams({
      select: "id,source,source_id,listing_url,detail_url,list_title,scraped_at",
      id: `in.(${chunk.map(String).join(",")})`,
      detail_url: "not.is.null",
      removed_from_source: "eq.false",
      order: "scraped_at.asc"
    });
    const rows = await supabaseRequest<Array<Omit<StaleIngestionListing, "detail_url"> & { detail_url: string | null }>>(
      `${config.listingTableName}?${params.toString()}`
    );
    listings.push(...rows.filter((row): row is StaleIngestionListing => Boolean(row.detail_url)));
  }

  return listings;
}

export async function refreshStaleListingDetail(
  listing: StaleIngestionListing,
  html: string,
  checkedAt: Date
): Promise<void> {
  await supabaseRequest(
    `${config.listingTableName}?source=eq.${encodeURIComponent(listing.source)}&source_id=eq.${encodeURIComponent(listing.source_id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        raw_detail_html: html,
        scraped_at: checkedAt.toISOString(),
        removed_from_source: false
      })
    }
  );

  await supabaseRequest(`listing_import_candidates?ingestion_listing_id=eq.${listing.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      updated_at: checkedAt.toISOString()
    })
  });
}

export async function deleteStaleListing(listing: StaleIngestionListing, reason: string): Promise<void> {
  await supabaseRequest("deleted_ingestion_listings?on_conflict=source,source_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      source: listing.source,
      source_id: listing.source_id,
      listing_url: listing.listing_url,
      detail_url: listing.detail_url,
      title: listing.list_title,
      reason: "source_deleted",
      deleted_by: "crawler",
      deleted_at: new Date().toISOString(),
      metadata: {
        matched_notice: reason
      }
    })
  });

  await supabaseRequest(
    `${config.listingTableName}?source=eq.${encodeURIComponent(listing.source)}&source_id=eq.${encodeURIComponent(listing.source_id)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    }
  );
}

export async function hasExistingRawDetail(source: string, sourceId: string): Promise<boolean> {
  const existing = await findExistingListing(source, sourceId);
  return Boolean(existing?.raw_detail_html);
}

async function findExistingListing(source: string, sourceId: string): Promise<ExistingListingRow | null> {
  const params = new URLSearchParams({
    select: "id,raw_detail_html",
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1"
  });

  const rows = await supabaseRequest<ExistingListingRow[]>(`${config.listingTableName}?${params.toString()}`);
  return rows[0] ?? null;
}

function normalizeComparable(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify([...value].sort());
  }

  if (value === undefined || value === null) {
    return "";
  }

  return JSON.stringify(value);
}

function toRawListingRow(input: RawListingInput): Record<string, unknown> {
  const { list, detail } = input;

  return {
    source: detail.source,
    source_id: detail.sourceId,
    listing_url: detail.detailUrl,
    detail_url: detail.detailUrl,
    list_title: list.listTitle,
    list_price: list.listPrice,
    list_contact: list.listContact,
    list_raw_html: list.listRawHtml,
    list_raw_text: list.listRawText,
    list_phone: list.listPhone,
    list_wechat: list.listWechat,
    list_posted_at: list.listPostedAt?.toISOString() ?? null,
    raw_detail_html: detail.rawDetailHtml,
    scraped_at: detail.scrapedAt,
    last_seen_at: new Date().toISOString(),
    is_top: list.isTop,
    removed_from_source: false
  };
}

async function writeListingRow(path: string, method: "POST" | "PATCH", row: Record<string, unknown>, prefer: string): Promise<void> {
  let currentRow = row;

  while (true) {
    try {
      await supabaseRequest(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Prefer: prefer
        },
        body: JSON.stringify(currentRow)
      });
      return;
    } catch (error) {
      const nextRow = pruneUnsupportedOptionalColumn(currentRow, error);
      if (!nextRow) {
        throw error;
      }
      currentRow = nextRow;
    }
  }
}

function pruneUnsupportedOptionalColumn(row: Record<string, unknown>, error: unknown): Record<string, unknown> | null {
  const missingColumn = getMissingColumnFromError(error);
  if (!missingColumn || !OPTIONAL_INGESTION_COLUMNS.has(missingColumn) || !(missingColumn in row)) {
    return null;
  }

  const nextRow = { ...row };
  delete nextRow[missingColumn];
  return nextRow;
}

export function getMissingColumnFromError(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(/Could not find the '([^']+)' column of '[^']+' in the schema cache/);
  return match?.[1] ?? null;
}
