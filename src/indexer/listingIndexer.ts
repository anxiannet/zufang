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

export type IndexSummary = {
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

      if (Boolean(sourceParsedFromHtml(row))) {
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
      "listing_url",
      "detail_url",
      "list_title",
      "list_posted_text",
      "list_price",
      "list_contact",
      "list_raw_html",
      "list_raw_text",
      "raw_detail_html",
      "is_top",
      "removed_from_source",
      "scraped_at",
      "created_at"
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
    title: source.title,
    summary: buildSummary(source.bodyText),
    price: source.price,
    mrt_area: source.mrtArea,
    tags: source.tags,
    body_text: source.bodyText || null,
    search_text: searchText,
    room_type: semantic.roomType,
    normalized_room_type: semantic.normalizedRoomType,
    cooking_allowed: semantic.cookingAllowed,
    can_register_address: semantic.canRegisterAddress,
    landlord_stay: semantic.landlordStay,
    gender_preference: semantic.genderPreference,
    amenities: semantic.amenities,
    address_text: semantic.addressText,
    postal_code: semantic.postalCode,
    fingerprint: semantic.fingerprint,
    indexed_at: new Date().toISOString(),
    near_ntu: isNearNtu(source, semantic),
    ntu_score: scoreNtuFit(source, semantic),
    student_friendly: isStudentFriendly(source, semantic),
    match_reasons: buildMatchReasons(source, semantic),
    status
  };
}

function normalizeIndexSource(row: IngestionListingRow): NormalizedIndexSource {
  const detailUrl = row.detail_url ?? row.listing_url ?? "";
  const html = row.raw_detail_html;

  if (html && detailUrl) {
    try {
      const parsed = parseDetailPage(html, detailUrl);
      const title = cleanText(parsed.title ?? row.list_title ?? "");
      const rawDetailText = cleanMultilineText(parsed.rawDetailText || row.list_raw_text || "");
      const bodyText = cleanMultilineText(parsed.bodyText ?? rawDetailText);

      return {
        title,
        category: parsed.category,
        listingUrl: row.listing_url,
        detailUrl,
        rawDetailText,
        bodyText,
        postedText: parsed.postedText ?? row.list_posted_text,
        postedAt: parsed.postedAt?.toISOString() ?? null,
        contactText: parsed.contactText ?? row.list_contact,
        whatsappUrl: parsed.whatsappUrl,
        ceaRegNo: parsed.ceaRegNo,
        mrtArea: parsed.mrtArea,
        price: parsed.price ?? row.list_price,
        phone: parsed.phone,
        wechat: parsed.wechat,
        tags: parsed.tags,
        parsedFromHtml: true
      };
    } catch (error) {
      logger.error("raw html reparse failed, falling back to stored text", {
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const rawDetailText = cleanMultilineText(row.list_raw_text ?? "");
  const bodyText = rawDetailText;

  return {
    title: cleanText(row.list_title ?? ""),
    category: null,
    listingUrl: row.listing_url,
    detailUrl,
    rawDetailText,
    bodyText,
    postedText: row.list_posted_text,
    postedAt: null,
    contactText: row.list_contact,
    whatsappUrl: null,
    ceaRegNo: null,
    mrtArea: null,
    price: row.list_price,
    phone: null,
    wechat: null,
    tags: [],
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

function sourceParsedFromHtml(row: IngestionListingRow): boolean {
  return Boolean((row.raw_detail_html && (row.detail_url || row.listing_url)));
}

function buildSummary(bodyText: string): string | null {
  const value = cleanText(bodyText).slice(0, 220);
  return value || null;
}

function isNearNtu(source: NormalizedIndexSource, semantic: ReturnType<typeof parseSemanticRentalFields>): boolean {
  const text = `${source.title}\n${source.mrtArea ?? ""}\n${source.bodyText}\n${semantic.addressText ?? ""}`;
  return /ntu|南洋理工|jurong|boon lay|pioneer|文礼|先驱|裕廊/i.test(text);
}

function scoreNtuFit(source: NormalizedIndexSource, semantic: ReturnType<typeof parseSemanticRentalFields>): number {
  let score = 0;
  if (isNearNtu(source, semantic)) score += 40;
  if (source.price !== null && source.price <= 1200) score += 20;
  if (semantic.cookingAllowed) score += 10;
  if (semantic.canRegisterAddress) score += 10;
  if (semantic.amenities.includes("near_mrt")) score += 10;
  if (semantic.normalizedRoomType !== "unknown") score += 10;
  return Math.min(score, 100);
}

function isStudentFriendly(source: NormalizedIndexSource, semantic: ReturnType<typeof parseSemanticRentalFields>): boolean {
  return scoreNtuFit(source, semantic) >= 50 || /学生|student/i.test(`${source.title}\n${source.bodyText}`);
}

function buildMatchReasons(source: NormalizedIndexSource, semantic: ReturnType<typeof parseSemanticRentalFields>): string[] {
  const reasons: string[] = [];
  if (isNearNtu(source, semantic)) reasons.push("near_ntu_area");
  if (source.price !== null && source.price <= 1200) reasons.push("student_budget");
  if (semantic.amenities.includes("near_mrt")) reasons.push("near_mrt");
  if (semantic.cookingAllowed) reasons.push("cooking_allowed");
  if (semantic.canRegisterAddress) reasons.push("can_register_address");
  return reasons;
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
