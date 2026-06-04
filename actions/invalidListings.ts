"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type InvalidListingRow = {
  id: string;
  source: string | null;
  source_id: string | null;
  title: string | null;
  price: number | null;
  mrt_area: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  detail_url: string | null;
  listing_url: string | null;
  status: string | null;
  raw_snapshot: Record<string, unknown> | null;
  created_at: string | null;
};

export async function getInvalidListings(): Promise<InvalidListingRow[]> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("listing_clean")
    .select("id,source,source_id,title,price,mrt_area,room_type,normalized_room_type,detail_url,listing_url,status,raw_snapshot,created_at")
    .eq("status", "invalid")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as InvalidListingRow[];
}
