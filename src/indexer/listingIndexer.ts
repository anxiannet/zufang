import { IngestionListingRow, ListingIndexRow } from "../models/listing";
import { parseSemanticRentalFields } from "../parser/semanticRentalParser";
import { config } from "../utils/config";
import { cleanMultilineText, cleanText } from "../utils/textClean";
import { logger } from "../utils/logger";
import { supabaseRequest } from "../db/pool";

type IndexOptions = {
  limit?: number;
  offset?: number;
  source?: string;
  onlyActive?: boolean;
};

type IndexSummary = {
  read: number;
  indexed: number;
  skipped: number;
  errors: number;
};

const INDEX_VERSION = "rental-index-v1";
const INDEX_TABLE = process.env.LISTING_INDEX_TABLE_NAME ?? "listing_indexes";

export async function indexListings(options: IndexOptions = {}): Promise<IndexSummary> {
  const limit = options.limit ?? Number.parseInt(process.env.INDEX_LIMIT ?? "200", 10);
  const offset = options.offset ?? Number.parseInt(process.env.INDEX_OFFSET ?? "0", 10);
  const source = options.source ?? config.source;
  const onlyActive = options.onlyActive ?? true;

  const summary: IndexSummary = { read: 0, indexed: 0, skipped: 0, errors: 0 };
  const rows = await fetchIngestionListings({ limit, offset, source, onlyActive });
  summary.read = rows.length;

  logger.info("listing index started", { limit, offset, source, only_active: onlyActive, rows: rows.length });

  for (const row of rows) {
    try {
      const indexRow = buildListingIndexRow(row);
      if (!indexRow) {
        summary.skipped += 1;
        continue;
      }

      await upsertListingIndex(indexRow);
      summary.indexed += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error("listing index failed", {
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info("listing index finished", summary as unknown as Record<string, unknown>);
  return summary;
}

async function fetchIngestionListings(options: Required<IndexOptions>): Promise<IngestionListingRow[]> {
  const params = new URLSearchParams({
    select: [
      "id",
      "source",
      "source_id",
      "title",
      "category",
      "listing_url",
      "detail_url",
      "raw_detail_html",
      "raw_detail_text",
      "raw_html",
      "raw_text",
      "body_text",
      "posted_text",
      "posted_at",
      "contact_text",
      "whatsapp_url",
      "cea_reg_no",
      "mrt_area",
      "price",
      "phone",
      "wechat",
      "tags",
      "is_top",
      "removed_from_source",
      "scraped_at",
      "updated_at"
    ].join(","),
    source: `eq.${options.source}`,
    order: "scraped_at.desc.nullslast",
    limit: String(options.limit),
    offset: String(options.offset)
  });

  if (options.onlyActive) {
    params.set("removed_from_source", "is.false");
  }

  return supabaseRequest<IngestionListingRow[]>(`${config.listingTableName}?${params.toString()}`);
}

function buildListingIndexRow(row: IngestionListingRow): ListingIndexRow | null {
  const title = cleanText(row.title ?? "");
  const detailUrl = row.detail_url ?? row.listing_url;
  const rawDetailText = cleanMultilineText(row.raw_detail_text ?? row.raw_text ?? "");
  const bodyText = cleanMultilineText(row.body_text ?? rawDetailText);

  if (!row.source || !row.source_id || !title || !detailUrl) {
    return null;
  }

  const semantic = parseSemanticRentalFields({
    title,
    category: row.category,
    mrtArea: row.mrt_area,
    price: row.price,
    phone: row.phone,
    wechat: row.wechat,
    tags: row.tags ?? [],
    bodyText,
    rawDetailText,
    detailUrl
  });

  const searchText = buildSearchText({
    title,
    category: row.category,
    mrtArea: row.mrt_area,
    price: row.price,
    tags: row.tags ?? [],
    bodyText,
    roomType: semantic.roomType,
    normalizedRoomType: semantic.normalizedRoomType,
    amenities: semantic.amenities,
    addressText: semantic.addressText,
    postalCode: semantic.postalCode
  });

  const status: ListingIndexRow["status"] = row.removed_from_source ? "removed" : bodyText ? "active" : "invalid";

  return {
    source: row.source,
    source_id: row.source_id,
    ingestion_listing_id: row.id,
    title,
    listing_url: row.listing_url,
    detail_url: row.detail_url,
    category: row.category,
    price: row.price,
    phone: row.phone,
    wechat: row.wechat,
    whatsapp_url: row.whatsapp_url,
    contact_text: row.contact_text,
    posted_at: row.posted_at,
    scraped_at: row.scraped_at,
    mrt_area: row.mrt_area,
    tags: row.tags ?? [],
    body_text: bodyText || null,
    search_text: searchText,
    room_type: semantic.roomType,
    normalized_room_type: semantic.normalizedRoomType,
    available_from: semantic.availableFrom?.toISOString() ?? null,
    cooking_allowed: semantic.cookingAllowed,
    can_register_address: semantic.canRegisterAddress,
    landlord_stay: semantic.landlordStay,
    bathroom_type: semantic.bathroomType,
    shared_bathroom_count: semantic.sharedBathroomCount,
    current_tenant_count: semantic.currentTenantCount,
    gender_preference: semantic.genderPreference,
    amenities: semantic.amenities,
    address_text: semantic.addressText,
    postal_code: semantic.postalCode,
    image_urls: semantic.imageUrls,
    fingerprint: semantic.fingerprint,
    raw_snapshot: {
      ...semantic.rawSnapshot,
      ingestion_listing_id: row.id,
      source_id: row.source_id,
      posted_text: row.posted_text,
      cea_reg_no: row.cea_reg_no
    },
    index_version: INDEX_VERSION,
    indexed_at: new Date().toISOString(),
    status
  };
}

async function upsertListingIndex(row: ListingIndexRow): Promise<void> {
  await supabaseRequest(`${INDEX_TABLE}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  });
}

function buildSearchText(input: {
  title: string;
  category: string | null;
  mrtArea: string | null;
  price: number | null;
  tags: string[];
  bodyText: string;
  roomType: string | null;
  normalizedRoomType: string;
  amenities: string[];
  addressText: string | null;
  postalCode: string | null;
}): string {
  return cleanMultilineText([
    input.title,
    input.category,
    input.mrtArea,
    input.price ? `$${input.price}` : null,
    input.tags.join(" "),
    input.roomType,
    input.normalizedRoomType,
    input.amenities.join(" "),
    input.addressText,
    input.postalCode,
    input.bodyText
  ].filter(Boolean).join("\n"));
}
