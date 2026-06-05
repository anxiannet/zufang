import { ListingIndexRow } from "../../models/listing";
import { cleanMultilineText, cleanText } from "../../utils/textClean";
import { ListingCleanRow } from "./types";
import { buildSchoolFitTags } from "./buildSchoolFitTags";
import { buildSemanticTags } from "./buildSemanticTags";
import { isNearNtu, isStudentFriendly, scoreNtuFit } from "./scoring";

export function buildIndex(cleanRow: ListingCleanRow): ListingIndexRow {
  const nearNtu = isNearNtu(cleanRow);
  const ntuScore = scoreNtuFit(cleanRow);
  const studentFriendly = isStudentFriendly(cleanRow);
  const matchReasons = buildMatchReasons(cleanRow);
  const schoolFitTags = buildSchoolFitTags(cleanRow, { nearNtu, studentFriendly });
  const semanticTags = buildSemanticTags(cleanRow, { nearNtu, studentFriendly, schoolFitTags });

  const baseSearchText = buildSearchText({
    title: cleanRow.title,
    mrtArea: cleanRow.mrt_area,
    price: cleanRow.price,
    tags: cleanRow.tags,
    cleanText: cleanRow.clean_text ?? "",
    roomType: cleanRow.room_type,
    normalizedRoomType: cleanRow.normalized_room_type,
    amenities: cleanRow.amenities,
    addressText: cleanRow.address_text,
    postalCode: cleanRow.postal_code
  });

  const searchText = cleanMultilineText([
    baseSearchText,
    matchReasons.join(" "),
    schoolFitTags.join(" "),
    semanticTags.join(" ")
  ].filter(Boolean).join("\n"));

  return {
    source: cleanRow.source,
    source_id: cleanRow.source_id,
    clean_listing_id: cleanRow.id,
    title: cleanRow.title,
    summary: buildSummary(cleanRow.clean_text ?? ""),
    price: cleanRow.price,
    mrt_area: cleanRow.mrt_area,
    tags: cleanRow.tags,
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
    near_ntu: nearNtu,
    ntu_score: ntuScore,
    student_friendly: studentFriendly,
    match_reasons: matchReasons,
    school_fit_tags: schoolFitTags,
    semantic_tags: semanticTags,
    status: cleanRow.status
  };
}

export function buildSummary(cleanTextValue: string): string | null {
  const value = cleanText(cleanTextValue).slice(0, 220);
  return value || null;
}

export function buildSearchText(input: {
  title: string;
  mrtArea: string | null;
  price: number | null;
  tags: string[];
  cleanText: string;
  roomType: string | null;
  normalizedRoomType: string;
  amenities: string[];
  addressText: string | null;
  postalCode: string | null;
}): string {
  return cleanMultilineText([
    input.title,
    input.mrtArea,
    input.price ? `$${input.price}` : null,
    input.tags.join(" "),
    input.roomType,
    input.normalizedRoomType,
    input.amenities.join(" "),
    input.addressText,
    input.postalCode,
    input.cleanText
  ].filter(Boolean).join("\n"));
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
