import { Listing } from "../models/listing";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { supabaseRequest } from "./pool";

type ExistingListingRow = {
  id: string | number;
  source: string;
  source_id: string;
  title: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  mrt_area: string | null;
  tags: string[] | null;
  body_text: string | null;
  user_corrected_fields: Record<string, boolean> | null;
};

type SaveResult = {
  inserted: boolean;
  changed: boolean;
};

type FieldChange = {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
};

const trackedFields = ["title", "price", "phone", "wechat", "mrt_area", "tags", "body_text"] as const;

export async function upsertListing(listing: Listing): Promise<SaveResult> {
  const existing = await findExistingListing(listing.source, listing.sourceId);
  const row = toListingRow(listing);

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

  const changes = detectChanges(existing, row);
  const protectedFields = existing.user_corrected_fields ?? {};
  const updateRow: Record<string, unknown> = { ...row };

  for (const field of Object.keys(protectedFields)) {
    if (protectedFields[field]) {
      delete updateRow[field];
    }
  }

  if (changes.length > 0) {
    updateRow.needs_review = true;
    updateRow.latest_source_snapshot = listing.latestSourceSnapshot;
    await insertChangeLogs(existing.id, listing, changes);
    logger.info("[CHANGE_DETECTED]", {
      source_id: listing.sourceId,
      detail_url: listing.detailUrl,
      page: null,
      reason: changes.map((change) => change.field_name).join(","),
      elapsed_ms: 0
    });
  }

  await supabaseRequest(`${config.listingTableName}?source=eq.${encodeURIComponent(listing.source)}&source_id=eq.${encodeURIComponent(listing.sourceId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(updateRow)
  });

  return { inserted: false, changed: changes.length > 0 };
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
      needs_review: true,
      scraped_at: new Date().toISOString()
    })
  });
}

async function findExistingListing(source: string, sourceId: string): Promise<ExistingListingRow | null> {
  const params = new URLSearchParams({
    select: "id,source,source_id,title,price,phone,wechat,mrt_area,tags,body_text,user_corrected_fields",
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1"
  });

  const rows = await supabaseRequest<ExistingListingRow[]>(`${config.listingTableName}?${params.toString()}`);
  return rows[0] ?? null;
}

function detectChanges(existing: ExistingListingRow, next: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of trackedFields) {
      const oldValue = normalizeComparable(existing[field]);
      const newValue = normalizeComparable(next[field]);
      if (oldValue !== newValue) {
        changes.push({
          field_name: field,
          old_value: existing[field] ?? null,
          new_value: next[field] ?? null
        });
      }
  }

  return changes;
}

async function insertChangeLogs(
  listingId: string | number,
  listing: Listing,
  changes: FieldChange[]
): Promise<void> {
  const rows = changes.map((change) => ({
    listing_id: listingId,
    source: listing.source,
    source_id: listing.sourceId,
    field_name: change.field_name,
    old_value: change.old_value,
    new_value: change.new_value,
    scraped_at: listing.scrapedAt
  }));

  await supabaseRequest("listing_change_logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(rows)
  });
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

function toListingRow(listing: Listing): Record<string, unknown> {
  return {
    source: listing.source,
    source_id: listing.sourceId,
    title: listing.title,
    listing_url: listing.listingUrl,
    detail_url: listing.detailUrl,
    list_title: listing.listTitle,
    list_posted_text: listing.listPostedText,
    list_price: listing.listPrice,
    list_contact: listing.listContact,
    list_raw_html: listing.listRawHtml,
    list_raw_text: listing.listRawText,
    raw_html: listing.rawDetailHtml || listing.listRawHtml,
    raw_text: listing.rawDetailText || listing.listRawText,
    posted_text: listing.postedText,
    contact_text: listing.contactText,
    whatsapp_url: listing.whatsappUrl,
    body_text: listing.bodyText,
    cea_reg_no: listing.ceaRegNo,
    raw_detail_html: listing.rawDetailHtml,
    raw_detail_text: listing.rawDetailText,
    category: listing.category,
    mrt_area: listing.mrtArea,
    price: listing.price,
    phone: listing.phone,
    wechat: listing.wechat,
    tags: listing.tags,
    posted_at: listing.postedAt,
    scraped_at: listing.scrapedAt,
    is_top: listing.isTop,
    needs_review: false,
    latest_source_snapshot: listing.latestSourceSnapshot
  };
}
