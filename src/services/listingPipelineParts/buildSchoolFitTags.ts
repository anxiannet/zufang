import { ListingCleanRow } from "./types";

export function buildSchoolFitTags(
  row: ListingCleanRow,
  context: { nearNtu: boolean; studentFriendly: boolean }
): string[] {
  const tags = new Set<string>();
  const text = `${row.title}\n${row.mrt_area ?? ""}\n${row.clean_text ?? ""}\n${row.address_text ?? ""}`;

  if (context.nearNtu || /ntu|南洋理工|boon lay|pioneer|jurong|lakeside|文礼|先驱|裕廊/i.test(text)) tags.add("NTU");
  if (/nus|国大|kent ridge|clementi|dover|one-north|金文泰/i.test(text)) tags.add("NUS");
  if (/smu|管理大学|bras basah|dhoby ghaut|bugis|city hall/i.test(text)) tags.add("SMU");
  if (/sutd|科技设计大学|expo|upper changi|simei|tampines/i.test(text)) tags.add("SUTD");
  if (/student|学生|留学|大学|school|campus/i.test(text)) tags.add("STUDENT");
  if (context.studentFriendly) tags.add("STUDENT_FRIENDLY");

  return Array.from(tags);
}
