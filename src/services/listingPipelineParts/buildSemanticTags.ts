import { ListingCleanRow } from "./types";

export function buildSemanticTags(
  row: ListingCleanRow,
  context: { nearNtu: boolean; studentFriendly: boolean; schoolFitTags: string[] }
): string[] {
  const tags = new Set<string>();

  if (row.normalized_room_type === "master_room") tags.add("MASTER_ROOM");
  if (row.normalized_room_type === "common_room") tags.add("COMMON_ROOM");
  if (row.normalized_room_type === "small_common_room") tags.add("SMALL_COMMON_ROOM");
  if (row.normalized_room_type === "partition_room") tags.add("PARTITION_ROOM");
  if (row.normalized_room_type === "bed_space") tags.add("BEDSPACE");
  if (row.normalized_room_type === "studio") tags.add("STUDIO");
  if (row.normalized_room_type === "whole_unit") tags.add("WHOLE_UNIT");

  if (row.cooking_allowed === true) tags.add("COOKING_ALLOWED");
  if (row.cooking_allowed === false) tags.add("NO_COOKING");
  if (row.can_register_address === true) tags.add("REGISTER_ADDRESS");
  if (row.can_register_address === false) tags.add("NO_REGISTER_ADDRESS");
  if (row.landlord_stay === true) tags.add("LANDLORD_STAY");
  if (row.landlord_stay === false) tags.add("NO_LANDLORD");

  if (row.gender_preference === "female_only") tags.add("FEMALE_ONLY");
  if (row.gender_preference === "male_only") tags.add("MALE_ONLY");
  if (row.gender_preference === "couple_allowed") tags.add("COUPLE_ALLOWED");
  if (row.gender_preference === "single_only") tags.add("SINGLE_ONLY");
  if (row.amenities.includes("near_mrt")) tags.add("NEAR_MRT");

  if (row.price !== null && row.price <= 900) tags.add("LOW_BUDGET");
  if (row.price !== null && row.price > 900 && row.price <= 1500) tags.add("MID_BUDGET");
  if (row.price !== null && row.price > 1500) tags.add("HIGH_BUDGET");

  if (context.studentFriendly) tags.add("STUDENT_FRIENDLY");
  if (context.nearNtu) tags.add("NTU_FRIENDLY");
  if (context.schoolFitTags.includes("NTU")) tags.add("NTU_MATCH");
  if (context.schoolFitTags.includes("NUS")) tags.add("NUS_MATCH");
  if (context.schoolFitTags.includes("SMU")) tags.add("SMU_MATCH");
  if (context.schoolFitTags.includes("SUTD")) tags.add("SUTD_MATCH");

  return Array.from(tags);
}
