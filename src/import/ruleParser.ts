import { extractPhone, extractWechat } from "../parser/contactParser";
import { parseListingAvailability } from "../../lib/listingDates";
import { cleanPublicListingDescription } from "../../lib/listingDescription";
import { extractListingFacilities, removeExtractedFacilityText } from "../../lib/listingFacilities";
import { extractListingStructuredFacts } from "../../lib/listingStructuredFacts";
import type { ParsedListingCandidate } from "./types";

type ParseInput = {
  ingestionId: number;
  source: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  title: string | null;
  rawText: string;
  cleanText: string;
  listPrice?: number | null;
  listContact?: string | null;
};

const locations = [
  { pattern: /\bAMK\b|Ang\s+Mo\s+Kio|宏茂桥/i, area: "Ang Mo Kio", mrt: "Ang Mo Kio" },
  { pattern: /Boon\s+Lay|文礼/i, area: "Boon Lay", mrt: "Boon Lay" },
  { pattern: /Pioneer|先驱/i, area: "Jurong West", mrt: "Pioneer" },
  { pattern: /Chinese\s+Garden|裕华园/i, area: "Jurong East", mrt: "Chinese Garden" },
  { pattern: /Jurong\s+West|裕廊西/i, area: "Jurong West", mrt: null },
  { pattern: /Clementi|金文泰/i, area: "Clementi", mrt: "Clementi" },
  { pattern: /Cashew|凯秀/i, area: "Bukit Panjang", mrt: "Cashew" },
  { pattern: /Khatib|卡迪/i, area: "Khatib", mrt: "Khatib" },
  { pattern: /Yishun|义顺/i, area: "Yishun", mrt: "Yishun" },
  { pattern: /\bNUS\b/i, area: "NUS", mrt: null },
  { pattern: /\bNTU\b|南洋理工/i, area: "NTU", mrt: null }
];

export function parseListingByRules(input: ParseInput): ParsedListingCandidate {
  const text = `${input.title ?? ""}\n${input.cleanText}\n${input.listContact ?? ""}`.trim();
  const warnings: string[] = [];
  const title = normalizeTitle(input.title ?? firstLine(input.cleanText));
  const public_description_clean = cleanPublicListingDescription(input.cleanText, title);
  const parsed_facilities = extractListingFacilities(input.cleanText);
  const description_without_facilities = removeExtractedFacilityText(public_description_clean);
  const structured_facts = extractListingStructuredFacts(input.cleanText);
  const rent_amount = parseRent(input.listPrice, text, warnings);
  const phone = extractPhone(`${input.listContact ?? ""}\n${text}`);
  const postal_code = parsePostalCode(text, phone);
  const location = locations.find((item) => item.pattern.test(text));
  const room_type = structured_facts.room_type ?? parseRoomType(input.title ?? "", text);
  const listing_type = parseListingType(text);
  const available = parseAvailable(text);
  const registration = parseBooleanPolicy(
    text,
    /不可报地址|不能报地址|不报地址|不可注册地址/i,
    /可报地址|可以报地址|能报地址|可注册地址/i
  );
  const landlord_staying = parseBooleanPolicy(
    text,
    /无屋主|屋主不同住|房东不同住|无房东/i,
    /屋主同住|房东同住|和屋主住/i
  );

  if (!title || title.length < 4) warnings.push("标题缺失或过短");
  if (!postal_code) warnings.push("未找到邮编");
  if (listing_type !== "whole_unit" && !room_type) warnings.push("无法识别房型");
  if (room_type === "partition_room") warnings.push("疑似隔间房，直接拒绝");
  if (room_type === "maid_room") warnings.push("疑似佣人房，直接拒绝");
  if (listing_type === "bedspace") warnings.push("疑似床位，需要人工审核");
  if (registration === null) warnings.push("报地址信息缺失");
  if (landlord_staying === null) warnings.push("屋主是否同住信息缺失");
  if (!input.cleanText.trim()) warnings.push("正文为空");

  const is_agent = /\b中介\b|\bagent\b|CEA\s*(?:reg|registration)?/i.test(text);
  const is_sublet = /转租|二房东|\bsublet\b/i.test(text);
  if (is_agent) warnings.push("疑似中介，直接拒绝");
  if (is_sublet) warnings.push("疑似转租，直接拒绝");

  const candidate: ParsedListingCandidate = {
    parsed_title: title,
    parsed_description: input.rawText || null,
    parsed_description_clean: description_without_facilities,
    parsed_rent_amount: rent_amount,
    parsed_deposit_amount: parseMoneyAfter(text, /押金|deposit/i),
    parsed_postal_code: postal_code,
    parsed_area: location?.area ?? null,
    parsed_mrt: location?.mrt ?? null,
    parsed_listing_type: listing_type,
    parsed_room_type: listing_type === "whole_unit" ? null : room_type,
    parsed_available_from: available.date ?? structured_facts.available_from,
    parsed_available_note: available.note ?? structured_facts.available_note,
    parsed_min_lease_months: parseLeaseMonths(text) ?? structured_facts.min_lease_months,
    parsed_max_occupants: parseMaxOccupants(text),
    parsed_registration_allowed: registration,
    parsed_landlord_staying: landlord_staying,
    parsed_total_bedrooms: parseCount(text, /(?:整套|全屋|共有)\s*(\d+)\s*(?:房|卧)/i) ?? structured_facts.total_bedrooms,
    parsed_total_bathrooms: parseCount(text, /(?:整套|全屋|共有)\s*(\d+)\s*(?:厕|卫)/i) ?? structured_facts.total_bathrooms,
    parsed_current_occupants_count: parseCount(text, /(?:现住|目前住|当前住)\s*(\d+)\s*人/i),
    parsed_bathroom_shared_with_count: parseCount(text, /(?:共用厕所|共浴|厕所共用)\s*(\d+)\s*人/i),
    parsed_gender_preference: structured_facts.gender_preference ?? parseGender(text),
    parsed_wechat: extractWechat(text),
    parsed_phone: phone,
    parsed_is_owner_direct: /屋主直租|房东本人|不是中介|非中介/i.test(text),
    parsed_is_agent: is_agent,
    parsed_is_sublet: is_sublet,
    parsed_utilities_policy: parseUtilities(text),
    parsed_aircon_policy: parseAircon(text),
    parsed_cooking_policy: parseCooking(text),
    parsed_visitors_policy: parseVisitors(text),
    parsed_smoking_policy: parseSmoking(text),
    parsed_pets_policy: parsePets(text),
    parsed_tenant_type_preference: parseTenantTypes(text),
    parsed_facilities,
    parse_confidence: 0,
    parse_warnings: warnings
  };

  candidate.parse_confidence = calculateConfidence(candidate);
  return candidate;
}

function normalizeTitle(value: string | null): string | null {
  const title = value?.replace(/\s+/g, " ").trim().slice(0, 160) ?? "";
  return title || null;
}

function firstLine(text: string): string | null {
  return text.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? null;
}

function parseRent(listPrice: number | null | undefined, text: string, warnings: string[]): number | null {
  if (/面议/.test(text) && !listPrice) return null;
  const match = text.match(/(?:S\$|SGD|\$)\s*([\d,]{3,6})|([\d,]{3,6})\s*(?:\/月|每月|月租)/i);
  const value = listPrice ?? Number.parseInt((match?.[1] ?? match?.[2] ?? "").replace(/,/g, ""), 10);
  if (!Number.isFinite(value)) return null;
  if (value < 200 || value > 10_000) warnings.push("价格明显异常");
  return value;
}

function parseMoneyAfter(text: string, label: RegExp): number | null {
  const match = text.match(new RegExp(`(?:${label.source})\\s*[:：]?\\s*(?:S\\$|SGD|\\$)?\\s*([\\d,]+)`, "i"));
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function parsePostalCode(text: string, phone: string | null): string | null {
  const explicit_patterns = [
    /(?:邮编|邮政编码|postal\s*code)\s*[:：#]?\s*(\d{6})/i,
    /Singapore\s*[:：,]?\s*(\d{6})/i
  ];
  for (const pattern of explicit_patterns) {
    const value = text.match(pattern)?.[1];
    if (value && value !== phone && !looksLikePriceContext(text, value)) return value;
  }

  const candidates = Array.from(text.matchAll(/(?<![A-Za-z0-9])(\d{6})(?![A-Za-z0-9])/g)).map((match) => match[1]);
  return candidates.find((value) =>
    value !== phone &&
    !looksLikePriceContext(text, value) &&
    !looksLikeAccountContext(text, value)
  ) ?? null;
}

function looksLikePriceContext(text: string, value: string): boolean {
  return new RegExp(`(?:S\\$|SGD|\\$)\\s*${value}|${value}\\s*(?:\\/月|每月)`, "i").test(text);
}

function looksLikeAccountContext(text: string, value: string): boolean {
  return new RegExp(`(?:微信|wechat|账号|ID)\\s*[:：]?\\s*[A-Za-z_]*${value}`, "i").test(text);
}

function parseRoomType(title: string, text: string): string | null {
  const title_match = matchRoomType(title);
  return title_match ?? matchRoomType(text);
}

function matchRoomType(text: string): string | null {
  if (/隔间|隔断|partition/i.test(text)) return "partition_room";
  if (/佣人房|佣人间|maid(?:'s)?\s*room|helper(?:'s)?\s*room/i.test(text)) return "maid_room";
  if (/主人房|主卧|master\s*room|\bmaster\b/i.test(text)) return "master_room";
  if (/普通房|common\s*room|小房|小普通房|单间|房间/i.test(text)) return "common_room";
  if (/studio|单间公寓/i.test(text)) return "studio";
  return null;
}

function parseListingType(text: string): string {
  if (/床位|搭房|bed\s*space|bedspace/i.test(text)) return "bedspace";
  if (/整套|整租|whole\s*unit/i.test(text)) return "whole_unit";
  return "room";
}

function parseAvailable(text: string): { date: string | null; note: string | null } {
  return parseListingAvailability(text);
}

function parseBooleanPolicy(text: string, false_pattern: RegExp, true_pattern: RegExp): boolean | null {
  if (false_pattern.test(text)) return false;
  if (true_pattern.test(text)) return true;
  return null;
}

function parseGender(text: string): string {
  if (/限女生|只租女生|女生优先|female\s*only/i.test(text)) return "female";
  if (/限男生|只租男生|男生优先|male\s*only/i.test(text)) return "male";
  return "any";
}

function parseUtilities(text: string): string | null {
  if (/包到\s*\$?\d+|超出另算/.test(text)) return "capped";
  if (/不包水电|水电另算|水电网另算/.test(text)) return "excluded";
  if (/水电(?:网)?平分|水电(?:网)?均摊/.test(text)) return "shared";
  if (/包水电|包水电网/.test(text)) return "included";
  return null;
}

function parseAircon(text: string): string | null {
  if (/无空调|没有空调|没空调|不带空调/.test(text)) return "not_available";
  if (/限时空调|空调限时/.test(text)) return "limited_hours";
  if (/空调另算|空调费另计/.test(text)) return "extra_charge";
  if (/空调房|有空调|包空调/.test(text)) return "included";
  return null;
}

function parseCooking(text: string): string | null {
  if (/不可煮|不能煮|不可以煮|禁煮|no\s*cooking/i.test(text)) return "no";
  if (/轻煮|简煮|少煮|小煮/.test(text)) return "light";
  if (/可煮|可以煮|厨房随便用|厨房是公共区域|公共厨房|公用厨房|共用厨房|灶台.{0,8}明火|明火.{0,8}灶台/.test(text)) return "full";
  return null;
}

function parseVisitors(text: string): string | null {
  if (/不允许访客|访客禁止|不可带人/.test(text)) return "not_allowed";
  if (/访客需通知|限制访客|偶尔访客/.test(text)) return "limited";
  if (/允许访客|可带访客/.test(text)) return "allowed";
  return null;
}

function parseSmoking(text: string): string | null {
  if (/不可吸烟|禁止吸烟|无烟/.test(text)) return "not_allowed";
  if (/允许吸烟|可吸烟/.test(text)) return "allowed";
  return null;
}

function parsePets(text: string): string | null {
  if (/不可养宠物|不允许宠物|禁止宠物/.test(text)) return "not_allowed";
  if (/允许宠物|可养宠物/.test(text)) return "allowed";
  return null;
}

function parseTenantTypes(text: string): string[] {
  const values: string[] = [];
  if (/学生|student/i.test(text)) values.push("student");
  if (/专业人士|工作人士|professional/i.test(text)) values.push("professional");
  if (/夫妻|couple/i.test(text)) values.push("couple");
  return values;
}

function parseLeaseMonths(text: string): number | null {
  const match = text.match(/(?:最短|min(?:imum)?)?\s*(\d+)\s*(?:个月|月租期|months?)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseMaxOccupants(text: string): number | null {
  return parseCount(text, /(?:最多|只租|限住|限)\s*(\d+)\s*人/i);
}

function parseCount(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number.parseInt(match[1], 10) : null;
}

function calculateConfidence(candidate: ParsedListingCandidate): number {
  const fields = [
    candidate.parsed_title,
    candidate.parsed_rent_amount,
    candidate.parsed_phone ?? candidate.parsed_wechat,
    candidate.parsed_postal_code,
    candidate.parsed_room_type,
    candidate.parsed_area ?? candidate.parsed_mrt
  ];
  return Number((fields.filter((value) => value !== null && value !== "").length / fields.length).toFixed(3));
}
