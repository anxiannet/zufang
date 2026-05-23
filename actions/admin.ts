"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function publishListing(listingId: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ status: "published", rejection_reason: null }).eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/rent");
}

export async function rejectListing(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const listingId = String(formData.get("listing_id"));
  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim();
  const { error } = await supabase
    .from("listings")
    .update({ status: "rejected", rejection_reason: rejectionReason })
    .eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function unpublishListing(listingId: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ status: "draft" }).eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/rent");
}

export async function getAdminDashboard() {
  const supabase = await createClient();

  const [pending, users, enquiries, anomalies] = await Promise.all([
    supabase.from("listings").select("id,title,rent_amount,postal_code,street_name,created_at").eq("status", "pending_review").order("created_at", { ascending: false }),
    supabase.from("users_profile").select("id,display_name,role,phone,whatsapp,wechat,created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("enquiries").select("id,message,status,created_at,listing_id,tenant_id").order("created_at", { ascending: false }).limit(80),
    supabase
      .from("listings")
      .select("id,title,rent_amount,postal_code,street_name")
      .or("rent_amount.lt.400,rent_amount.gt.10000,postal_code.is.null,street_name.is.null")
      .limit(80)
  ]);

  const listingIds = [...(pending.data ?? []), ...(anomalies.data ?? [])].map((listing) => listing.id);
  const { data: imageRows } = listingIds.length
    ? await supabase.from("listing_images").select("listing_id,id").in("listing_id", listingIds)
    : { data: [] };
  const imageCount = new Map<string, number>();
  for (const image of imageRows ?? []) imageCount.set(image.listing_id, (imageCount.get(image.listing_id) ?? 0) + 1);

  const withImageCounts = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, listing_images: Array.from({ length: imageCount.get(row.id) ?? 0 }) }));

  return {
    pending: withImageCounts(pending.data ?? []),
    users: users.data ?? [],
    enquiries: enquiries.data ?? [],
    anomalies: withImageCounts(anomalies.data ?? []).filter((listing: any) => !listing.listing_images?.length || listing.rent_amount < 400 || listing.rent_amount > 10000 || !listing.street_name)
  };
}
