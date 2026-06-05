"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type IndexListingRow = {
  id: string;
  source: string | null;
  source_id: string | null;
  clean_listing_id: string | null;
  title: string | null;
  summary: string | null;
  price: number | null;
  mrt_area: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  landlord_stay: boolean | null;
  gender_preference: string | null;
  near_ntu: boolean | null;
  ntu_score: number | null;
  student_friendly: boolean | null;
  match_reasons: string[] | null;
  school_fit_tags: string[] | null;
  semantic_tags: string[] | null;
  status: string | null;
  indexed_at: string | null;
};

export async function getIndexListings(): Promise<IndexListingRow[]> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("listing_indexes")
    .select("id,source,source_id,clean_listing_id,title,summary,price,mrt_area,room_type,normalized_room_type,cooking_allowed,can_register_address,landlord_stay,gender_preference,near_ntu,ntu_score,student_friendly,match_reasons,school_fit_tags,semantic_tags,status,indexed_at")
    .order("indexed_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as IndexListingRow[];
}
