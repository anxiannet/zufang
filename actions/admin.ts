"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function updateListingModeration(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const listingId = String(formData.get("listing_id") ?? "");
  const { error } = await supabase
    .from("listings")
    .update({
      verification_status: String(formData.get("verification_status") ?? "unverified"),
      contact_visibility: String(formData.get("contact_visibility") ?? "private"),
      internal_note: String(formData.get("internal_note") ?? "").trim() || null
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function appointAdmin(formData: FormData) {
  await requireRole(["admin"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/admin?admin_error=missing_email");

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) redirect("/admin?admin_error=auth_lookup_failed");

  const user = data.users.find((item) => item.email?.toLowerCase() === email);
  if (!user) redirect("/admin?admin_error=user_not_found");

  const displayName = email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const { error: profileError } = await adminSupabase.from("users_profile").upsert(
    {
      id: user.id,
      auth_user_id: user.id,
      role: "admin",
      display_name: displayName || email,
      preferred_language: "zh"
    },
    { onConflict: "auth_user_id" }
  );

  if (profileError) redirect("/admin?admin_error=profile_update_failed");

  revalidatePath("/admin");
  redirect(`/admin?admin_success=${encodeURIComponent(email)}`);
}

export async function deleteIngestionListing(listingId: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("ingestion_listings").delete().eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ingestion");
}

export async function getAdminDashboard() {
  const supabase = await createClient();

  const [pending, users, enquiries, anomalies] = await Promise.all([
    supabase
      .from("listings")
      .select("id,listing_no,title,rent_amount,postal_code,source,verification_status,contact_visibility,is_owner_direct,is_agent,is_sublet,internal_note,created_at")
      .eq("status", "pending_review")
      .order("created_at", { ascending: false }),
    supabase.from("users_profile").select("id,display_name,role,phone,whatsapp,wechat,created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("enquiries").select("id,message,status,created_at,listing_id,tenant_id").order("created_at", { ascending: false }).limit(80),
    supabase
      .from("listings")
      .select("id,listing_no,title,rent_amount,postal_code,source,verification_status,is_owner_direct,is_agent,is_sublet")
      .or("rent_amount.lt.400,rent_amount.gt.10000,postal_code.is.null")
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
    anomalies: withImageCounts(anomalies.data ?? []).filter((listing: any) => !listing.listing_images?.length || listing.rent_amount < 400 || listing.rent_amount > 10000 || !listing.postal_code)
  };
}

export type IngestionListingFilters = {
  q?: string | string[];
  source?: string | string[];
  is_top?: string | string[];
};

export async function getIngestionListings(filters: IngestionListingFilters = {}) {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const value = (key: keyof IngestionListingFilters) => {
    const raw = filters[key];
    return Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  };

  let query = supabase
    .from("ingestion_listings")
    .select("id,source,source_id,listing_url,detail_url,list_title,list_price,list_contact,list_raw_html,list_raw_text,raw_detail_html,is_top,scraped_at,created_at")
    .order("scraped_at", { ascending: false })
    .limit(100);

  const keyword = value("q");
  if (keyword) {
    const escaped = keyword.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    query = query.or(`list_title.ilike.%${escaped}%,list_raw_text.ilike.%${escaped}%,source_id.ilike.%${escaped}%,list_contact.ilike.%${escaped}%`);
  }

  const source = value("source");
  if (source) query = query.eq("source", source);

  if (value("is_top") === "true") query = query.eq("is_top", true);

  const [listings, sources, totalCount, withDetailHtmlCount, withListHtmlCount, topCount] = await Promise.all([
    query,
    supabase.from("ingestion_listings").select("source").not("source", "is", null).limit(500),
    supabase.from("ingestion_listings").select("id", { count: "exact", head: true }),
    supabase.from("ingestion_listings").select("id", { count: "exact", head: true }).not("raw_detail_html", "is", null),
    supabase.from("ingestion_listings").select("id", { count: "exact", head: true }).not("list_raw_html", "is", null),
    supabase.from("ingestion_listings").select("id", { count: "exact", head: true }).eq("is_top", true)
  ]);

  if (listings.error) throw new Error(listings.error.message);
  if (sources.error) throw new Error(sources.error.message);
  if (totalCount.error) throw new Error(totalCount.error.message);
  if (withDetailHtmlCount.error) throw new Error(withDetailHtmlCount.error.message);
  if (withListHtmlCount.error) throw new Error(withListHtmlCount.error.message);
  if (topCount.error) throw new Error(topCount.error.message);

  const sourceOptions = [...new Set((sources.data ?? []).map((row) => row.source).filter(Boolean))].sort();

  return {
    listings: listings.data ?? [],
    sourceOptions,
    stats: {
      total: totalCount.count ?? 0,
      with_detail_html: withDetailHtmlCount.count ?? 0,
      with_list_html: withListHtmlCount.count ?? 0,
      top: topCount.count ?? 0
    }
  };
}

export async function getIngestionListingDetail(listingId: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingestion_listings")
    .select("*")
    .eq("id", listingId)
    .single();

  if (error) return null;
  return data;
}

export async function getCrawlJobs() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crawl_jobs")
    .select("id,job_name,status,started_at,finished_at,summary,error")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}
