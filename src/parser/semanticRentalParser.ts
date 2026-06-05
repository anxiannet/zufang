import { createHash } from "node:crypto";

export type NormalizedRoomType =
  | "master_room"
  | "common_room"
  | "single_room"
  | "studio"
  | "unknown";

export type RentalBoolean = boolean | null;

export interface SemanticRentalFields {
  roomType: string | null;
  normalizedRoomType: NormalizedRoomType;
  isInvalidListing: boolean;
  invalidReasons: string[];
  availableFrom: Date | null;
  cookingAllowed: RentalBoolean;
  canRegisterAddress: RentalBoolean;
  landlordStay: RentalBoolean;
  bathroomType: string | null;
  sharedBathroomCount: number | null;
  currentTenantCount: number | null;
  genderPreference: string | null;
  amenities: string[];
  addressText: string | null;
  postalCode: string | null;
  imageUrls: string[];
  fingerprint: string;
  rawSnapshot: Record<string, unknown>;
}

type ParseInput = {
  title: string | null;
  category: string | null;
  mrtArea: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  tags: string[];
  bodyText: string | null;
  rawDetailText: string;
  detailUrl: string;
  imageUrls?: string[];
};

export function parseSemanticRentalFields(input: ParseInput): SemanticRentalFields {
  const text = normalizeText([
    input.title,
    input.category,
    input.mrtArea,
    input.tags.join(" "),
    input.bodyText,
    input.rawDetailText
  ].filter(Boolean).join("\n"));

  const invalidReasons = detectInvalidReasons(text);
  const roomType = detectRoomTypeText(text);
  const normalizedRoomType = normalizeRoomType(text, roomType);
  const availableFrom = detectAvailableFrom(text);
  const cookingAllowed = detectCookingAllowed(text);
  const canRegisterAddress = detectCanRegisterAddress(text);
  const landlordStay = detectLandlordStay(text);
  const sharedBathroomCount = detectSharedBathroomCount(text);
  const currentTenantCount = detectCurrentTenantCount(text);
  const genderPreference = detectGenderPreference(text);
  const amenities = detectAmenities(text);
  const addressText = detectAddressText(text);
  const postalCode = detectPostalCode(text);
  const bathroomType = detectBathroomType(text, sharedBathroomCount);
  const imageUrls = unique(input.imageUrls ?? []);
  const fingerprint = buildListingFingerprint({
    title: input.title,
    price: input.price,
    phone: input.phone,
    wechat: input.wechat,
    mrtArea: input.mrtArea,
    normalizedRoomType
  });

  return {
    roomType,
    normalizedRoomType,
    isInvalidListing: invalidReasons.length > 0,
    invalidReasons,
    availableFrom,
    cookingAllowed,
    canRegisterAddress,
    landlordStay,
    bathroomType,
    sharedBathroomCount,
    currentTenantCount,
    genderPreference,
    amenities,
    addressText,
    postalCode,
    imageUrls,
    fingerprint,
    rawSnapshot: {
      title: input.title,
      category: input.category,
      mrt_area: input.mrtArea,
      price: input.price,
      phone: input.phone,
      wechat: input.wechat,
      tags: input.tags,
      body_text: input.bodyText,
      raw_detail_text: input.rawDetailText,
      detail_url: input.detailUrl,
      semantic_text: text,
      invalid_reasons: invalidReasons
    }
  };
}

export function buildListingFingerprint(input: {
  title: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  mrtArea: string | null;
  normalizedRoomType?: string | null;
}): string {
  const normalized = [
    normalizeText(input.title ?? ""),
    input.price ?? "",
    normalizePhone(input.phone),
    normalizeText(input.wechat ?? ""),
    normalizeText(input.mrtArea ?? ""),
    input.normalizedRoomType ?? ""
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

function detectInvalidReasons(text: string): string[] {
  const reasons: string[] = [];
  if (/床位|搭房|搭铺|床铺|床位出租|bed\s*space|bedspace/i.test(text)) reasons.push("bedspace_or_shared_bed");
  if (/日租|按天租|短租几天|小时房|daily\s*(rental|stay)|hourly/i.test(text)) reasons.push("daily_or_hourly_rental");
  return reasons;
}

function normalizeRoomType(text: string, roomType: string | null): NormalizedRoomType {
  const source = `${roomType ?? ""}\n${text}`;

  if (roomType && /studio|单间公寓|一房式公寓|studio\s*apartment/i.test(roomType)) return "studio";
  if (roomType && /主人房|主卧|master\s*room/i.test(roomType)) return "master_room";
  if (roomType && /普通房|普通间|大普通房|小普通房|客房|common\s*room/i.test(roomType)) return "common_room";
  if (roomType && /单人房|小单人房|单人间|小单人间|隔间|隔断|隔房|客厅房|客厅隔间|厅房|厅隔|佣人房|佣人间|储藏室|储物间|杂物房|utility\s*room|bomb\s*shelter|partition/i.test(roomType)) {
    return "single_room";
  }

  if (/studio|单间公寓|一房式公寓|studio\s*apartment/i.test(source)) return "studio";
  if (/主人房|主卧|master\s*room/i.test(source)) return "master_room";
  if (/普通房|普通间|大普通房|小普通房|客房|common\s*room/i.test(source)) return "common_room";
  if (/单人房|小单人房|单人间|小单人间|隔间|隔断|隔房|客厅房|客厅隔间|厅房|厅隔|佣人房|佣人间|储藏室|储物间|杂物房|utility\s*room|bomb\s*shelter|partition/i.test(source)) {
    return "single_room";
  }
  return "unknown";
}

function detectRoomTypeText(text: string): string | null {
  const patterns = [
    /studio|单间公寓|一房式公寓|studio\s*apartment/i,
    /主人房|主卧|master\s*room/i,
    /大普通房|小普通房|普通房|普通间|客房|common\s*room/i,
    /单人房|小单人房|单人间|小单人间|隔间|隔断|隔房|客厅房|客厅隔间|厅房|厅隔|佣人房|佣人间|储藏室|储物间|杂物房|utility\s*room|bomb\s*shelter|partition/i,
    /床位|搭房|搭铺|床铺|床位出租|bed\s*space|bedspace/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return null;
}

function detectCookingAllowed(text: string): RentalBoolean {
  if (/不能煮|不可煮|不可以煮|禁止煮|不能做饭|不可做饭|no\s*cooking/i.test(text)) return false;
  if (/可煮|可以煮|能煮|可小煮|可轻煮|煮饭|cooking\s*allowed/i.test(text)) return true;
  return null;
}

function detectCanRegisterAddress(text: string): RentalBoolean {
  if (/不可报地址|不能报地址|不可以报地址|不能注册地址|不可注册地址|no\s*(address\s*)?registration/i.test(text)) return false;
  if (/可报地址|可以报地址|能报地址|可注册地址|可申报地址|address\s*registration/i.test(text)) return true;
  return null;
}

function detectLandlordStay(text: string): RentalBoolean {
  if (/无屋主|没有屋主|屋主不同住|房东不同住|无房东|no\s*(owner|landlord)/i.test(text)) return false;
  if (/屋主同住|房东同住|和屋主住|owner\s*stay|landlord\s*stay/i.test(text)) return true;
  return null;
}

function detectGenderPreference(text: string): string | null {
  if (/限女生|只限女生|女生优先|女搭房|女租客|female\s*only|lad(y|ies)\s*only/i.test(text)) return "female_only";
  if (/限男生|只限男生|男生优先|男搭房|男租客|male\s*only/i.test(text)) return "male_only";
  if (/夫妻|情侣|couple/i.test(text)) return "couple_allowed";
  if (/单人|一人|只住一人|single\s*(pax|person|tenant)/i.test(text)) return "single_only";
  return null;
}

function detectSharedBathroomCount(text: string): number | null {
  const patterns = [
    /共浴\s*(\d+)\s*人/,
    /共用厕所\s*(\d+)\s*人/,
    /厕所共\s*(\d+)\s*人/,
    /share(?:d)?\s*(?:bathroom|toilet)\s*(?:with)?\s*(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }

  return null;
}

function detectCurrentTenantCount(text: string): number | null {
  const patterns = [
    /已住\s*(\d+)\s*人/,
    /现住\s*(\d+)\s*人/,
    /目前\s*(\d+)\s*人住/,
    /current(?:ly)?\s*(\d+)\s*(?:tenant|pax|people)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }

  return null;
}

function detectBathroomType(text: string, sharedBathroomCount: number | null): string | null {
  if (/独立厕所|独立卫生间|独卫|private\s*(bathroom|toilet)/i.test(text)) return "private_bathroom";
  if (/共用厕所|公用厕所|共浴|shared\s*(bathroom|toilet)/i.test(text) || sharedBathroomCount !== null) {
    return "shared_bathroom";
  }
  return null;
}

function detectAmenities(text: string): string[] {
  const amenityMap: Array<[string, RegExp]> = [
    ["aircon", /空调|冷气|aircon|air\s*con/i],
    ["wifi", /网络|网线|wifi|wi-fi/i],
    ["furnished", /家具|家私|带家具|furnished/i],
    ["washer", /洗衣机|washer/i],
    ["fridge", /冰箱|fridge|refrigerator/i],
    ["desk", /书桌|写字桌|desk/i],
    ["wardrobe", /衣柜|wardrobe/i],
    ["near_mrt", /近地铁|靠近地铁|near\s*mrt/i],
    ["utilities_included", /包水电|包水电网|utilities\s*included/i]
  ];

  return amenityMap.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function detectAvailableFrom(text: string): Date | null {
  if (/马上入住|即刻入住|立即入住|随时入住|available\s*(now|immediately)/i.test(text)) {
    return new Date();
  }

  const isoLike = text.match(/(?:入住|available\s*from)\s*[:：]?\s*(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/i);
  if (isoLike) return toDate(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));

  const dayMonth = text.match(/(?:入住|available\s*from)\s*[:：]?\s*(\d{1,2})[-/.月](\d{1,2})(?:日)?/i);
  if (dayMonth) {
    const now = new Date();
    return toDate(now.getFullYear(), Number(dayMonth[1]), Number(dayMonth[2]));
  }

  return null;
}

function detectAddressText(text: string): string | null {
  const blockMatch = text.match(/(?:大牌|blk|block)\s*\d+[a-z]?/i);
  if (blockMatch) return blockMatch[0];

  const condoMatch = text.match(/(?:公寓|condo|residence|residences|the\s+[a-z0-9 ]{3,40})/i);
  return condoMatch ? condoMatch[0].trim() : null;
}

function detectPostalCode(text: string): string | null {
  const match = text.match(/(?:邮编|postal(?:\s*code)?|singapore|s\(?)(\d{6})\)?/i) ?? text.match(/\b(\d{6})\b/);
  return match?.[1] ?? null;
}

function toDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePhone(value: string | null): string {
  return (value ?? "").replace(/\D+/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
