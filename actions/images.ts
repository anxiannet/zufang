"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function uploadListingImage(formData: FormData) {
  await requireRole(["landlord", "agent", "admin"]);
  const supabase = await createClient();
  const listingId = String(formData.get("listing_id"));
  const file = formData.get("image");
  if (!(file instanceof File)) throw new Error("请选择图片");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${listingId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("listing-images").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  const { error } = await supabase.from("listing_images").insert({
    listing_id: listingId,
    image_url: data.publicUrl,
    sort_order: Number(formData.get("sort_order") ?? 0),
    caption: String(formData.get("caption") ?? "").trim() || null
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/rent/${listingId}`);
}

export async function deleteListingImage(imageId: string, listingId: string) {
  await requireRole(["landlord", "agent", "admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("listing_images").delete().eq("id", imageId);
  if (error) throw new Error(error.message);
  revalidatePath(`/rent/${listingId}`);
}
