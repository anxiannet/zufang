import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);

    const formData = await request.formData();
    const cleanListingId = String(formData.get("clean_listing_id") ?? "").trim();

    if (!cleanListingId) {
      redirect("/admin/invalid-listings?delete_error=missing_id");
    }

    const supabase = createAdminClient();

    const { data: listing, error: lookupError } = await supabase
      .from("listing_clean")
      .select("id,ingestion_listing_id,source,source_id")
      .eq("id", cleanListingId)
      .single();

    if (lookupError || !listing) {
      redirect("/admin/invalid-listings?delete_error=not_found");
    }

    const source = typeof listing.source === "string" ? listing.source : null;
    const sourceId = typeof listing.source_id === "string" ? listing.source_id : null;
    const ingestionListingId = listing.ingestion_listing_id ? String(listing.ingestion_listing_id) : null;

    await deleteByField(supabase, "listing_indexes", "clean_listing_id", cleanListingId);

    if (source && sourceId) {
      await deleteBySource(supabase, "listing_indexes", source, sourceId);
    }

    await deleteByField(supabase, "listing_clean", "id", cleanListingId);

    if (ingestionListingId) {
      await deleteByField(supabase, "ingestion_listings", "id", ingestionListingId);
    }

    if (source && sourceId) {
      await deleteBySource(supabase, "ingestion_listings", source, sourceId);
    }

    revalidatePath("/admin/invalid-listings");
    revalidatePath("/admin/clean-listings");
    revalidatePath("/admin/index-listings");
    revalidatePath("/admin/ingestion");
    revalidatePath("/rent");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return NextResponse.redirect(new URL("/admin/invalid-listings?delete_error=failed", request.url));
  }

  redirect("/admin/invalid-listings?deleted=1");
}

async function deleteByField(
  supabase: ReturnType<typeof createAdminClient>,
  tableName: string,
  fieldName: string,
  value: string
) {
  const { error } = await supabase.from(tableName).delete().eq(fieldName, value);
  if (error) throw new Error(error.message);
}

async function deleteBySource(
  supabase: ReturnType<typeof createAdminClient>,
  tableName: string,
  source: string,
  sourceId: string
) {
  const { error } = await supabase.from(tableName).delete().eq("source", source).eq("source_id", sourceId);
  if (error) throw new Error(error.message);
}

function isRedirectError(error: unknown) {
  return error instanceof Error && error.message === "NEXT_REDIRECT";
}
