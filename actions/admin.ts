"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const listing_statuses = new Set(["draft", "pending_review", "published", "rejected", "rented"]);
const listing_types = new Set(["room", "whole_unit", "student_apartment", "bedspace"]);
const room_types = new Set(["common_room", "master_room", "studio", "partition_room", "maid_room"]);
const gender_preferences = new Set(["any", "male", "female"]);
const listing_sources = new Set(["owner_submit", "wechat_group", "zufang", "xiaohongshu", "manual"]);
const contact_visibilities = new Set(["public", "login_only", "group_only", "private"]);
const verification_statuses = new Set(["unverified", "owner_verified", "agent_verified", "suspicious", "rejected"]);
const utilities_policies = new Set(["included", "shared", "excluded", "capped"]);
const aircon_policies = new Set(["included", "extra_charge", "limited_hours", "not_available"]);
const cooking_policies = new Set(["full", "light", "no"]);
const visitors_policies = new Set(["allowed", "limited", "not_allowed"]);
const binary_policies = new Set(["allowed", "not_allowed"]);
const facility_availabilities = new Set(["available", "restricted", "not_available"]);

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
  revalidatePath("/");
  revalidatePath("/rent");
}

export async function rejectHomepageListing(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const listingId = String(formData.get("listing_id") ?? "").trim();
  const cardSource = String(formData.get("card_source") ?? "").trim();
  const supabase = createAdminClient();

  if (cardSource === "candidate") {
    const candidateId = listingId.startsWith("candidate-")
      ? listingId.slice("candidate-".length)
      : listingId;
    if (!isUuid(candidateId)) throw new Error("无效的候选房源编号");

    const { data: candidate, error: readError } = await supabase
      .from("listing_import_candidates")
      .select("id,import_status,parse_warnings")
      .eq("id", candidateId)
      .in("import_status", ["parsed", "needs_review", "approved"])
      .is("listing_id", null)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!candidate) throw new Error("该候选房源已不可拒绝，请刷新页面后重试");

    const now = new Date().toISOString();
    const parseWarnings = Array.isArray(candidate.parse_warnings) ? candidate.parse_warnings : [];
    const { data: updatedCandidate, error } = await supabase
      .from("listing_import_candidates")
      .update({
        import_status: "rejected",
        parse_warnings: [...new Set([...parseWarnings, "管理员从首页拒绝房源"])],
        reviewed_by: profile.id,
        reviewed_at: now,
        updated_at: now
      })
      .eq("id", candidateId)
      .in("import_status", ["parsed", "needs_review", "approved"])
      .is("listing_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updatedCandidate) throw new Error("该候选房源已不可拒绝，请刷新页面后重试");
  } else if (cardSource === "official") {
    if (!isUuid(listingId)) throw new Error("无效的正式房源编号");

    const { data, error } = await supabase
      .from("listings")
      .update({ status: "rejected", rejection_reason: "管理员从首页拒绝房源" })
      .eq("id", listingId)
      .eq("status", "published")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("该正式房源已不可拒绝，请刷新页面后重试");
  } else {
    throw new Error("无效的房源来源");
  }

  revalidatePath("/");
  revalidatePath("/rent");
  revalidatePath("/admin");
  revalidatePath("/admin/listing-imports");
}

export async function unpublishListing(listingId: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ status: "draft" }).eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/rent");
}

export async function getAdminListings(filters: Record<string, string | string[] | undefined> = {}) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const q = firstValue(filters.q);
  const status = firstValue(filters.status);

  let query = supabase
    .from("listings")
    .select("id,listing_no,title,status,rent_amount,postal_code,room_type,source,verification_status,owner_id,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (status && listing_statuses.has(status)) query = query.eq("status", status);
  if (q) {
    const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    if (/^\d{1,8}$/.test(q)) {
      query = query.or(`listing_no.eq.${Number(q)},postal_code.eq.${q}`);
    } else {
      query = query.or(`title.ilike.%${escaped}%,postal_code.ilike.%${escaped}%`);
    }
  }

  const [listings, profiles, statusRows] = await Promise.all([
    query,
    supabase.from("users_profile").select("id,display_name,role"),
    supabase.from("listings").select("status")
  ]);
  if (listings.error) throw new Error(listings.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  if (statusRows.error) throw new Error(statusRows.error.message);

  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  const counts = Object.fromEntries([...listing_statuses].map((value) => [value, 0])) as Record<string, number>;
  for (const row of statusRows.data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;

  return {
    listings: (listings.data ?? []).map((listing) => ({
      ...listing,
      owner: profileById.get(listing.owner_id) ?? null
    })),
    counts,
    filters: { q, status }
  };
}

export async function getAdminListingDetail(listingId: string) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const [listing, facilities, images] = await Promise.all([
    supabase.from("listings").select("*").eq("id", listingId).maybeSingle(),
    supabase
      .from("listing_facilities")
      .select("facility_name,availability,note")
      .eq("listing_id", listingId)
      .order("facility_name"),
    supabase
      .from("listing_images")
      .select("id,image_url,sort_order,caption")
      .eq("listing_id", listingId)
      .order("sort_order")
  ]);

  if (listing.error) throw new Error(listing.error.message);
  if (facilities.error) throw new Error(facilities.error.message);
  if (images.error) throw new Error(images.error.message);
  if (!listing.data) return null;

  const { data: owner } = await supabase
    .from("users_profile")
    .select("id,display_name,role,phone,whatsapp,wechat")
    .eq("id", listing.data.owner_id)
    .maybeSingle();

  return {
    listing: listing.data,
    facilities: facilities.data ?? [],
    images: images.data ?? [],
    owner: owner ?? null
  };
}

export async function updateAdminListing(listingId: string, formData: FormData) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const listingType = requiredEnum(formData, "listing_type", listing_types);
  const roomType = listingType === "whole_unit" ? null : requiredEnum(formData, "room_type", room_types);
  const postalCode = requiredText(formData, "postal_code");
  if (!/^\d{6}$/.test(postalCode)) redirect(`/admin/listings/${listingId}?error=invalid_postal_code`);

  const payload = {
    title: requiredText(formData, "title"),
    listing_type: listingType,
    room_type: roomType,
    rent_amount: requiredInteger(formData, "rent_amount"),
    deposit_amount: nullableInteger(formData, "deposit_amount"),
    postal_code: postalCode,
    unit_hidden_address: nullableText(formData, "unit_hidden_address"),
    available_from: requiredText(formData, "available_from"),
    available_note: nullableText(formData, "available_note"),
    min_lease_months: requiredInteger(formData, "min_lease_months"),
    max_occupants: requiredInteger(formData, "max_occupants"),
    gender_preference: requiredEnum(formData, "gender_preference", gender_preferences),
    registration_allowed: checkbox(formData, "registration_allowed"),
    landlord_staying: checkbox(formData, "landlord_staying"),
    total_bedrooms: nullableInteger(formData, "total_bedrooms"),
    total_bathrooms: nullableInteger(formData, "total_bathrooms"),
    current_occupants_count: nullableInteger(formData, "current_occupants_count"),
    bathroom_shared_with_count: nullableInteger(formData, "bathroom_shared_with_count"),
    description: nullableText(formData, "description"),
    description_clean: nullableText(formData, "description_clean"),
    source: requiredEnum(formData, "source", listing_sources),
    contact_visibility: requiredEnum(formData, "contact_visibility", contact_visibilities),
    wechat: nullableText(formData, "wechat"),
    phone: nullableText(formData, "phone"),
    is_owner_direct: checkbox(formData, "is_owner_direct"),
    is_agent: checkbox(formData, "is_agent"),
    is_sublet: checkbox(formData, "is_sublet"),
    verification_status: requiredEnum(formData, "verification_status", verification_statuses),
    utilities_policy: nullableEnum(formData, "utilities_policy", utilities_policies),
    aircon_policy: nullableEnum(formData, "aircon_policy", aircon_policies),
    cooking_policy: nullableEnum(formData, "cooking_policy", cooking_policies),
    visitors_policy: nullableEnum(formData, "visitors_policy", visitors_policies),
    smoking_policy: nullableEnum(formData, "smoking_policy", binary_policies),
    pets_policy: nullableEnum(formData, "pets_policy", binary_policies),
    tenant_type_preference: formData.getAll("tenant_type_preference").map(String),
    internal_note: nullableText(formData, "internal_note"),
    rejection_reason: nullableText(formData, "rejection_reason")
  };

  const { error } = await supabase.from("listings").update(payload).eq("id", listingId);
  if (error) redirect(`/admin/listings/${listingId}?error=${encodeURIComponent(error.message)}`);

  const facilityRows = formData.getAll("facility_name").map(String).map((facility_name) => ({
    listing_id: listingId,
    facility_name,
    availability: enumValue(
      String(formData.get(`facility_${facility_name}`) ?? "not_available"),
      facility_availabilities
    ),
    note: nullableText(formData, `facility_note_${facility_name}`)
  }));
  if (facilityRows.length > 0) {
    const { error: facilityError } = await supabase
      .from("listing_facilities")
      .upsert(facilityRows, { onConflict: "listing_id,facility_name" });
    if (facilityError) redirect(`/admin/listings/${listingId}?error=${encodeURIComponent(facilityError.message)}`);
  }

  revalidateListingPaths(listingId);
  redirect(`/admin/listings/${listingId}?saved=1`);
}

export async function setAdminListingStatus(formData: FormData) {
  await requireRole(["admin"]);
  const listingId = requiredText(formData, "listing_id");
  const status = requiredEnum(formData, "status", listing_statuses);
  const update: Record<string, unknown> = { status };
  if (status === "published") update.rejection_reason = null;
  if (status === "rejected") update.rejection_reason = nullableText(formData, "rejection_reason");

  const { error } = await createAdminClient().from("listings").update(update).eq("id", listingId);
  if (error) redirect(`/admin/listings/${listingId}?error=${encodeURIComponent(error.message)}`);
  revalidateListingPaths(listingId);
  redirect(`/admin/listings/${listingId}?status_updated=${status}`);
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

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function nullableText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

function requiredInteger(formData: FormData, key: string) {
  const value = Number(requiredText(formData, key));
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function nullableInteger(formData: FormData, key: string) {
  const value = nullableText(formData, key);
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${key} must be an integer`);
  return number;
}

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function enumValue(value: string, allowed: Set<string>) {
  if (!allowed.has(value)) throw new Error(`Invalid value: ${value}`);
  return value;
}

function requiredEnum(formData: FormData, key: string, allowed: Set<string>) {
  return enumValue(requiredText(formData, key), allowed);
}

function nullableEnum(formData: FormData, key: string, allowed: Set<string>) {
  const value = nullableText(formData, key);
  return value === null ? null : enumValue(value, allowed);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function revalidateListingPaths(listingId: string) {
  revalidatePath("/");
  revalidatePath("/rent");
  revalidatePath(`/rent/${listingId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${listingId}`);
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
