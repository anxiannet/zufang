"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { importCandidateToListing } from "@/src/import/repository";
import { processCrawlerListings } from "@/src/import/processCrawlerListings";

const allowed_statuses = new Set(["pending", "parsed", "needs_review", "rejected", "imported", "failed", "duplicate"]);
const listing_types = new Set(["room", "whole_unit", "student_apartment", "bedspace"]);
const room_types = new Set(["common_room", "master_room", "studio", "whole_unit", "partition_room", "maid_room"]);
const utilities_policies = new Set(["included", "shared", "excluded", "capped"]);
const aircon_policies = new Set(["included", "extra_charge", "limited_hours", "not_available"]);
const cooking_policies = new Set(["full", "light", "no"]);
const visitors_policies = new Set(["allowed", "limited", "not_allowed"]);
const binary_policies = new Set(["allowed", "not_allowed"]);

export async function getListingImportCandidates(status = "needs_review") {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const safe_status = allowed_statuses.has(status) ? status : "needs_review";
  const [{ data: candidates, error }, { data: owners, error: owner_error }] = await Promise.all([
    supabase
      .from("listing_import_candidates")
      .select("id,candidate_no,source,source_id,source_url,parsed_title,parsed_rent_amount,parsed_postal_code,parsed_area,parsed_mrt,parsed_listing_type,parsed_room_type,parsed_phone,parsed_wechat,parse_confidence,parse_warnings,import_status,listing_id,created_at")
      .eq("import_status", safe_status)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("users_profile")
      .select("id,display_name,role")
      .in("role", ["admin", "landlord", "agent"])
      .order("display_name")
  ]);
  if (error) throw new Error(error.message);
  if (owner_error) throw new Error(owner_error.message);
  return { candidates: candidates ?? [], owners: owners ?? [], status: safe_status };
}

export async function getListingImportCandidateDetail(id: string) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { data: candidate, error } = await supabase
    .from("listing_import_candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!candidate) return null;

  const { data: ingestion, error: ingestion_error } = await supabase
    .from("ingestion_listings")
    .select("*")
    .eq("id", candidate.ingestion_listing_id)
    .maybeSingle();
  if (ingestion_error) throw new Error(ingestion_error.message);

  return { candidate, ingestion };
}

export async function updateListingImportCandidate(candidate_id: string, formData: FormData) {
  const profile = await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { data: current, error: read_error } = await supabase
    .from("listing_import_candidates")
    .select("import_status")
    .eq("id", candidate_id)
    .maybeSingle();

  if (read_error || !current) {
    redirect(`/admin/listing-imports/${candidate_id}?error=${encodeURIComponent(read_error?.message ?? "candidate_not_found")}`);
  }
  if (current.import_status === "imported") {
    redirect(`/admin/listing-imports/${candidate_id}?error=imported_candidate_is_read_only`);
  }

  const update = {
    parsed_title: nullableFormText(formData, "parsed_title"),
    parsed_rent_amount: nullableFormInteger(formData, "parsed_rent_amount"),
    parsed_postal_code: nullableFormText(formData, "parsed_postal_code"),
    parsed_room_type: nullableEnum(formData, "parsed_room_type", room_types),
    parsed_listing_type: nullableEnum(formData, "parsed_listing_type", listing_types),
    parsed_available_from: nullableFormText(formData, "parsed_available_from"),
    parsed_min_lease_months: nullableFormInteger(formData, "parsed_min_lease_months"),
    parsed_max_occupants: nullableFormInteger(formData, "parsed_max_occupants"),
    parsed_phone: nullableFormText(formData, "parsed_phone"),
    parsed_wechat: nullableFormText(formData, "parsed_wechat"),
    parsed_registration_allowed: nullableFormBoolean(formData, "parsed_registration_allowed"),
    parsed_landlord_staying: nullableFormBoolean(formData, "parsed_landlord_staying"),
    parsed_utilities_policy: nullableEnum(formData, "parsed_utilities_policy", utilities_policies),
    parsed_aircon_policy: nullableEnum(formData, "parsed_aircon_policy", aircon_policies),
    parsed_cooking_policy: nullableEnum(formData, "parsed_cooking_policy", cooking_policies),
    parsed_visitors_policy: nullableEnum(formData, "parsed_visitors_policy", visitors_policies),
    parsed_smoking_policy: nullableEnum(formData, "parsed_smoking_policy", binary_policies),
    parsed_pets_policy: nullableEnum(formData, "parsed_pets_policy", binary_policies),
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("listing_import_candidates").update(update).eq("id", candidate_id);
  if (error) {
    redirect(`/admin/listing-imports/${candidate_id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/listing-imports");
  revalidatePath(`/admin/listing-imports/${candidate_id}`);
  redirect(`/admin/listing-imports/${candidate_id}?saved=1`);
}

export async function generateListingImportCandidates(formData: FormData) {
  await requireRole(["admin"]);

  const rawLimit = Number.parseInt(String(formData.get("limit") ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const sourceValue = String(formData.get("source") ?? "").trim();
  const source = sourceValue.length > 0 ? sourceValue : undefined;

  let summary: Awaited<ReturnType<typeof processCrawlerListings>>["summary"];

  try {
    const result = await processCrawlerListings(createAdminClient(), {
      limit,
      source,
      dryRun: false
    });
    summary = result.summary;
  } catch (error) {
    redirect(`/admin/listing-imports?status=needs_review&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }

  revalidatePath("/admin/listing-imports");
  const params = new URLSearchParams({
    status: "needs_review",
    generated: "1",
    fetched: String(summary.fetched),
    created: String(summary.created_candidates),
    parsed: String(summary.parsed),
    review: String(summary.needs_review),
    rejected: String(summary.rejected),
    duplicate: String(summary.duplicate),
    failed: String(summary.failed)
  });
  redirect(`/admin/listing-imports?${params.toString()}`);
}

export async function setListingImportCandidateStatus(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("candidate_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["parsed", "rejected", "duplicate"].includes(status)) {
    redirect("/admin/listing-imports?error=invalid_status");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: current, error: read_error } = await supabase
    .from("listing_import_candidates")
    .select("import_status,parse_warnings")
    .eq("id", id)
    .single();
  if (read_error || current.import_status === "imported") {
    redirect("/admin/listing-imports?error=protected_candidate");
  }

  const update: Record<string, unknown> = {
    import_status: status,
    reviewed_by: profile.id,
    reviewed_at: now,
    updated_at: now
  };
  if (status === "duplicate") {
    update.parse_warnings = [...new Set([...(current.parse_warnings ?? []), "人工标记为重复房源"])] ;
  }

  const { error } = await supabase.from("listing_import_candidates").update(update).eq("id", id);
  if (error) redirect(`/admin/listing-imports?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/listing-imports");
  revalidatePath("/rent");
}

export async function importListingCandidate(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const candidate_id = String(formData.get("candidate_id") ?? "");
  const system_owner_id = String(formData.get("system_owner_id") ?? "");
  const status = String(formData.get("status") ?? "needs_review");
  if (!candidate_id || !system_owner_id) {
    redirect(`/admin/listing-imports?status=${status}&error=missing_owner`);
  }

  try {
    await importCandidateToListing(createAdminClient(), candidate_id, {
      reviewedBy: profile.id,
      systemOwnerId: system_owner_id
    });
  } catch (error) {
    redirect(`/admin/listing-imports?status=${status}&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }

  revalidatePath("/admin/listing-imports");
  revalidatePath("/admin");
  revalidatePath("/rent");
  redirect(`/admin/listing-imports?status=${status}&imported=1`);
}

function nullableFormText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function nullableFormInteger(formData: FormData, key: string): number | null {
  const value = nullableFormText(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nullableFormBoolean(formData: FormData, key: string): boolean | null {
  const value = nullableFormText(formData, key);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function nullableEnum(formData: FormData, key: string, allowed: Set<string>): string | null {
  const value = nullableFormText(formData, key);
  return value && allowed.has(value) ? value : null;
}
