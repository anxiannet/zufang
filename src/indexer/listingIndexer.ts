import { IngestionListingRow, ListingIndexRow } from "../models/listing";
import { parseDetailPage } from "../parser/zufangDetailParser";
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
  reparsedFromHtml: number;
  fallbackFromStoredText: number;
};

type NormalizedIndexSource = {
  title: string;
  category: string | null;
  listingUrl: string | null;
  detailUrl: string;
  rawDetailText: string;
  bodyText: string;
  postedText: string | null;
  postedAt: string | null;
  contactText: string | null;
  whatsappUrl: string | null;
  ceaRegNo: string | null;
  mrtArea: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  tags: string[];
  parsedFromHtml: boolean;
};

const INDEX_VERSION = "rental-index-v1-html-source";
const INDEX_TABLE = process.env.LISTING_INDEX_TABLE_NAME ?? "listing_indexes";

export async function indexListings(options: IndexOptions = {}): Promise<IndexSummary> {
  const limit = options.limit ?? Number.parseInt(process.env.INDEX_LIMIT ?? "200", 10);
  const offset = options.offset ?? Number.parseInt(process.env.INDEX_OFFSET ?? "0", 10);
  const source = options.source ?? config.source;
  const onlyActive = options.onlyActive ?? true;

  const summary: IndexSummary = {
    read: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    reparsedFromHtml: 0,
    fallbackFromStoredText: 0
  };
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

      if (indexRow.raw_snapshot.parsed_from_html) {
        summary.reparsedFromHtml += 1;
      } else {
        summary.fallbackFromStoredText += 1;
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
  const source = normalizeIndexSource(row);

  if (!row.source || !row.source_id || !source.title || !source.detailUrl) {
    return null;
  }

  const semantic = parseSemanticRentalFields({
    title: source.title,
    category: source.category,
    mrtArea: source.mrtArea,
    price: source.price,
    phone: source.phone,
    wechat: source.wechat,
    tags: source.tags,
    bodyText: source.bodyText,
    rawDetailText: source.rawDetailText,
    detailUrl: source.detailUrl
  });

  const searchText = buildSearchText({
    title: source.title,
    category: source.category,
    mrtArea: source.mrtArea,
    price: source.price,
    tags: source.tags,
    bodyText: source.bodyText,
    roomType: semantic.roomType,
    normalizedRoomType: semantic.normalizedRoomType,
    amenities: semantic.amenities,
    addressText: semantic.addressText,
    postalCode: semantic.postalCode
  });

  const status: ListingIndexRow["status"] = row.removed_from_source ? "removed" : source.bodyText ? "active" : "invalid";

  return {
    source: row.source,
    source_id: row.source_id,
    ingestion_listing_id: row.id,
    title: source.title,
    listing_url: source.listingUrl,
    detail_url: source.detailUrl,
    category: source.category,
    price: source.price,
    phone: source.phone,
    wechat: source.wechat,
    whatsapp_url: source.whatsappUrl,
    contact_text: source.contactText,
    posted_at: source.postedAt,
    scraped_at: row.scraped_at,
    mrt_area: source.mrtArea,
    tags: source.tags,
    body_text: source.bodyText || null,
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
      posted_text: source.postedText,
      cea_reg_no: source.ceaRegNo,
      parsed_from_html: source.parsedFromHtml,
      html_available: Boolean(row.raw_detail_html || row.raw_html)
    },
    index_version: INDEX_VERSION,
    indexed_at: new Date().toISOString(),
    status
  };
}

function normalizeIndexSource(row: IngestionListingRow): NormalizedIndexSource {
  const detailUrl = row.detail_url ?? row.listing_url ?? "";
  const html = row.raw_detail_html || row.raw_html;

  if (html && detailUrl) {
    try {
      const parsed = parseDetailPage(html, detailUrl);
      const title = cleanText(parsed.title ?? row.title ?? "");
      const rawDetailText = cleanMultilineText(parsed.rawDetailText || row.raw_detail_text || row.raw_text || "");
      const bodyText = cleanMultilineText(parsed.bodyText ?? rawDetailText);

      return {
        title,
        category: parsed.category ?? row.category,
        listingUrl: row.listing_url,
        detailUrl,
        rawDetailText,
        bodyText,
        postedText: parsed.postedText ?? row.posted_text,
        postedAt: parsed.postedAt?.toISOString() ?? row.posted_at,
        contactText: parsed.contactText ?? row.contact_text,
        whatsappUrl: parsed.whatsappUrl ?? row.whatsapp_url,
        ceaRegNo: parsed.ceaRegNo ?? row.cea_reg_no,
        mrtArea: parsed.mrtArea ?? row.mrt_area,
        price: parsed.price ?? row.price,
        phone: parsed.phone ?? row.phone,
        wechat: parsed.wechat ?? row.wechat,
        tags: parsed.tags.length > 0 ? parsed.tags : row.tags ?? [],
        parsedFromHtml: true
      };
    } catch (error) {
      logger.error("raw html reparse failed, falling back to stored text", {
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const rawDetailText = cleanMultilineText(row.raw_detail_text ?? row.raw_text ?? "");
  const bodyText = cleanMultilineText(row.body_text ?? rawDetailText);

  return {
    title: cleanText(row.title ?? ""),
    category: row.category,
    listingUrl: row.listing_url,
    detailUrl,
    rawDetailText,
    bodyText,
    postedText: row.posted_text,
    postedAt: row.posted_at,
    contactText: row.contact_text,
    whatsappUrl: row.whatsapp_url,
    ceaRegNo: row.cea_reg_no,
    mrtArea: row.mrt_area,
    price: row.price,
    phone: row.phone,
    wechat: row.wechat,
    tags: row.tags ?? [],
    parsedFromHtml: false
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
