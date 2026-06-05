"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IndexListingRow } from "@/actions/indexListings";

export type SearchDebugResult = IndexListingRow & {
  debug_score: number;
  debug_reasons: string[];
};

export async function searchDebugListings(query: string): Promise<SearchDebugResult[]> {
  await requireRole(["admin"]);
  const keyword = query.trim();
  if (!keyword) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("listing_indexes")
    .select("id,source,source_id,clean_listing_id,title,summary,price,mrt_area,room_type,normalized_room_type,cooking_allowed,can_register_address,landlord_stay,gender_preference,near_ntu,ntu_score,student_friendly,match_reasons,school_fit_tags,semantic_tags,status,indexed_at,search_text")
    .eq("status", "active")
    .or(buildOrFilter(keyword))
    .limit(100);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<IndexListingRow & { search_text?: string | null }> )
    .map((row) => scoreDebugResult(row, keyword))
    .sort((a, b) => b.debug_score - a.debug_score || (b.ntu_score ?? 0) - (a.ntu_score ?? 0))
    .slice(0, 50);
}

function buildOrFilter(keyword: string): string {
  const terms = expandQueryTerms(keyword);
  const escaped = terms.map(escapeLikeTerm);
  return escaped
    .flatMap((term) => [
      `title.ilike.%${term}%`,
      `summary.ilike.%${term}%`,
      `search_text.ilike.%${term}%`,
      `mrt_area.ilike.%${term}%`
    ])
    .join(",");
}

function scoreDebugResult(row: IndexListingRow & { search_text?: string | null }, query: string): SearchDebugResult {
  const terms = expandQueryTerms(query);
  const haystack = [
    row.title,
    row.summary,
    row.mrt_area,
    row.room_type,
    row.normalized_room_type,
    row.search_text,
    ...(row.match_reasons ?? []),
    ...(row.school_fit_tags ?? []),
    ...(row.semantic_tags ?? [])
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  for (const term of terms) {
    if (haystack.includes(term.toLowerCase())) {
      score += 10;
      reasons.push(`keyword:${term}`);
    }
  }

  if (/ntu|南洋理工/i.test(query) && ((row.school_fit_tags ?? []).includes("NTU") || (row.semantic_tags ?? []).includes("NTU_MATCH") || row.near_ntu)) {
    score += 50;
    reasons.push("NTU_MATCH");
  }

  if (/普通房|common/i.test(query) && row.normalized_room_type === "common_room") {
    score += 30;
    reasons.push("ROOM_COMMON");
  }

  if (/主人房|主卧|master/i.test(query) && row.normalized_room_type === "master_room") {
    score += 30;
    reasons.push("ROOM_MASTER");
  }

  if (/单人房|单人间|隔间|partition/i.test(query) && (row.normalized_room_type === "single_room" || row.normalized_room_type === "partition_room")) {
    score += 30;
    reasons.push("ROOM_SINGLE");
  }

  if (/可煮|煮饭|cooking/i.test(query) && row.cooking_allowed === true) {
    score += 25;
    reasons.push("COOKING_ALLOWED");
  }

  const maxPrice = extractMaxPrice(query);
  if (maxPrice !== null && row.price !== null && row.price <= maxPrice) {
    score += 25;
    reasons.push(`PRICE<=${maxPrice}`);
  }

  score += Math.min(row.ntu_score ?? 0, 100) / 10;

  return {
    ...row,
    debug_score: Math.round(score * 10) / 10,
    debug_reasons: Array.from(new Set(reasons))
  };
}

function expandQueryTerms(query: string): string[] {
  const rawTerms = query
    .split(/[\s,，。]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  const terms = new Set(rawTerms);

  if (/ntu|南洋理工/i.test(query)) {
    ["NTU", "南洋理工", "boon lay", "pioneer", "jurong", "文礼", "先驱", "裕廊"].forEach((term) => terms.add(term));
  }
  if (/普通房|common/i.test(query)) {
    ["普通房", "普通间", "COMMON_ROOM", "common_room", "common room"].forEach((term) => terms.add(term));
  }
  if (/主人房|主卧|master/i.test(query)) {
    ["主人房", "主卧", "MASTER_ROOM", "master_room", "master room"].forEach((term) => terms.add(term));
  }
  if (/单人房|单人间|隔间|partition/i.test(query)) {
    ["单人房", "小单人房", "单人间", "小单人间", "隔间", "储物间", "佣人房", "SINGLE_ROOM", "single_room", "PARTITION_ROOM", "partition_room", "partition"].forEach((term) => terms.add(term));
  }
  if (/可煮|煮饭|cooking/i.test(query)) {
    ["可煮", "可以煮", "COOKING_ALLOWED", "cooking_allowed", "cooking"].forEach((term) => terms.add(term));
  }

  return Array.from(terms).slice(0, 24);
}

function extractMaxPrice(query: string): number | null {
  const match = query.match(/(?:\$|sgd)?\s*(\d{3,5})\s*(?:以内|以下|below|under|以内)/i);
  if (!match) {
    const simple = query.match(/(\d{3,5})/);
    if (!simple) return null;
    return Number.parseInt(simple[1], 10);
  }
  return Number.parseInt(match[1], 10);
}

function escapeLikeTerm(term: string): string {
  return term.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
}
