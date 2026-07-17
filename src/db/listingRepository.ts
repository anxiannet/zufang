import { ListListing, RawDetailListing, StaleIngestionListing } from "../models/listing";
import { config } from "../utils/config";
import { supabaseRequest } from "./pool";
import { parse_candidate_source_posted_at } from "../../lib/listingSourceDates";
import { is_listing_date_visible, LISTING_SEARCH_QUERY_LIMIT } from "../../lib/listingVisibility";

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

type DisplayedCandidateRow = {
  ingestion_listing_id: string | number;
  parsed_postal_code: string | null;
  parsed_mrt: string | null;
  updated_at: string;
};

type DisplayedCandidateIngestionRow = StaleIngestionListing & {
  list_raw_text: string | null;
  raw_detail_html: string | null;
};

export function is_displayed_candidate_listing(
  candidate: DisplayedCandidateRow,
  ingestion: DisplayedCandidateIngestionRow,
  reference_date = new Date()
): boolean {
  if (!candidate.parsed_postal_code && !candidate.parsed_mrt) return false;
  const source_posted_at = parse_candidate_source_posted_at(
    ingestion.list_raw_text,
    ingestion.raw_detail_html,
    ingestion.scraped_at
  );
  return is_listing_date_visible(source_posted_at ?? candidate.updated_at, reference_date);
}

export async function find_displayed_candidate_listings(): Promise<StaleIngestionListing[]> {
  const params = new URLSearchParams({
    select: "ingestion_listing_id,parsed_postal_code,parsed_mrt,updated_at",
    import_status: "in.(parsed,needs_review,approved)",
    listing_id: "is.null",
    parsed_title: "not.is.null",
    parsed_rent_amount: "not.is.null",
    order: "updated_at.desc",
    limit: String(LISTING_SEARCH_QUERY_LIMIT)
  });
  const candidates = await supabaseRequest<DisplayedCandidateRow[]>(
    `listing_import_candidates?${params.toString()}`
  );

  const ingestion_ids = [...new Set(candidates.map((candidate) => candidate.ingestion_listing_id))];
  if (ingestion_ids.length === 0) return [];

  const rows: DisplayedCandidateIngestionRow[] = [];
  const chunk_size = 100;
  for (let index = 0; index < ingestion_ids.length; index += chunk_size) {
    const chunk = ingestion_ids.slice(index, index + chunk_size);
    const params = new URLSearchParams({
      select: "id,source,source_id,listing_url,detail_url,list_title,list_raw_text,raw_detail_html,scraped_at",
      id: `in.(${chunk.map(String).join(",")})`,
      detail_url: "not.is.null"
    });
    const chunk_rows = await supabaseRequest<Array<Omit<DisplayedCandidateIngestionRow, "detail_url"> & { detail_url: string | null }>>(
      `${config.listingTableName}?${params.toString()}`
    );
    rows.push(...chunk_rows.filter((row): row is DisplayedCandidateIngestionRow => Boolean(row.detail_url)));
  }

  const candidates_by_ingestion_id = new Map(candidates.map((candidate) => [String(candidate.ingestion_listing_id), candidate]));
  const rows_by_id = new Map(rows.map((row) => [String(row.id), row]));
  return ingestion_ids.flatMap((id) => {
    const candidate = candidates_by_ingestion_id.get(String(id));
    const row = rows_by_id.get(String(id));
    return candidate && row && is_displayed_candidate_listing(candidate, row) ? [row] : [];
  });
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

export async function hasExistingRawDetail(source: string, sourceId: string, currentListHtml?: string): Promise<boolean> {
  const existing = await findExistingListing(source, sourceId);
  if (!existing?.raw_detail_html) return false;
  if (currentListHtml === undefined) return true;
  return detailContainsCurrentListImages(currentListHtml, existing.raw_detail_html);
}

export function detailContainsCurrentListImages(listHtml: string, detailHtml: string): boolean {
  const listImageIds = extractSourceImageIds(listHtml);
  if (listImageIds.size === 0) return true;

  const detailImageIds = extractSourceImageIds(detailHtml);
  return [...listImageIds].every((imageId) => detailImageIds.has(imageId));
}

function extractSourceImageIds(html: string): Set<string> {
  const ids = new Set<string>();
  const patterns = [
    /\/img\/app\.models\.Image\/(\d+)\//gi,
    /\/images\/image\/\d+\/(\d+)\.[a-z0-9]+/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) ids.add(match[1]);
  }

  return ids;
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
