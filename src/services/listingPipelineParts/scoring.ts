import { ListingCleanRow } from "./types";

export function isNearNtu(row: ListingCleanRow): boolean {
  const text = `${row.title}\n${row.mrt_area ?? ""}\n${row.clean_text ?? row.body_text ?? ""}\n${row.address_text ?? ""}`;
  return /ntu|南洋理工|jurong|boon lay|pioneer|文礼|先驱|裕廊/i.test(text);
}

export function scoreNtuFit(row: ListingCleanRow): number {
  let score = 0;
  if (isNearNtu(row)) score += 40;
  if (row.price !== null && row.price <= 1200) score += 20;
  if (row.cooking_allowed) score += 10;
  if (row.can_register_address) score += 10;
  if (row.amenities.includes("near_mrt")) score += 10;
  if (row.normalized_room_type !== "unknown") score += 10;
  return Math.min(score, 100);
}

export function isStudentFriendly(row: ListingCleanRow): boolean {
  return scoreNtuFit(row) >= 50 || /学生|student/i.test(`${row.title}\n${row.clean_text ?? row.body_text ?? ""}`);
}
