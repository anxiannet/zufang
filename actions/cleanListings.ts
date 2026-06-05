"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const room_type_options = {
  master_room: "主人房",
  common_room: "普通房",
  single_room: "单人间",
  studio: "Studio"
} as const;

type EditableRoomType = keyof typeof room_type_options;

type CleanListingDeleteRow = {
  id: string;
  ingestion_listing_id: string | number | null;
  source: string | null;
  source_id: string | null;
  listing_url: string | null;
  detail_url: string | null;
  title: string | null;
};

export type CleanListingRow = {
  id: string;
  source: string | null;
  source_id: string | null;
  title: string | null;
  price: number | null;
  mrt_area: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  landlord_stay: boolean | null;
  gender_preference: string | null;
  status: string | null;
  detail_url: string | null;
  listing_url: string | null;
  clean_version: string | null;
  created_at: string | null;
};

export type CleanListingsFilter = {
  room_type?: "missing";
};

export async function getCleanListings(filter: CleanListingsFilter = {}): Promise<CleanListingRow[]> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();

  let query = supabase
    .from("listing_clean")
    .select("id,source,source_id,title,price,mrt_area,room_type,normalized_room_type,cooking_allowed,can_register_address,landlord_stay,gender_preference,status,detail_url,listing_url,clean_version,created_at")
    .order("created_at", { ascending: false });

  if (filter.room_type === "missing") {
    query = query.or("room_type.is.null,room_type.eq.,normalized_room_type.is.null,normalized_room_type.eq.");
  } else {
    query = query.limit(200);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as CleanListingRow[];
}

export async function updateCleanListingRoomType(formData: FormData) {
  await requireRole(["admin"]);

  const clean_listing_id = String(formData.get("clean_listing_id") ?? "").trim();
  const normalized_room_type = String(formData.get("normalized_room_type") ?? "").trim();
  const redirect_to = cleanListingRedirect(String(formData.get("redirect_to") ?? ""));

  if (!clean_listing_id || !isEditableRoomType(normalized_room_type)) {
    redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}update_error=invalid_room_type`);
  }

  const room_type = room_type_options[normalized_room_type];
  const supabase = createAdminClient();

  const { error: cleanError } = await supabase
    .from("listing_clean")
    .update({
      room_type,
      normalized_room_type
    })
    .eq("id", clean_listing_id);

  if (cleanError) throw new Error(cleanError.message);

  const { error: indexError } = await supabase
    .from("listing_indexes")
    .update({
      room_type,
      normalized_room_type,
      indexed_at: new Date().toISOString()
    })
    .eq("clean_listing_id", clean_listing_id);

  if (indexError) throw new Error(indexError.message);

  revalidateCleanListingPaths();
  redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}updated=1`);
}

export async function deleteCleanListing(formData: FormData) {
  await requireRole(["admin"]);

  const clean_listing_id = String(formData.get("clean_listing_id") ?? "").trim();
  const redirect_to = cleanListingRedirect(String(formData.get("redirect_to") ?? ""));

  if (!clean_listing_id) {
    redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}delete_error=missing_id`);
  }

  const supabase = createAdminClient();

  const { data: listing, error: lookupError } = await supabase
    .from("listing_clean")
    .select("id,ingestion_listing_id,source,source_id,listing_url,detail_url,title")
    .eq("id", clean_listing_id)
    .single();

  if (lookupError || !listing) {
    redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}delete_error=not_found`);
  }

  await deleteCleanListingCascade({
    id: String(listing.id),
    ingestion_listing_id: listing.ingestion_listing_id,
    source: typeof listing.source === "string" ? listing.source : null,
    source_id: typeof listing.source_id === "string" ? listing.source_id : null,
    listing_url: typeof listing.listing_url === "string" ? listing.listing_url : null,
    detail_url: typeof listing.detail_url === "string" ? listing.detail_url : null,
    title: typeof listing.title === "string" ? listing.title : null
  });

  revalidateCleanListingPaths();
  redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}deleted=1`);
}

export async function deleteMissingRoomTypeCleanListings(formData: FormData) {
  await requireRole(["admin"]);

  const redirect_to = cleanListingRedirect(String(formData.get("redirect_to") ?? "")) || "/admin/clean-listings?room_type=missing";
  const listings = await getMissingRoomTypeRows();

  for (const listing of listings) {
    await deleteCleanListingCascade(listing);
  }

  revalidateCleanListingPaths();
  redirect(`${redirect_to}${redirect_to.includes("?") ? "&" : "?"}bulk_deleted=${listings.length}`);
}

async function getMissingRoomTypeRows(): Promise<CleanListingDeleteRow[]> {
  const supabase = createAdminClient();
  const rows: CleanListingDeleteRow[] = [];
  const page_size = 1000;

  for (let from = 0; ; from += page_size) {
    const { data, error } = await supabase
      .from("listing_clean")
      .select("id,ingestion_listing_id,source,source_id,listing_url,detail_url,title")
      .or("room_type.is.null,room_type.eq.,normalized_room_type.is.null,normalized_room_type.eq.")
      .order("created_at", { ascending: false })
      .range(from, from + page_size - 1);

    if (error) throw new Error(error.message);

    rows.push(...(data ?? []).map((row) => ({
      id: String(row.id),
      ingestion_listing_id: row.ingestion_listing_id ?? null,
      source: typeof row.source === "string" ? row.source : null,
      source_id: typeof row.source_id === "string" ? row.source_id : null,
      listing_url: typeof row.listing_url === "string" ? row.listing_url : null,
      detail_url: typeof row.detail_url === "string" ? row.detail_url : null,
      title: typeof row.title === "string" ? row.title : null
    })));

    if (!data || data.length < page_size) break;
  }

  return rows;
}

async function deleteCleanListingCascade(listing: CleanListingDeleteRow) {
  const source = listing.source;
  const source_id = listing.source_id;
  const ingestion_listing_id = listing.ingestion_listing_id ? String(listing.ingestion_listing_id) : null;
  const listing_index_ids = await findListingIndexIds(listing.id, source, source_id);

  await recordDeletedIngestionListing(listing, listing_index_ids);
  await deleteAiAnalysis(listing_index_ids);
  await deleteByField("listing_indexes", "clean_listing_id", listing.id);

  if (source && source_id) {
    await deleteBySource("listing_indexes", source, source_id);
  }

  await deleteByField("listing_clean", "id", listing.id);

  if (ingestion_listing_id) {
    await deleteByField("ingestion_listings", "id", ingestion_listing_id);
  }

  if (source && source_id) {
    await deleteBySource("ingestion_listings", source, source_id);
  }
}

async function recordDeletedIngestionListing(listing: CleanListingDeleteRow, listing_index_ids: string[]) {
  if (!listing.source || !listing.source_id) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("deleted_ingestion_listings")
    .upsert({
      source: listing.source,
      source_id: listing.source_id,
      listing_url: listing.listing_url,
      detail_url: listing.detail_url,
      title: listing.title,
      reason: "admin_deleted",
      deleted_at: new Date().toISOString(),
      metadata: {
        clean_listing_id: listing.id,
        ingestion_listing_id: listing.ingestion_listing_id,
        listing_index_ids
      }
    }, {
      onConflict: "source,source_id"
    });

  if (error) throw new Error(error.message);
}

async function deleteByField(table_name: string, field_name: string, value: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from(table_name).delete().eq(field_name, value);
  if (error) throw new Error(error.message);
}

async function findListingIndexIds(clean_listing_id: string, source: string | null, source_id: string | null) {
  const supabase = createAdminClient();
  let query = supabase
    .from("listing_indexes")
    .select("id")
    .eq("clean_listing_id", clean_listing_id);

  const { data: byCleanListingId, error: byCleanListingError } = await query;
  if (byCleanListingError) throw new Error(byCleanListingError.message);

  const ids = new Set((byCleanListingId ?? []).map((row) => String(row.id)));

  if (source && source_id) {
    const { data: bySource, error: bySourceError } = await supabase
      .from("listing_indexes")
      .select("id")
      .eq("source", source)
      .eq("source_id", source_id);

    if (bySourceError) throw new Error(bySourceError.message);
    (bySource ?? []).forEach((row) => ids.add(String(row.id)));
  }

  return Array.from(ids);
}

async function deleteAiAnalysis(listing_index_ids: string[]) {
  if (listing_index_ids.length === 0) return;
  const supabase = createAdminClient();

  const { data: rows, error: lookupError } = await supabase
    .from("listing_ai_analysis")
    .select("id,analysis_payload")
    .in("listing_index_id", listing_index_ids);

  if (lookupError) throw new Error(lookupError.message);

  for (const row of rows ?? []) {
    const payload = isRecord(row.analysis_payload) ? row.analysis_payload : {};
    const { error: updateError } = await supabase
      .from("listing_ai_analysis")
      .update({
        analysis_payload: {
          ...payload,
          protected: false,
          admin_delete_requested_at: new Date().toISOString()
        },
        analysis_source: "admin_delete_unprotected",
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase
    .from("listing_ai_analysis")
    .delete()
    .in("listing_index_id", listing_index_ids);

  if (error) throw new Error(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function deleteBySource(table_name: string, source: string, source_id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from(table_name).delete().eq("source", source).eq("source_id", source_id);
  if (error) throw new Error(error.message);
}

function isEditableRoomType(value: string): value is EditableRoomType {
  return value in room_type_options;
}

function cleanListingRedirect(value: string) {
  return value.startsWith("/admin/clean-listings") ? value : "/admin/clean-listings";
}

function revalidateCleanListingPaths() {
  revalidatePath("/admin/clean-listings");
  revalidatePath("/admin/index-listings");
  revalidatePath("/admin/ingestion");
  revalidatePath("/admin/search-debug");
  revalidatePath("/rent");
}
