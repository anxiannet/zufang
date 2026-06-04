"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CleanListingRow = {
  id: string;
  source: string | null;
  source_id: string | null;
  title: string | null;
  price: number | null;
  mrt_area: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  landlord_stay: boolean | null;
  gender_preference: string | null;
  status: string | null;
  detail_url: string | null;
  listing_url: string | null;
  clean_version: string | null;
  created_at: string | null;
};

export async function getCleanListings(): Promise<CleanListingRow[]> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("listing_clean")
    .select("id,source,source_id,title,price,mrt_area,room_type,normalized_room_type,cooking_allowed,can_register_address,landlord_stay,gender_preference,status,detail_url,listing_url,clean_version,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as CleanListingRow[];
}
