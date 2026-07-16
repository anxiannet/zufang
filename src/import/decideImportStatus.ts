import type { CandidateImportStatus, ParsedListingCandidate } from "./types";
import { assessNtuSuitability } from "../../lib/ntuSuitability";

export function decideImportStatus(candidate: ParsedListingCandidate): {
  import_status: Extract<CandidateImportStatus, "parsed" | "needs_review" | "rejected">;
  parse_warnings: string[];
} {
  const warnings = [...new Set(candidate.parse_warnings)];
  const text = `${candidate.parsed_title ?? ""}\n${candidate.parsed_description_clean ?? ""}`;
  const has_contact = Boolean(candidate.parsed_phone || candidate.parsed_wechat);
  const abnormal_price = candidate.parsed_rent_amount !== null
    && (candidate.parsed_rent_amount < 200 || candidate.parsed_rent_amount > 10_000);
  const non_rental = /招聘|求职|二手|出售手机|贷款|博彩|赌博|刷单|代购/i.test(text)
    && !/出租|租房|房间|主人房|普通房|整租/i.test(text);
  const scam = /保证金解冻|先付款后看房|稳赚|高额回报/i.test(text);
  const ntu_suitability = assessNtuSuitability({
    title: candidate.parsed_title,
    description: candidate.parsed_description_clean,
    postalCode: candidate.parsed_postal_code,
    area: candidate.parsed_area,
    mrt: candidate.parsed_mrt
  });

  if (non_rental || scam || abnormal_price || ntu_suitability.suitable === false) {
    if (non_rental) warnings.push("疑似非租房内容");
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

  const review_required = [
    !candidate.parsed_title || candidate.parsed_title.length < 4,
    !candidate.parsed_rent_amount,
    !candidate.parsed_postal_code,
    !has_contact,
    candidate.parsed_listing_type !== "whole_unit" && !candidate.parsed_room_type,
    candidate.parsed_room_type === "partition_room",
    candidate.parsed_room_type === "maid_room",
    candidate.parsed_listing_type === "bedspace",
    candidate.parsed_is_agent === true,
    candidate.parsed_is_sublet === true,
    candidate.parsed_registration_allowed === null,
    candidate.parsed_landlord_staying === null,
    !candidate.parsed_description_clean
  ].some(Boolean);

  if (!has_contact) warnings.push("未找到联系方式");
  return {
    import_status: review_required ? "needs_review" : "parsed",
    parse_warnings: [...new Set(warnings)]
  };
}
