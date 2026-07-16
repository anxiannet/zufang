import { parseListingAvailability } from "./listingDates";

export type ListingStructuredFacts = {
  room_type: string | null;
  total_bedrooms: number | null;
  total_bathrooms: number | null;
  available_from: string | null;
  available_note: string | null;
  min_lease_months: number | null;
  gender_preference: string | null;
};

export function extractListingStructuredFacts(value: string | null | undefined): ListingStructuredFacts {
  const text = normalizeText(stripHtml(value ?? ""));
  const availability = parseListingAvailability(text);

  return {
    room_type: parseRoomTypeFact(text),
    ...parseLayoutCounts(text),
    available_from: availability.date,
    available_note: availability.note,
    min_lease_months: parseLeaseMonthsFact(text),
    gender_preference: parseGenderFact(text)
  };
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function parseRoomTypeFact(text: string) {
  if (/房间\s*[:：][^\n]*(?:普通房|common\s*room|小房|单人房|单间)/i.test(text)) return "common_room";
  if (/房间\s*[:：][^\n]*(?:主人房|主卧|master)/i.test(text)) return "master_room";
  if (/房间\s*[:：][^\n]*(?:studio|单间公寓)/i.test(text)) return "studio";
  if (/房间\s*[:：][^\n]*(?:隔间|隔断|partition)/i.test(text)) return "partition_room";
  if (/房间\s*[:：][^\n]*(?:佣人房|佣人间|maid|helper)/i.test(text)) return "maid_room";
  return null;
}

function parseLayoutCounts(text: string): { total_bedrooms: number | null; total_bathrooms: number | null } {
  const match = text.match(/\((\d+)\s*b\s*(\d+)\s*b\)/i) ?? text.match(/\b(\d+)\s*b\s*(\d+)\s*b\b/i);
  if (!match) return { total_bedrooms: null, total_bathrooms: null };
  return {
    total_bedrooms: Number.parseInt(match[1], 10),
    total_bathrooms: Number.parseInt(match[2], 10)
  };
}

function parseLeaseMonthsFact(text: string) {
  if (/至少\s*一\s*年|至少\s*1\s*年|minimum\s*1\s*year/i.test(text)) return 12;
  const year_match = text.match(/至少\s*(\d+)\s*年/);
  if (year_match) return Number.parseInt(year_match[1], 10) * 12;
  return null;
}

function parseGenderFact(text: string) {
  if (/(?:条件|性别|要求)\s*[:：]?\s*(?:男生|男士|男|male)/i.test(text)) return "male";
  if (/(?:条件|性别|要求)\s*[:：]?\s*(?:女生|女士|女|female)/i.test(text)) return "female";
  return null;
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+|[ \t]+\n/g, "\n")
    .trim();
}
