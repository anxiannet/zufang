"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { importCandidateToListing } from "@/src/import/repository";

const allowed_statuses = new Set(["pending", "parsed", "needs_review", "approved", "rejected", "imported", "failed", "duplicate"]);

export async function getListingImportCandidates(status = "needs_review") {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const safe_status = allowed_statuses.has(status) ? status : "needs_review";
  const [{ data: candidates, error }, { data: owners, error: owner_error }] = await Promise.all([
    supabase
      .from("listing_import_candidates")
      .select("id,source,source_id,source_url,parsed_title,parsed_rent_amount,parsed_postal_code,parsed_area,parsed_mrt,parsed_listing_type,parsed_room_type,parsed_phone,parsed_wechat,parse_confidence,parse_warnings,import_status,listing_id,created_at")
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

export async function setListingImportCandidateStatus(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const id = String(formData.get("candidate_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "rejected", "duplicate"].includes(status)) {
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
    update.parse_warnings = [...new Set([...(current.parse_warnings ?? []), "人工标记为重复房源"])];
  }

  const { error } = await supabase.from("listing_import_candidates").update(update).eq("id", id);
  if (error) redirect(`/admin/listing-imports?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/listing-imports");
}

export async function importApprovedListingCandidate(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const candidate_id = String(formData.get("candidate_id") ?? "");
  const system_owner_id = String(formData.get("system_owner_id") ?? "");
  if (!candidate_id || !system_owner_id) {
    redirect("/admin/listing-imports?status=approved&error=missing_owner");
  }

  try {
    await importCandidateToListing(createAdminClient(), candidate_id, {
      reviewedBy: profile.id,
      systemOwnerId: system_owner_id
    });
  } catch (error) {
    redirect(`/admin/listing-imports?status=approved&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }

  revalidatePath("/admin/listing-imports");
  revalidatePath("/admin");
  redirect("/admin/listing-imports?status=approved&imported=1");
}
