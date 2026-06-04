import { IngestionListingRow, ListingIndexRow } from "../../models/listing";
import { parseDetailPage } from "../../parser/zufangDetailParser";
import { parseSemanticRentalFields } from "../../parser/semanticRentalParser";
import { logger } from "../../utils/logger";
import { cleanMultilineText, cleanText } from "../../utils/textClean";
import { CLEAN_VERSION } from "./constants";
import { ListingCleanInsertRow } from "./types";

type NormalizedListingSource = {
  title: string;
  category: string | null;
  listingUrl: string | null;
  detailUrl: string;
  rawDetailText: string;
  bodyText: string;
  cleanText: string;
  postedText: string | null;
  postedAt: string | null;
  contactText: string | null;
  whatsappUrl: string | null;
  mrtArea: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  tags: string[];
  parsedFromHtml: boolean;
};

export function cleanListing(row: IngestionListingRow): ListingCleanInsertRow | null {
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

  const status: ListingIndexRow["status"] = row.removed_from_source
    ? "removed"
    : semantic.isInvalidListing || !source.bodyText
      ? "invalid"
      : "active";

  if (semantic.isInvalidListing) {
    logger.skip("listing marked invalid", {
      source: row.source,
      source_id: row.source_id,
      reasons: semantic.invalidReasons.join(",")
    });
  }

  return {
    ingestion_listing_id: String(row.id),
    source: row.source,
    source_id: row.source_id,
    title: source.title,
    listing_url: source.listingUrl,
    detail_url: source.detailUrl,
    category: source.category,
    price: source.price,
    phone: source.phone,
    wechat: source.wechat,
    whatsapp_url: source.whatsappUrl,
    contact_text: source.contactText,
    posted_text: source.postedText,
    posted_at: source.postedAt,
    scraped_at: row.scraped_at,
    mrt_area: source.mrtArea,
    tags: source.tags,
    body_text: source.bodyText || null,
    clean_text: source.cleanText || null,
    raw_detail_text: source.rawDetailText || null,
    raw_html_available: Boolean(row.raw_detail_html),
    parsed_from_html: source.parsedFromHtml,
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
    clean_version: CLEAN_VERSION,
    status
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
      const semanticCleanText = cleanMultilineText([
        title,
        parsed.category,
        parsed.mrtArea,
        parsed.price ? `$${parsed.price}` : null,
        parsed.tags.join(" "),
        bodyText
      ].filter(Boolean).join("\n"));

      return {
        title,
        category: parsed.category,
        listingUrl: row.listing_url,
        detailUrl,
        rawDetailText,
        bodyText,
        cleanText: semanticCleanText,
        postedText: parsed.postedText,
        postedAt: parsed.postedAt?.toISOString() ?? null,
        contactText: parsed.contactText ?? row.list_contact,
        whatsappUrl: parsed.whatsappUrl,
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
  const title = cleanText(row.list_title ?? "");
  const semanticCleanText = cleanMultilineText([
    title,
    row.list_price ? `$${row.list_price}` : null,
    row.list_contact,
    rawDetailText
  ].filter(Boolean).join("\n"));

  return {
    title,
    category: null,
    listingUrl: row.listing_url,
    detailUrl,
    rawDetailText,
    bodyText: rawDetailText,
    cleanText: semanticCleanText,
    postedText: null,
    postedAt: null,
    contactText: row.list_contact,
    whatsappUrl: null,
    mrtArea: null,
    price: row.list_price,
    phone: null,
    wechat: null,
    tags: [],
    parsedFromHtml: false
  };
}
