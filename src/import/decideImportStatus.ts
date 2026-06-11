import type { CandidateImportStatus, ParsedListingCandidate } from "./types";

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

  if (non_rental || scam || abnormal_price) {
    if (non_rental) warnings.push("疑似非租房内容");
    if (scam) warnings.push("疑似诈骗内容");
    return { import_status: "rejected", parse_warnings: [...new Set(warnings)] };
  }

  const review_required = [
    !candidate.parsed_title || candidate.parsed_title.length < 4,
    !candidate.parsed_rent_amount,
    !has_contact,
    !candidate.parsed_postal_code,
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
