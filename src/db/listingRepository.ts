import { ListListing, RawDetailListing } from "../models/listing";
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

  await supabaseRequest(`${config.listingTableName}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  });
}

export async function upsertRawListing(input: RawListingInput): Promise<SaveResult> {
  const existing = await findExistingListing(input.detail.source, input.detail.sourceId);
  const row = toRawListingRow(input);

  if (!existing) {
    await supabaseRequest(`${config.listingTableName}?on_conflict=source,source_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });
    return { inserted: true, changed: false };
  }

  const changed = normalizeComparable(existing.raw_detail_html) !== normalizeComparable(row.raw_detail_html);

  await supabaseRequest(`${config.listingTableName}?source=eq.${encodeURIComponent(input.detail.source)}&source_id=eq.${encodeURIComponent(input.detail.sourceId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row)
  });

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
