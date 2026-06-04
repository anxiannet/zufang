import { IngestionListingRow, ListingIndexRow } from "../models/listing";
import { parseDetailPage } from "../parser/zufangDetailParser";
import { parseSemanticRentalFields } from "../parser/semanticRentalParser";
import { supabaseRequest } from "../db/pool";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { cleanMultilineText, cleanText } from "../utils/textClean";

type ProcessNewListingsOptions = {
  limit?: number;
  source?: string;
  onlyActive?: boolean;
};

export type ProcessNewListingsSummary = {
  found: number;
  cleaned: number;
  indexed: number;
  errors: number;
};

type NormalizedListingSource = {
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
};

type ListingCleanRow = {
  source: string;
  source_id: string;
  listing_url: string | null;
  detail_url: string | null;
  title: string;
  category: string | null;
  posted_text: string | null;
  posted_at: string | null;
  price: number | null;
  mrt_area: string | null;
  contact_text: string | null;
  phone: string | null;
  wechat: string | null;
  whatsapp_url: string | null;
  cea_reg_no: string | null;
  tags: string[];
  raw_detail_text: string | null;
  body_text: string | null;
  summary: string | null;
  room_type: string | null;
  normalized_room_type: string;
  available_from: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  landlord_stay: boolean | null;
  bathroom_type: string | null;
  shared_bathroom_count: number | null;
  current_tenant_count: number | null;
  gender_preference: string | null;
  amenities: string[];
  address_text: string | null;
  postal_code: string | null;
  image_urls: string[];
  fingerprint: string;
  raw_snapshot: Record<string, unknown>;
  status: ListingIndexRow["status"];
  cleaned_at: string;
};

const INGESTION_TABLE = config.listingTableName;
const CLEAN_TABLE = process.env.LISTING_CLEAN_TABLE_NAME ?? "listing_clean";
const INDEX_TABLE = process.env.LISTING_INDEX_TABLE_NAME ?? "listing_indexes";
const DEFAULT_LIMIT = 100;

export async function processNewListings(limit = DEFAULT_LIMIT): Promise<ProcessNewListingsSummary> {
  return processNewListingsWithOptions({ limit });
}

export async function processNewListingsWithOptions(options: ProcessNewListingsOptions = {}): Promise<ProcessNewListingsSummary> {
  const limit = normalizeLimit(options.limit);
  const rows = await fetchUnprocessedIngestionListings({
    limit,
    source: options.source,
    onlyActive: options.onlyActive ?? true
  });

  const summary: ProcessNewListingsSummary = {
    found: rows.length,
    cleaned: 0,
    indexed: 0,
    errors: 0
  };

  logger.info("process new listings started", { found: rows.length, limit, source: options.source ?? "all" });

  for (const row of rows) {
    try {
      const cleanRow = cleanListing(row);
      if (!cleanRow) {
        summary.errors += 1;
        continue;
      }

      await upsertListingClean(cleanRow);
      summary.cleaned += 1;

      const indexRow = buildIndex(cleanRow);
      await upsertListingIndex(indexRow);
      summary.indexed += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error("process new listing failed", {
        source: row.source,
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info("process new listings finished", summary as unknown as Record<string, unknown>);
  return summary;
}

async function fetchUnprocessedIngestionListings(options: Required<Pick<ProcessNewListingsOptions, "limit" | "onlyActive">> & { source?: string }): Promise<IngestionListingRow[]> {
  const output: IngestionListingRow[] = [];
  const pageSize = Math.min(Math.max(options.limit * 5, options.limit), 500);
  let offset = 0;

  while (output.length < options.limit) {
    const candidates = await fetchIngestionListings({
      limit: pageSize,
      offset,
      source: options.source,
      onlyActive: options.onlyActive
    });

    if (candidates.length === 0) break;

    for (const row of candidates) {
      if (output.length >= options.limit) break;
      if (!row.source || !row.source_id) continue;
      const alreadyCleaned = await hasListingClean(row.source, row.source_id);
      if (!alreadyCleaned) output.push(row);
    }

    if (candidates.length < pageSize) break;
    offset += pageSize;
  }

  return output;
}

async function fetchIngestionListings(options: {
  limit: number;
  offset: number;
  source?: string;
  onlyActive: boolean;
}): Promise<IngestionListingRow[]> {
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
    order: "scraped_at.desc.nullslast",
    limit: String(options.limit),
    offset: String(options.offset)
  });

  if (options.source) params.set("source", `eq.${options.source}`);
  if (options.onlyActive) params.set("removed_from_source", "is.false");

  return supabaseRequest<IngestionListingRow[]>(`${INGESTION_TABLE}?${params.toString()}`);
}

async function hasListingClean(source: string, sourceId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "id",
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1"
  });
  const rows = await supabaseRequest<Array<{ id: string | number }>>(`${CLEAN_TABLE}?${params.toString()}`);
  return rows.length > 0;
}

export function cleanListing(row: IngestionListingRow): ListingCleanRow | null {
  const source = normalizeListingSource(row);

  if (!row.source || !row.source_id || !source.title || !source.detailUrl) {
    logger.skip("listing clean skipped", { source: row.source, source_id: row.source_id, reason: "missing required source/title/detailUrl" });
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

  const status: ListingIndexRow["status"] = row.removed_from_source ? "removed" : source.bodyText ? "active" : "invalid";

  return {
    source: row.source,
    source_id: row.source_id,
    listing_url: source.listingUrl,
    detail_url: source.detailUrl,
    title: source.title,
    category: source.category,
    posted_text: source.postedText,
    posted_at: source.postedAt,
    price: source.price,
    mrt_area: source.mrtArea,
    contact_text: source.contactText,
    phone: source.phone,
    wechat: source.wechat,
    whatsapp_url: source.whatsappUrl,
    cea_reg_no: source.ceaRegNo,
    tags: source.tags,
    raw_detail_text: source.rawDetailText || null,
    body_text: source.bodyText || null,
    summary: buildSummary(source.bodyText),
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
    raw_snapshot: semantic.rawSnapshot,
    status,
    cleaned_at: new Date().toISOString()
  };
}

export function buildIndex(cleanRow: ListingCleanRow): ListingIndexRow {
  const searchText = buildSearchText({
    title: cleanRow.title,
    category: cleanRow.category,
    mrtArea: cleanRow.mrt_area,
    price: cleanRow.price,
    tags: cleanRow.tags,
    bodyText: cleanRow.body_text ?? "",
    roomType: cleanRow.room_type,
    normalizedRoomType: cleanRow.normalized_room_type,
    amenities: cleanRow.amenities,
    addressText: cleanRow.address_text,
    postalCode: cleanRow.postal_code
  });

  return {
    source: cleanRow.source,
    source_id: cleanRow.source_id,
    title: cleanRow.title,
    summary: cleanRow.summary,
    price: cleanRow.price,
    mrt_area: cleanRow.mrt_area,
    tags: cleanRow.tags,
    body_text: cleanRow.body_text,
    search_text: searchText,
    room_type: cleanRow.room_type,
    normalized_room_type: cleanRow.normalized_room_type,
    cooking_allowed: cleanRow.cooking_allowed,
    can_register_address: cleanRow.can_register_address,
    landlord_stay: cleanRow.landlord_stay,
    gender_preference: cleanRow.gender_preference,
    amenities: cleanRow.amenities,
    address_text: cleanRow.address_text,
    postal_code: cleanRow.postal_code,
    fingerprint: cleanRow.fingerprint,
    indexed_at: new Date().toISOString(),
    near_ntu: isNearNtu(cleanRow),
    ntu_score: scoreNtuFit(cleanRow),
    student_friendly: isStudentFriendly(cleanRow),
    match_reasons: buildMatchReasons(cleanRow),
    status: cleanRow.status
  };
}

function normalizeListingSource(row: IngestionListingRow): NormalizedListingSource {
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
        tags: parsed.tags
      };
    } catch (error) {
      logger.error("raw html reparse failed, falling back to stored text", {
        source_id: row.source_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const rawDetailText = cleanMultilineText(row.list_raw_text ?? "");
  return {
    title: cleanText(row.list_title ?? ""),
    category: null,
    listingUrl: row.listing_url,
    detailUrl,
    rawDetailText,
    bodyText: rawDetailText,
    postedText: row.list_posted_text,
    postedAt: null,
    contactText: row.list_contact,
    whatsappUrl: null,
    ceaRegNo: null,
    mrtArea: null,
    price: row.list_price,
    phone: null,
    wechat: null,
    tags: []
  };
}

async function upsertListingClean(row: ListingCleanRow): Promise<void> {
  await supabaseRequest(`${CLEAN_TABLE}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  });
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

export function buildSummary(bodyText: string): string | null {
  const value = cleanText(bodyText).slice(0, 220);
  return value || null;
}

export function buildSearchText(input: {
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

function isNearNtu(row: ListingCleanRow): boolean {
  const text = `${row.title}\n${row.mrt_area ?? ""}\n${row.body_text ?? ""}\n${row.address_text ?? ""}`;
  return /ntu|南洋理工|jurong|boon lay|pioneer|文礼|先驱|裕廊/i.test(text);
}

function scoreNtuFit(row: ListingCleanRow): number {
  let score = 0;
  if (isNearNtu(row)) score += 40;
  if (row.price !== null && row.price <= 1200) score += 20;
  if (row.cooking_allowed) score += 10;
  if (row.can_register_address) score += 10;
  if (row.amenities.includes("near_mrt")) score += 10;
  if (row.normalized_room_type !== "unknown") score += 10;
  return Math.min(score, 100);
}

function isStudentFriendly(row: ListingCleanRow): boolean {
  return scoreNtuFit(row) >= 50 || /学生|student/i.test(`${row.title}\n${row.body_text ?? ""}`);
}

function buildMatchReasons(row: ListingCleanRow): string[] {
  const reasons: string[] = [];
  if (isNearNtu(row)) reasons.push("near_ntu_area");
  if (row.price !== null && row.price <= 1200) reasons.push("student_budget");
  if (row.amenities.includes("near_mrt")) reasons.push("near_mrt");
  if (row.cooking_allowed) reasons.push("cooking_allowed");
  if (row.can_register_address) reasons.push("can_register_address");
  return reasons;
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), 500);
}
