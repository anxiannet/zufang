import type { CandidateImportStatus, ParsedListingCandidate } from "./types";
import { assessNtuSuitability } from "../../lib/ntuSuitability";
import { assess_listing_intent } from "./listingIntent";

export function decideImportStatus(
  candidate: ParsedListingCandidate,
  context: { valid_image_count: number }
): {
  import_status: Extract<CandidateImportStatus, "parsed" | "needs_review" | "rejected">;
  parse_warnings: string[];
} {
  const warnings = [...new Set(candidate.parse_warnings)];
  const text = `${candidate.parsed_title ?? ""}\n${candidate.parsed_description_clean ?? ""}`;
  const has_contact = Boolean(candidate.parsed_phone || candidate.parsed_wechat);
  const abnormal_price = candidate.parsed_rent_amount !== null
    && (candidate.parsed_rent_amount < 200 || candidate.parsed_rent_amount > 10_000);
  const scam = /保证金解冻|先付款后看房|稳赚|高额回报/i.test(text);
  const listing_intent = assess_listing_intent({
    title: candidate.parsed_title,
    description: candidate.parsed_description_clean
  });
  const storage_room_listing = isStorageRoomListing(candidate);
  const ntu_suitability = assessNtuSuitability({
    title: candidate.parsed_title,
    description: candidate.parsed_description_clean,
    postalCode: candidate.parsed_postal_code,
    area: candidate.parsed_area,
    mrt: candidate.parsed_mrt
  });

  if (storage_room_listing) {
    warnings.push("拒绝依据：储藏室");
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }

  if (context.valid_image_count === 0) {
    warnings.push("无有效房源图片，直接拒绝");
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }

  if (listing_intent.intent === "non_listing" || scam || abnormal_price || ntu_suitability.suitable === false) {
    if (listing_intent.intent === "non_listing") {
      warnings.push(`自动识别：非房源信息（${listing_intent.reason ?? "内容意图不符"}）`);
    }
    if (scam) warnings.push("疑似诈骗内容");
    if (ntu_suitability.suitable === false) warnings.push(`不适合 NTU 学生：${ntu_suitability.reason}`);
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }

  if (!candidate.parsed_postal_code && !candidate.parsed_mrt) {
    warnings.push("缺少邮编，不发布候选房源");
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }
  if (!candidate.parsed_postal_code && candidate.parsed_mrt) {
    warnings.push("缺少邮编，使用 MRT 位置估算");
  }

  const reject_required = [
    !candidate.parsed_title || candidate.parsed_title.length < 4,
    !candidate.parsed_rent_amount,
    !has_contact,
    candidate.parsed_listing_type !== "whole_unit" && !candidate.parsed_room_type,
    candidate.parsed_room_type === "partition_room",
    candidate.parsed_room_type === "maid_room",
    candidate.parsed_is_agent === true,
    candidate.parsed_is_sublet === true
  ].some(Boolean);

  if (!candidate.parsed_rent_amount) warnings.push("未识别租金");
  if (!has_contact) warnings.push("未找到联系方式");
  if (reject_required) {
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }

  if (listing_intent.intent === "uncertain") {
    warnings.push(listing_intent.reason ?? "出租意图不明确，需要人工审核");
  }
  const review_required = candidate.parsed_listing_type === "bedspace"
    || !candidate.parsed_description_clean
    || listing_intent.intent === "uncertain";
  return {
    import_status: review_required ? "needs_review" : "parsed",
    parse_warnings: [...new Set(warnings)]
  };
}

function isStorageRoomListing(candidate: ParsedListingCandidate): boolean {
  if (candidate.parsed_listing_type === "whole_unit") return false;

  const storage_room = /储藏室|储物室|储物间|杂物房|storage\s*room|store\s*room|storeroom|utility\s*room|bomb\s*shelter/i;
  const title = candidate.parsed_title ?? "";
  if (storage_room.test(title)) return true;

  const description = candidate.parsed_description_clean ?? "";
  return /(?:储藏室|储物室|储物间|杂物房)\s*(?:出租|招租)|(?:storage\s*room|store\s*room|storeroom|utility\s*room|bomb\s*shelter)\s*(?:for\s*rent|to\s*let)/i.test(description);
}
