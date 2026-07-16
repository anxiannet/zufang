"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createEnquiry(formData: FormData) {
  const profile = await getCurrentProfile();
  const listingId = String(formData.get("listing_id"));
  const requestedPath = String(formData.get("listing_path") ?? "");
  const listingPath = /^\/rent\/(?:\d{5}|C\d{4})$/i.test(requestedPath)
    ? requestedPath
    : `/rent/${listingId}`;

  if (!profile) {
    redirect(`/auth/login?next=${listingPath}&reason=enquiry`);
  }

  if (!["tenant", "admin"].includes(profile.role)) {
    redirect(`${listingPath}?error=enquiry_role`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("enquiries").insert({
    listing_id: listingId,
    tenant_id: profile.id,
    message: String(formData.get("message") ?? "").trim(),
    move_in_date: String(formData.get("move_in_date") ?? "") || null,
    lease_duration_months: Number(formData.get("lease_duration_months") ?? 0) || null,
    occupants_count: Number(formData.get("occupants_count") ?? 1) || 1
  });

  if (error) throw new Error(error.message);
  revalidatePath(listingPath);
}
