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
    list_posted_text: list.listPostedText,
    list_price: list.listPrice,
    list_contact: list.listContact,
    list_raw_html: list.listRawHtml,
    list_raw_text: list.listRawText,
    raw_detail_html: detail.rawDetailHtml,
    scraped_at: detail.scrapedAt,
    is_top: list.isTop,
    removed_from_source: false
  };
}
