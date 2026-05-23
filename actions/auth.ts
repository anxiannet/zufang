"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "tenant") as UserRole;
  const displayName = String(formData.get("display_name") ?? email).trim();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  if (data.user) {
    await supabase.from("users_profile").insert({
      auth_user_id: data.user.id,
      role,
      display_name: displayName,
      phone: String(formData.get("phone") ?? "").trim() || null,
      whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
      wechat: String(formData.get("wechat") ?? "").trim() || null,
      preferred_language: "zh"
    });
  }

  const next = String(formData.get("next") ?? "");
  redirect(next || (role === "tenant" ? "/rent" : "/landlord/listings/new"));
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? "")
  });
  if (error) throw new Error(error.message);
  redirect(String(formData.get("next") ?? "") || "/rent");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/rent");
}
