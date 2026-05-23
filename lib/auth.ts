import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  const user = userData.user;

  const { data, error } = await supabase
    .from("users_profile")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error) return null;
  return data as { id: string; role: UserRole; display_name: string; whatsapp: string | null; wechat: string | null };
}

export async function requireRole(roles: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile || !roles.includes(profile.role)) {
    throw new Error("没有权限执行此操作");
  }
  return profile;
}
