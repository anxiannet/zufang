"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseListingAvailability } from "@/lib/listingDates";
import { cleanPublicListingDescription } from "@/lib/listingDescription";
import { extract_candidate_images } from "@/lib/candidateImages";
import { extractListingFacilities, removeExtractedFacilityText } from "@/lib/listingFacilities";
import { parse_candidate_source_posted_at } from "@/lib/listingSourceDates";
import { get_listing_preference_stats, get_listing_preference_stats_map } from "@/lib/listingPreferenceStats";
import { extractListingStructuredFacts } from "@/lib/listingStructuredFacts";
import { getListingPublicId } from "@/lib/listingUrl";
import { get_listing_visibility_cutoff, is_listing_date_visible, LISTING_SEARCH_QUERY_LIMIT } from "@/lib/listingVisibility";
import { build_mrt_commute_estimate } from "@/lib/mrtCommuteEstimates";
import { build_ntu_commute_fallback } from "@/lib/ntuDistance";
import { facilities, type FacilityAvailability, type ListingCard, type ListingDetail } from "@/lib/types";

function parseCandidateNo(value: string): number | null {
  const match = value.trim().match(/^C(\d{1,4})$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
}

function text(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

function intValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function nullableText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const maxImageCount = 6;
const maxImageSize = 5 * 1024 * 1024;

export type CreateListingState = {
  status: "idle" | "error" | "success";
  error: string | null;
  step: number | null;
  listing_id: string | null;
};

function createListingError(error: string, step: number): CreateListingState {
  return {
    status: "error",
    error,
    step,
    listing_id: null
  };
}

function logListingCreateError(stage: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(`createListing failed at ${stage}`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });
}

export async function createListing(
  _previousState: CreateListingState,
  formData: FormData
): Promise<CreateListingState> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return createListingError("session_expired", 2);
  }

  if (!["landlord", "agent", "admin"].includes(profile.role)) {
    return createListingError("listing_role", 2);
  }

  const supabase = await createClient();
  const postalCode = text(formData, "postal_code");
  const title = text(formData, "title");
  const rentAmount = intValue(formData, "rent_amount");
  const availableFrom = text(formData, "available_from");
  const listingType = text(formData, "listing_type", "room");
  const roomType = nullableText(formData, "room_type");
  const isAdminMode = profile.role === "admin" && text(formData, "admin_mode") === "true";
  const imageFiles = formData
    .getAll("image_file")
    .map((value, formIndex) => ({ value, formIndex }))
    .filter((item): item is { value: File; formIndex: number } => item.value instanceof File && item.value.size > 0);

  if (!title) return createListingError("missing_title", 0);
  if (!postalCode) return createListingError("missing_postal_code", 0);
  if (!rentAmount) return createListingError("missing_rent_amount", 0);
  if (!availableFrom) return createListingError("missing_available_from", 0);
  if (listingType !== "whole_unit" && !roomType) return createListingError("missing_room_type", 0);
  if (imageFiles.length > maxImageCount) {
    return createListingError("image_count", 2);
  }
  if (imageFiles.some(({ value }) => !allowedImageTypes.has(value.type))) {
    return createListingError("image_type", 2);
  }
  if (imageFiles.some(({ value }) => value.size > maxImageSize)) {
    return createListingError("image_size", 2);
  }

  const isAdmin = profile.role === "admin";
  const description = nullableText(formData, "description");

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      owner_id: profile.id,
      status: "pending_review",
      title,
      listing_type: listingType,
      room_type: listingType === "whole_unit" ? null : roomType,
      rent_amount: rentAmount,
      deposit_amount: intValue(formData, "deposit_amount"),
      postal_code: postalCode,
      available_from: availableFrom,
      available_note: nullableText(formData, "available_note"),
      min_lease_months: intValue(formData, "min_lease_months", 6),
      max_occupants: intValue(formData, "max_occupants", 1),
      gender_preference: text(formData, "gender_preference", "any"),
      registration_allowed: boolValue(formData, "registration_allowed"),
      landlord_staying: boolValue(formData, "landlord_staying"),
      total_bedrooms: intValue(formData, "total_bedrooms"),
      total_bathrooms: intValue(formData, "total_bathrooms"),
      current_occupants_count: intValue(formData, "current_occupants_count"),
      bathroom_shared_with_count: intValue(formData, "bathroom_shared_with_count"),
      description,
      description_clean: nullableText(formData, "description_clean") ?? description,
      source: isAdminMode ? text(formData, "source", "owner_submit") : "owner_submit",
      contact_visibility: text(formData, "contact_visibility", "private"),
      wechat: nullableText(formData, "wechat"),
      phone: nullableText(formData, "phone"),
      is_owner_direct: boolValue(formData, "is_owner_direct"),
      is_agent: boolValue(formData, "is_agent"),
      is_sublet: boolValue(formData, "is_sublet"),
      verification_status: isAdminMode ? text(formData, "verification_status", "unverified") : "unverified",
      utilities_policy: nullableText(formData, "utilities_policy"),
      aircon_policy: nullableText(formData, "aircon_policy"),
      cooking_policy: nullableText(formData, "cooking_policy"),
      visitors_policy: nullableText(formData, "visitors_policy"),
      smoking_policy: nullableText(formData, "smoking_policy"),
      pets_policy: nullableText(formData, "pets_policy"),
      tenant_type_preference: formData.getAll("tenant_type_preference").map(String),
      internal_note: isAdmin ? nullableText(formData, "internal_note") : null
    })
    .select("id")
    .single();

  if (error || !listing) {
    if (error) logListingCreateError("listing_insert", error);
    if (error?.code === "42501") {
      return createListingError("listing_permission", 2);
    }
    return createListingError("create_failed", 0);
  }

  const facilityRows = facilities.map((facility) => ({
    listing_id: listing.id,
    facility_name: facility,
    availability: text(formData, `facility_${facility}`, "not_available") as FacilityAvailability,
    note: text(formData, `facility_note_${facility}`) || null
  }));

  const { error: facilityInsertError } = await supabase.from("listing_facilities").insert(facilityRows);
  if (facilityInsertError) {
    logListingCreateError("facility_insert", facilityInsertError);
    await supabase.from("listings").delete().eq("id", listing.id);
    if (facilityInsertError.code === "42501") {
      return createListingError("listing_permission", 1);
    }
    return createListingError("create_failed", 1);
  }

  const uploadedPaths: string[] = [];
  const imageRows = [];

  for (const [index, { value: file, formIndex }] of imageFiles.entries()) {
    const extension = allowedImageTypes.get(file.type)!;
    const path = `${listing.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-images")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("listing-images").remove(uploadedPaths);
      }
      await supabase.from("listings").delete().eq("id", listing.id);
      return createListingError("image_upload", 2);
    }

    uploadedPaths.push(path);
    const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
    imageRows.push({
      listing_id: listing.id,
      image_url: data.publicUrl,
      sort_order: index,
      caption: text(formData, `image_caption_${formIndex}`) || null
    });
  }

  if (imageRows.length > 0) {
    const { error: imageInsertError } = await supabase.from("listing_images").insert(imageRows);
    if (imageInsertError) {
      await supabase.storage.from("listing-images").remove(uploadedPaths);
      await supabase.from("listings").delete().eq("id", listing.id);
      return createListingError("image_upload", 2);
    }
  }

  revalidatePath("/rent");
  return {
    status: "success",
    error: null,
    step: null,
    listing_id: listing.id
  };
}

export async function updateListing(listingId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (!["landlord", "agent", "admin"].includes(profile.role)) redirect(`/rent/${listingId}?error=listing_role`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update({
      title: text(formData, "title"),
      rent_amount: intValue(formData, "rent_amount"),
      deposit_amount: intValue(formData, "deposit_amount"),
      description: text(formData, "description"),
      description_clean: nullableText(formData, "description_clean")
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);
  revalidatePath(`/rent/${listingId}`);
}

export async function getMyListings() {
  const profile = await getCurrentProfile();
  if (!profile || !["landlord", "agent", "admin"].includes(profile.role)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id,listing_no,title,status,rent_amount,postal_code,available_from,updated_at")
    .eq("owner_id", profile.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitListingForReview(listingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ status: "pending_review" }).eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function getHomeListings() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const visibility_cutoff = get_listing_visibility_cutoff();
  const [{ data, error }, candidateListings] = await Promise.all([
    supabase
      .from("listings")
      .select("id,listing_no,title,rent_amount,room_type,postal_code,available_from,available_note,min_lease_months,cooking_policy,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count,description,description_clean,updated_at")
      .eq("status", "published")
      .gte("updated_at", visibility_cutoff)
      .order("updated_at", { ascending: false })
      .limit(6),
    searchCandidateListings(adminSupabase, {}, "", null, "", [], 6)
  ]);

  if (error) throw new Error(error.message);

  const officialListings = ((data ?? []) as ListingCard[]).map((listing) => ({
    ...listing,
    card_source: "official" as const
  }));
  const officialIds = officialListings.map((listing) => listing.id);
  const postalCodes = [...new Set(
    [...officialListings, ...candidateListings.listings]
      .map((listing) => listing.postal_code)
      .filter(Boolean)
  )] as string[];

  const [imagesResult, geocodingResult, commuteResult, preferenceStatsByKey] = await Promise.all([
    officialIds.length > 0
      ? supabase
        .from("listing_images")
        .select("listing_id,image_url,sort_order,caption")
        .in("listing_id", officialIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as { listing_id: string; image_url: string; sort_order: number; caption: string | null }[] }),
    postalCodes.length > 0
      ? supabase
        .from("geocoding_cache")
        .select("postal_code,block,road_name,building,property_type,latitude,longitude")
        .in("postal_code", postalCodes)
        .eq("status", "success")
      : Promise.resolve({ data: [] as { postal_code: string; block: string | null; road_name: string | null; building: string | null; property_type: string | null; latitude: number | null; longitude: number | null }[] }),
    postalCodes.length > 0
      ? adminSupabase
        .from("listing_commute_cache")
        .select("postal_code,ntu_bus_minutes,ntu_drive_minutes,ntu_straight_distance_km,status,skip_reason,computed_at")
        .in("postal_code", postalCodes)
      : Promise.resolve({ data: [] as NonNullable<ListingCard["ntu_commute"]>[] }),
    get_listing_preference_stats_map(
      [...officialListings, ...candidateListings.listings].map(getListingPublicId)
    )
  ]);

  const imagesByListing = new Map<string, { image_url: string; sort_order: number; caption: string | null }[]>();
  for (const image of imagesResult.data ?? []) {
    const current = imagesByListing.get(image.listing_id) ?? [];
    current.push({ image_url: image.image_url, sort_order: image.sort_order, caption: image.caption });
    imagesByListing.set(image.listing_id, current);
  }
  const geocodingByPostalCode = new Map((geocodingResult.data ?? []).map((row) => [row.postal_code, row]));
  const commuteByPostalCode = new Map((commuteResult.data ?? []).map((row) => [row.postal_code, row]));
  const hydrate = (listing: ListingCard): ListingCard => {
    const geocoding = listing.postal_code ? geocodingByPostalCode.get(listing.postal_code) ?? null : null;
    const commute = listing.postal_code ? commuteByPostalCode.get(listing.postal_code) ?? null : null;
    return {
      ...listing,
      geocoding,
      ntu_commute: build_listing_commute(listing.postal_code, listing.mrt, geocoding, commute),
      listing_images: listing.card_source === "official" ? imagesByListing.get(listing.id) ?? [] : listing.listing_images ?? [],
      user_preference_stats: preferenceStatsByKey.get(getListingPublicId(listing))
    };
  };

  return {
    officialListings: officialListings.map(hydrate),
    candidateListings: candidateListings.listings.map(hydrate)
  };
}

export async function searchListings(searchParams: Record<string, string | string[] | undefined>) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const visibility_cutoff = get_listing_visibility_cutoff();
  const keyword = String(searchParams.q ?? "").trim();
  const requestedPage = Math.max(1, Number.parseInt(String(searchParams.page ?? "1"), 10) || 1);
  const pageSize = 18;
  const candidateNo = parseCandidateNo(keyword);
  const selectedFacilities = Array.isArray(searchParams.facility)
    ? searchParams.facility.map(String)
    : searchParams.facility
      ? [String(searchParams.facility)]
      : [];

  const location = String(searchParams.location ?? "").trim();
  let locationPostalCodes: string[] = [];
  if (location) {
    const escaped = location.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    const { data: matchingGeocoding } = await supabase
      .from("geocoding_cache")
      .select("postal_code")
      .or(`postal_code.ilike.%${escaped}%,block.ilike.%${escaped}%,road_name.ilike.%${escaped}%,building.ilike.%${escaped}%`)
      .limit(100);
    locationPostalCodes = [...new Set((matchingGeocoding ?? []).map((row) => row.postal_code).filter(Boolean))];
  }

  let query = supabase
    .from("listings")
    .select("id,listing_no,title,rent_amount,room_type,postal_code,available_from,available_note,min_lease_months,cooking_policy,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count,description,description_clean,updated_at", { count: "exact" })
    .eq("status", "published")
    .gte("updated_at", visibility_cutoff);

  if (candidateNo) {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  if (selectedFacilities.length > 0) {
    const { data: facilityRows, error: facilityError } = await supabase
      .from("listing_facilities")
      .select("listing_id,facility_name")
      .in("facility_name", selectedFacilities)
      .in("availability", ["available", "restricted"]);

    if (facilityError) throw new Error(facilityError.message);
    const counts = new Map<string, Set<string>>();
    for (const row of facilityRows ?? []) {
      const set = counts.get(row.listing_id) ?? new Set<string>();
      set.add(row.facility_name);
      counts.set(row.listing_id, set);
    }
    const matchingIds = [...counts.entries()].filter(([, set]) => set.size === selectedFacilities.length).map(([id]) => id);
    query = matchingIds.length === 0
      ? query.eq("id", "00000000-0000-0000-0000-000000000000")
      : query.in("id", matchingIds);
  }

  if (keyword && !candidateNo) {
    const escaped = keyword.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    if (/^[0-9]{5}$/.test(keyword)) query = query.eq("listing_no", Number(keyword));
    else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keyword)) query = query.eq("id", keyword);
    else query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,description_clean.ilike.%${escaped}%`);
  }
  if (searchParams.min_price) query = query.gte("rent_amount", Number(searchParams.min_price));
  if (searchParams.max_price) query = query.lte("rent_amount", Number(searchParams.max_price));
  if (searchParams.room_type) query = query.eq("room_type", searchParams.room_type);
  if (searchParams.available_from) query = query.lte("available_from", String(searchParams.available_from));
  if (searchParams.min_lease_months) query = query.lte("min_lease_months", Number(searchParams.min_lease_months));
  if (searchParams.cooking_allowed === "on") query = query.in("cooking_policy", ["full", "light"]);
  if (searchParams.registration_allowed === "on") query = query.eq("registration_allowed", true);
  if (searchParams.no_landlord === "on") query = query.eq("landlord_staying", false);
  if (searchParams.max_bathroom_shared) query = query.lte("bathroom_shared_with_count", Number(searchParams.max_bathroom_shared));
  if (searchParams.max_current_occupants) query = query.lte("current_occupants_count", Number(searchParams.max_current_occupants));
  if (searchParams.gender_preference) query = query.in("gender_preference", ["any", String(searchParams.gender_preference)]);

  if (location) {
    query = locationPostalCodes.length === 0
      ? query.eq("id", "00000000-0000-0000-0000-000000000000")
      : query.in("postal_code", locationPostalCodes);
  }

  const sort = String(searchParams.sort ?? "latest");
  if (sort === "price_asc") query = query.order("rent_amount", { ascending: true });
  else if (sort === "available_soon") query = query.order("available_from", { ascending: true });
  else query = query.order("updated_at", { ascending: false });

  const [{ data, error, count: officialCount }, candidateResult] = await Promise.all([
    query.limit(LISTING_SEARCH_QUERY_LIMIT),
    selectedFacilities.length > 0
      ? Promise.resolve({ listings: [] as ListingCard[], total: 0 })
      : searchCandidateListings(adminSupabase, searchParams, keyword, candidateNo, location, locationPostalCodes, 500)
  ]);
  if (error) throw new Error(error.message);

  const officialListings = ((data ?? []) as ListingCard[]).map((listing) => ({
    ...listing,
    card_source: "official" as const
  }));

  const listings = [...officialListings, ...candidateResult.listings];
  const total = (officialCount ?? officialListings.length) + candidateResult.total;
  const officialIds = officialListings.map((listing) => listing.id);
  const postalCodes = [...new Set(listings.map((listing) => listing.postal_code).filter(Boolean))] as string[];
  if (listings.length === 0) {
    return { listings, total, page: 1, page_size: pageSize, total_pages: 0 };
  }

  const [imagesResult, geocodingResult, commuteResult] = await Promise.all([
    officialIds.length > 0
      ? supabase
        .from("listing_images")
        .select("listing_id,image_url,sort_order,caption")
        .in("listing_id", officialIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as { listing_id: string; image_url: string; sort_order: number; caption: string | null }[] }),
    postalCodes.length > 0
      ? supabase
        .from("geocoding_cache")
        .select("postal_code,block,road_name,building,property_type,latitude,longitude")
        .in("postal_code", postalCodes)
        .eq("status", "success")
      : Promise.resolve({ data: [] as { postal_code: string; block: string | null; road_name: string | null; building: string | null; property_type: string | null; latitude: number | null; longitude: number | null }[] }),
    postalCodes.length > 0
      ? adminSupabase
        .from("listing_commute_cache")
        .select("postal_code,ntu_bus_minutes,ntu_drive_minutes,ntu_straight_distance_km,status,skip_reason,computed_at")
        .in("postal_code", postalCodes)
      : Promise.resolve({ data: [] as NonNullable<ListingCard["ntu_commute"]>[] })
  ]);

  const imagesByListing = new Map<string, { image_url: string; sort_order: number; caption: string | null }[]>();
  for (const image of imagesResult.data ?? []) {
    const current = imagesByListing.get(image.listing_id) ?? [];
    current.push({ image_url: image.image_url, sort_order: image.sort_order, caption: image.caption });
    imagesByListing.set(image.listing_id, current);
  }
  const geocodingByPostalCode = new Map((geocodingResult.data ?? []).map((row) => [row.postal_code, row]));
  const commuteByPostalCode = new Map((commuteResult.data ?? []).map((row) => [row.postal_code, row]));

  const hydrated = listings.map((listing) => {
    const geocoding = listing.postal_code ? geocodingByPostalCode.get(listing.postal_code) ?? null : null;
    const commute = listing.postal_code ? commuteByPostalCode.get(listing.postal_code) ?? null : null;
    return {
      ...listing,
      geocoding,
      ntu_commute: build_listing_commute(listing.postal_code, listing.mrt, geocoding, commute),
      listing_images: listing.card_source === "official" ? imagesByListing.get(listing.id) ?? [] : listing.listing_images ?? []
    };
  });

  if (sort === "price_asc") hydrated.sort((a, b) => a.rent_amount - b.rent_amount);
  else if (sort === "available_soon") hydrated.sort(compareAvailableFrom);
  else if (sort === "ntu_commute") hydrated.sort(compareNtuCommute);
  else hydrated.sort((a, b) => listing_display_timestamp(b) - listing_display_timestamp(a));

  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, totalPages);
  const pageStart = (page - 1) * pageSize;
  const page_listings = hydrated.slice(pageStart, pageStart + pageSize);
  const preference_stats_by_key = await get_listing_preference_stats_map(
    page_listings.map(getListingPublicId)
  );
  return {
    listings: page_listings.map((listing) => ({
      ...listing,
      user_preference_stats: preference_stats_by_key.get(getListingPublicId(listing))
    })),
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages
  };
}

function compareAvailableFrom(left: ListingCard, right: ListingCard) {
  if (!left.available_from && !right.available_from) return 0;
  if (!left.available_from) return 1;
  if (!right.available_from) return -1;
  return left.available_from.localeCompare(right.available_from);
}

function compareNtuCommute(left: ListingCard, right: ListingCard) {
  const left_commute = left.ntu_commute;
  const right_commute = right.ntu_commute;
  const left_group = commuteSortGroup(left_commute);
  const right_group = commuteSortGroup(right_commute);
  if (left_group !== right_group) return left_group - right_group;

  if (left_group === 0) {
    return (left_commute?.ntu_bus_minutes ?? Number.POSITIVE_INFINITY) -
      (right_commute?.ntu_bus_minutes ?? Number.POSITIVE_INFINITY);
  }
  return (left_commute?.ntu_straight_distance_km ?? Number.POSITIVE_INFINITY) -
    (right_commute?.ntu_straight_distance_km ?? Number.POSITIVE_INFINITY);
}

function commuteSortGroup(commute: ListingCard["ntu_commute"]) {
  if (commute?.ntu_bus_minutes != null) return 0;
  if (commute?.ntu_straight_distance_km != null && commute.status !== "skipped_far") return 1;
  if (commute?.status === "skipped_far") return 2;
  return 3;
}

async function searchCandidateListings(
  supabase: ReturnType<typeof createAdminClient>,
  searchParams: Record<string, string | string[] | undefined>,
  keyword: string,
  candidateNo: number | null,
  location: string,
  locationPostalCodes: string[],
  limit = 60
): Promise<{ listings: ListingCard[]; total: number }> {
  let query = supabase
    .from("listing_import_candidates")
    .select("id,candidate_no,ingestion_listing_id,source,source_url,parsed_title,parsed_rent_amount,parsed_postal_code,parsed_area,parsed_mrt,parsed_room_type,parsed_available_from,parsed_available_note,parsed_min_lease_months,parsed_cooking_policy,parsed_registration_allowed,parsed_landlord_staying,parsed_bathroom_shared_with_count,parsed_current_occupants_count,parsed_description,parsed_description_clean,updated_at")
    .in("import_status", ["parsed", "needs_review", "approved"])
    .is("listing_id", null)
    .not("parsed_title", "is", null)
    .not("parsed_rent_amount", "is", null);

  if (candidateNo) {
    query = query.eq("candidate_no", candidateNo);
  } else if (keyword) {
    const escaped = keyword.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    query = query.or(`parsed_title.ilike.%${escaped}%,parsed_description.ilike.%${escaped}%,parsed_description_clean.ilike.%${escaped}%,parsed_area.ilike.%${escaped}%,parsed_mrt.ilike.%${escaped}%`);
  }

  if (searchParams.min_price) query = query.gte("parsed_rent_amount", Number(searchParams.min_price));
  if (searchParams.max_price) query = query.lte("parsed_rent_amount", Number(searchParams.max_price));
  if (searchParams.room_type) query = query.eq("parsed_room_type", searchParams.room_type);
  if (searchParams.available_from) query = query.lte("parsed_available_from", String(searchParams.available_from));
  if (searchParams.min_lease_months) query = query.lte("parsed_min_lease_months", Number(searchParams.min_lease_months));
  if (searchParams.cooking_allowed === "on") query = query.in("parsed_cooking_policy", ["full", "light"]);
  if (searchParams.registration_allowed === "on") query = query.eq("parsed_registration_allowed", true);
  if (searchParams.no_landlord === "on") query = query.eq("parsed_landlord_staying", false);
  if (searchParams.max_bathroom_shared) query = query.lte("parsed_bathroom_shared_with_count", Number(searchParams.max_bathroom_shared));
  if (searchParams.max_current_occupants) query = query.lte("parsed_current_occupants_count", Number(searchParams.max_current_occupants));

  if (searchParams.gender_preference || (Array.isArray(searchParams.facility) ? searchParams.facility.length > 0 : searchParams.facility)) {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  if (location) {
    const escaped = location.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    const locationFilters = [
      `parsed_postal_code.ilike.%${escaped}%`,
      `parsed_area.ilike.%${escaped}%`,
      `parsed_mrt.ilike.%${escaped}%`
    ];
    if (locationPostalCodes.length > 0) locationFilters.push(`parsed_postal_code.in.(${locationPostalCodes.join(",")})`);
    query = query.or(locationFilters.join(","));
  }

  const sort = String(searchParams.sort ?? "latest");
  if (sort === "price_asc") query = query.order("parsed_rent_amount", { ascending: true });
  else if (sort === "available_soon") query = query.order("parsed_available_from", { ascending: true });
  else query = query.order("updated_at", { ascending: false });

  const { data, error } = await query.limit(LISTING_SEARCH_QUERY_LIMIT);
  if (error) throw new Error(error.message);

  const ingestionIds = (data ?? []).map((candidate) => candidate.ingestion_listing_id);
  const { data: ingestionRows, error: ingestionError } = ingestionIds.length > 0
    ? await supabase
      .from("ingestion_listings")
      .select("id,listing_url,detail_url,list_raw_html,list_raw_text,raw_detail_html,scraped_at")
      .in("id", ingestionIds)
    : { data: [], error: null };
  if (ingestionError) throw new Error(ingestionError.message);

  const ingestionById = new Map((ingestionRows ?? []).map((row) => [String(row.id), row]));

  const visible_candidates = (data ?? []).map((candidate) => ({
    ...(() => {
      const ingestion = ingestionById.get(String(candidate.ingestion_listing_id));
      const pageUrl = candidate.source_url || ingestion?.detail_url || ingestion?.listing_url;
      return {
        source_posted_at: parse_candidate_source_posted_at(
          ingestion?.list_raw_text,
          ingestion?.raw_detail_html,
          ingestion?.scraped_at
        ),
        listing_images: extract_candidate_images({
          detail_html: ingestion?.raw_detail_html,
          list_html: ingestion?.list_raw_html,
          page_url: pageUrl
        })
      };
    })(),
    id: `candidate-${candidate.id}`,
    candidate_no: candidate.candidate_no,
    listing_no: null,
    title: candidate.parsed_title ?? "未命名网络房源",
    rent_amount: candidate.parsed_rent_amount ?? 0,
    room_type: candidate.parsed_room_type,
    postal_code: candidate.parsed_postal_code,
    mrt: candidate.parsed_mrt,
    available_from: candidate.parsed_available_from ?? parseListingAvailability(candidate.parsed_description_clean ?? candidate.parsed_description).date,
    available_note: candidate.parsed_available_note ?? parseListingAvailability(candidate.parsed_description_clean ?? candidate.parsed_description).note,
    min_lease_months: candidate.parsed_min_lease_months,
    cooking_policy: candidate.parsed_cooking_policy as ListingCard["cooking_policy"],
    registration_allowed: candidate.parsed_registration_allowed,
    landlord_staying: candidate.parsed_landlord_staying,
    bathroom_shared_with_count: candidate.parsed_bathroom_shared_with_count,
    current_occupants_count: candidate.parsed_current_occupants_count,
    description: null,
    description_clean: cleanPublicListingDescription(candidate.parsed_description_clean ?? candidate.parsed_description, candidate.parsed_title),
    updated_at: candidate.updated_at,
    source_url: candidate.source_url,
    geocoding: null,
    ntu_commute: null,
    card_source: "candidate" as const
  })).filter((listing) =>
    Boolean(listing.postal_code || listing.mrt) &&
    is_listing_date_visible(listing.source_posted_at ?? listing.updated_at)
  );

  if (sort === "price_asc") visible_candidates.sort((a, b) => a.rent_amount - b.rent_amount);
  else if (sort === "available_soon") visible_candidates.sort(compareAvailableFrom);
  else visible_candidates.sort((a, b) => listing_display_timestamp(b) - listing_display_timestamp(a));
  return {
    listings: visible_candidates.slice(0, limit),
    total: visible_candidates.length
  };
}

function listing_display_timestamp(listing: ListingCard): number {
  return Date.parse(listing.source_posted_at ?? listing.updated_at);
}

function build_listing_commute(
  postal_code: string | null,
  mrt: string | null | undefined,
  geocoding: ListingCard["geocoding"],
  commute: ListingCard["ntu_commute"]
) {
  const postal_commute = build_ntu_commute_fallback(postal_code, geocoding, commute);
  const mrt_estimate = build_mrt_commute_estimate(mrt);
  if (postal_commute && mrt_estimate && postal_commute.ntu_bus_minutes == null) {
    return {
      ...postal_commute,
      ntu_bus_minutes: mrt_estimate.ntu_bus_minutes,
      ntu_drive_minutes: postal_commute.ntu_drive_minutes ?? mrt_estimate.ntu_drive_minutes,
      is_estimated: true,
      estimate_basis: mrt_estimate.estimate_basis
    };
  }
  return postal_commute ?? mrt_estimate;
}

export async function getListingDetail(id: string) {
  const candidateNo = parseCandidateNo(id);
  if (candidateNo) {
    return getCandidateListingDetailByNumber(candidateNo);
  }

  if (id.startsWith("candidate-")) {
    return getCandidateListingDetail(id.slice("candidate-".length));
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  let query = supabase
    .from("listings")
    .select("id,listing_no,owner_id,status,title,listing_type,room_type,rent_amount,deposit_amount,postal_code,available_from,available_note,min_lease_months,max_occupants,gender_preference,registration_allowed,landlord_staying,total_bedrooms,total_bathrooms,current_occupants_count,bathroom_shared_with_count,description,description_clean,source,contact_visibility,wechat,phone,is_owner_direct,is_agent,is_sublet,verification_status,utilities_policy,aircon_policy,cooking_policy,visitors_policy,smoking_policy,pets_policy,tenant_type_preference,updated_at");
  query = /^[0-9]{5}$/.test(id)
    ? query.eq("listing_no", Number(id))
    : query.eq("id", id);
  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;

  const listingId = data.id;

  const listing_key = data.listing_no ? String(data.listing_no).padStart(5, "0") : data.id;
  const [images, facilitiesRows, nearbyRows, geocoding, commute, user_preference_stats] = await Promise.all([
    supabase.from("listing_images").select("image_url,sort_order,caption").eq("listing_id", listingId).order("sort_order", { ascending: true }),
    supabase.from("listing_facilities").select("facility_name,availability,note").eq("listing_id", listingId),
    data.postal_code
      ? supabase.from("nearby_places_cache").select("place_type,name,distance_meters,walking_minutes").eq("postal_code", data.postal_code)
      : Promise.resolve({ data: [] }),
    supabase
      .from("geocoding_cache")
      .select("block,road_name,building,property_type,latitude,longitude")
      .eq("postal_code", data.postal_code)
      .eq("status", "success")
      .maybeSingle(),
    adminSupabase
      .from("listing_commute_cache")
      .select("postal_code,ntu_bus_minutes,ntu_drive_minutes,ntu_straight_distance_km,status,skip_reason,computed_at")
      .eq("postal_code", data.postal_code)
      .maybeSingle(),
    get_listing_preference_stats(listing_key)
  ]);

  return {
    ...data,
    tenant_type_preference: Array.isArray(data.tenant_type_preference) ? data.tenant_type_preference : [],
    geocoding: geocoding.data ?? null,
    ntu_commute: build_ntu_commute_fallback(data.postal_code, geocoding.data ?? null, commute.data ?? null),
    listing_images: images.data ?? [],
    listing_facilities: facilitiesRows.data ?? [],
    nearby_places_cache: nearbyRows.data ?? [],
    user_preference_stats,
    detail_source: "official"
  } as ListingDetail;
}

async function getCandidateListingDetail(candidateId: string): Promise<ListingDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId)) {
    return null;
  }

  const supabase = createAdminClient();
  const primaryResult = await supabase
    .from("listing_import_candidates")
    .select("id,candidate_no,ingestion_listing_id,source,source_url,parsed_title,parsed_description,parsed_description_clean,parsed_rent_amount,parsed_deposit_amount,parsed_postal_code,parsed_mrt,parsed_listing_type,parsed_room_type,parsed_available_from,parsed_available_note,parsed_min_lease_months,parsed_max_occupants,parsed_registration_allowed,parsed_landlord_staying,parsed_total_bedrooms,parsed_total_bathrooms,parsed_current_occupants_count,parsed_bathroom_shared_with_count,parsed_gender_preference,parsed_wechat,parsed_phone,parsed_is_owner_direct,parsed_is_agent,parsed_is_sublet,parsed_utilities_policy,parsed_aircon_policy,parsed_cooking_policy,parsed_visitors_policy,parsed_smoking_policy,parsed_pets_policy,parsed_tenant_type_preference,parsed_facilities,updated_at")
    .eq("id", candidateId)
    .in("import_status", ["parsed", "needs_review", "approved"])
    .is("listing_id", null)
    .maybeSingle();
  const facilitiesColumnMissing = primaryResult.error?.code === "42703"
    && primaryResult.error.message.includes("parsed_facilities");
  const fallbackResult = facilitiesColumnMissing
    ? await supabase
      .from("listing_import_candidates")
      .select("id,candidate_no,ingestion_listing_id,source,source_url,parsed_title,parsed_description,parsed_description_clean,parsed_rent_amount,parsed_deposit_amount,parsed_postal_code,parsed_mrt,parsed_listing_type,parsed_room_type,parsed_available_from,parsed_available_note,parsed_min_lease_months,parsed_max_occupants,parsed_registration_allowed,parsed_landlord_staying,parsed_total_bedrooms,parsed_total_bathrooms,parsed_current_occupants_count,parsed_bathroom_shared_with_count,parsed_gender_preference,parsed_wechat,parsed_phone,parsed_is_owner_direct,parsed_is_agent,parsed_is_sublet,parsed_utilities_policy,parsed_aircon_policy,parsed_cooking_policy,parsed_visitors_policy,parsed_smoking_policy,parsed_pets_policy,parsed_tenant_type_preference,updated_at")
      .eq("id", candidateId)
      .in("import_status", ["parsed", "needs_review", "approved"])
      .is("listing_id", null)
      .maybeSingle()
    : null;
  const error = fallbackResult ? fallbackResult.error : primaryResult.error;
  const data = fallbackResult?.data
    ? { ...fallbackResult.data, parsed_facilities: null }
    : primaryResult.data;

  if (error || !data) return null;

  const postalCode = data.parsed_postal_code;
  if (!postalCode && !data.parsed_mrt) return null;

  const listing_key = data.candidate_no
    ? `C${String(data.candidate_no).padStart(4, "0")}`
    : `candidate-${data.id}`;
  const [geocoding, commute, nearbyRows, ingestion, user_preference_stats] = await Promise.all([
    postalCode
      ? supabase
        .from("geocoding_cache")
        .select("block,road_name,building,property_type,latitude,longitude")
        .eq("postal_code", postalCode)
        .eq("status", "success")
        .maybeSingle()
      : Promise.resolve({ data: null }),
    postalCode
      ? supabase
        .from("listing_commute_cache")
        .select("postal_code,ntu_bus_minutes,ntu_drive_minutes,ntu_straight_distance_km,status,skip_reason,computed_at")
        .eq("postal_code", postalCode)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    postalCode
      ? supabase
        .from("nearby_places_cache")
        .select("place_type,name,distance_meters,walking_minutes")
        .eq("postal_code", postalCode)
      : Promise.resolve({ data: [] }),
    supabase
      .from("ingestion_listings")
      .select("listing_url,detail_url,list_raw_html,raw_detail_html")
      .eq("id", data.ingestion_listing_id)
      .maybeSingle(),
    get_listing_preference_stats(listing_key)
  ]);
  const pageUrl = data.source_url || ingestion.data?.detail_url || ingestion.data?.listing_url;
  const candidateImages = extract_candidate_images({
    detail_html: ingestion.data?.raw_detail_html,
    list_html: ingestion.data?.list_raw_html,
    page_url: pageUrl
  });
  const structuredFacts = extractListingStructuredFacts(data.parsed_description_clean ?? data.parsed_description);
  const fallbackAvailability = parseListingAvailability(data.parsed_description_clean ?? data.parsed_description);
  const baseDescriptionClean = cleanPublicListingDescription(data.parsed_description_clean ?? data.parsed_description, data.parsed_title);
  const parsedFacilities = normalizeParsedFacilities(data.parsed_facilities, data.parsed_description_clean ?? data.parsed_description);
  const descriptionClean = removeExtractedFacilityText(baseDescriptionClean);

  return {
    id: `candidate-${data.id}`,
    candidate_no: data.candidate_no,
    listing_no: null,
    title: data.parsed_title ?? "未命名网络房源",
    rent_amount: data.parsed_rent_amount ?? 0,
    room_type: data.parsed_room_type ?? structuredFacts.room_type,
    postal_code: postalCode,
    mrt: data.parsed_mrt,
    available_from: data.parsed_available_from ?? structuredFacts.available_from ?? fallbackAvailability.date,
    available_note: data.parsed_available_note ?? structuredFacts.available_note ?? fallbackAvailability.note,
    min_lease_months: data.parsed_min_lease_months ?? structuredFacts.min_lease_months,
    cooking_policy: data.parsed_cooking_policy as ListingDetail["cooking_policy"],
    registration_allowed: data.parsed_registration_allowed,
    landlord_staying: data.parsed_landlord_staying,
    bathroom_shared_with_count: data.parsed_bathroom_shared_with_count,
    current_occupants_count: data.parsed_current_occupants_count,
    description: null,
    description_clean: descriptionClean,
    updated_at: data.updated_at,
    geocoding: geocoding.data ?? null,
    ntu_commute: build_listing_commute(postalCode, data.parsed_mrt, geocoding.data ?? null, commute.data ?? null),
    listing_images: candidateImages,
    card_source: "candidate",
    source_url: data.source_url,
    owner_id: null,
    status: null,
    listing_type: data.parsed_listing_type,
    deposit_amount: data.parsed_deposit_amount,
    max_occupants: data.parsed_max_occupants,
    gender_preference: data.parsed_gender_preference ?? structuredFacts.gender_preference,
    source: data.source,
    contact_visibility: null,
    wechat: data.parsed_wechat,
    phone: data.parsed_phone,
    is_owner_direct: data.parsed_is_owner_direct,
    is_agent: data.parsed_is_agent,
    is_sublet: data.parsed_is_sublet,
    verification_status: null,
    utilities_policy: data.parsed_utilities_policy as ListingDetail["utilities_policy"],
    aircon_policy: data.parsed_aircon_policy as ListingDetail["aircon_policy"],
    visitors_policy: data.parsed_visitors_policy as ListingDetail["visitors_policy"],
    smoking_policy: data.parsed_smoking_policy as ListingDetail["smoking_policy"],
    pets_policy: data.parsed_pets_policy as ListingDetail["pets_policy"],
    tenant_type_preference: Array.isArray(data.parsed_tenant_type_preference) ? data.parsed_tenant_type_preference : [],
    total_bedrooms: data.parsed_total_bedrooms ?? structuredFacts.total_bedrooms,
    total_bathrooms: data.parsed_total_bathrooms ?? structuredFacts.total_bathrooms,
    listing_facilities: parsedFacilities,
    nearby_places_cache: nearbyRows.data ?? [],
    user_preference_stats,
    detail_source: "candidate"
  };
}

async function getCandidateListingDetailByNumber(candidateNo: number): Promise<ListingDetail | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("listing_import_candidates")
    .select("id")
    .eq("candidate_no", candidateNo)
    .in("import_status", ["parsed", "needs_review", "approved"])
    .is("listing_id", null)
    .maybeSingle();

  if (error || !data) return null;
  return getCandidateListingDetail(data.id);
}

function normalizeParsedFacilities(value: unknown, fallbackText: string | null | undefined): NonNullable<ListingDetail["listing_facilities"]> {
  const rows = Array.isArray(value) && value.length > 0 ? value : extractListingFacilities(fallbackText);
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const facility_name = "facility_name" in row ? String(row.facility_name) : "";
    const availability = "availability" in row ? String(row.availability) : "available";
    if (!facilities.includes(facility_name as (typeof facilities)[number])) return [];
    if (!["available", "restricted", "not_available"].includes(availability)) return [];
    return [{
      facility_name,
      availability: availability as FacilityAvailability,
      note: "note" in row && typeof row.note === "string" && row.note.trim() ? row.note.trim() : null
    }];
  });
}

export async function findListingId(searchValue: string) {
  const value = searchValue.trim();
  const candidateNo = parseCandidateNo(value);
  if (candidateNo) {
    const adminSupabase = createAdminClient();
    const { data } = await adminSupabase
      .from("listing_import_candidates")
      .select("id")
      .eq("candidate_no", candidateNo)
      .in("import_status", ["parsed", "needs_review", "approved"])
      .is("listing_id", null)
      .maybeSingle();
    return data?.id ? `C${String(candidateNo).padStart(4, "0")}` : null;
  }

  if (!/^[0-9]{5}$/.test(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }

  const supabase = await createClient();
  const query = supabase.from("listings").select("id,listing_no").eq("status", "published");
  const { data } = /^[0-9]{5}$/.test(value)
    ? await query.eq("listing_no", Number(value)).maybeSingle()
    : await query.eq("id", value).maybeSingle();
  return data?.listing_no ? String(data.listing_no).padStart(5, "0") : data?.id ?? null;
}
