"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

export async function createListing(
  _previousState: CreateListingState,
  formData: FormData
): Promise<CreateListingState> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return createListingError("session_expired", 4);
  }

  if (!["landlord", "agent", "admin"].includes(profile.role)) {
    return createListingError("listing_role", 4);
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
    return createListingError("image_count", 4);
  }
  if (imageFiles.some(({ value }) => !allowedImageTypes.has(value.type))) {
    return createListingError("image_type", 4);
  }
  if (imageFiles.some(({ value }) => value.size > maxImageSize)) {
    return createListingError("image_size", 4);
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
    await supabase.from("listings").delete().eq("id", listing.id);
    return createListingError("create_failed", 3);
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
      return createListingError("image_upload", 4);
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
      return createListingError("image_upload", 4);
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

export async function submitListingForReview(listingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update({ status: "pending_review" }).eq("id", listingId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function getHomeListings() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const [{ data, error }, candidateListings] = await Promise.all([
    supabase
      .from("listings")
      .select("id,listing_no,title,rent_amount,room_type,postal_code,available_from,available_note,min_lease_months,cooking_policy,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count,description,description_clean,updated_at")
      .eq("status", "published")
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
    [...officialListings, ...candidateListings]
      .map((listing) => listing.postal_code)
      .filter(Boolean)
  )] as string[];

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
  const hydrate = (listing: ListingCard): ListingCard => ({
    ...listing,
    geocoding: listing.postal_code ? geocodingByPostalCode.get(listing.postal_code) ?? null : null,
    ntu_commute: listing.postal_code ? commuteByPostalCode.get(listing.postal_code) ?? null : null,
    listing_images: listing.card_source === "official" ? imagesByListing.get(listing.id) ?? [] : []
  });

  return {
    officialListings: officialListings.map(hydrate),
    candidateListings: candidateListings.map(hydrate)
  };
}

export async function searchListings(searchParams: Record<string, string | string[] | undefined>) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const profile = await getCurrentProfile();
  const keyword = String(searchParams.q ?? "").trim();
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
    .select("id,listing_no,title,rent_amount,room_type,postal_code,available_from,available_note,min_lease_months,cooking_policy,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count,description,description_clean,updated_at")
    .eq("status", "published");

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

  const [{ data, error }, candidateListings] = await Promise.all([
    query.limit(60),
    selectedFacilities.length > 0 || profile?.role !== "admin"
      ? Promise.resolve([] as ListingCard[])
      : searchCandidateListings(adminSupabase, searchParams, keyword, candidateNo, location, locationPostalCodes)
  ]);
  if (error) throw new Error(error.message);

  const officialListings = ((data ?? []) as ListingCard[]).map((listing) => ({
    ...listing,
    card_source: "official" as const
  }));

  const listings = [...officialListings, ...candidateListings];
  const officialIds = officialListings.map((listing) => listing.id);
  const postalCodes = [...new Set(listings.map((listing) => listing.postal_code).filter(Boolean))] as string[];
  if (listings.length === 0) return listings;

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

  const hydrated = listings.map((listing) => ({
    ...listing,
    geocoding: listing.postal_code ? geocodingByPostalCode.get(listing.postal_code) ?? null : null,
    ntu_commute: listing.postal_code ? commuteByPostalCode.get(listing.postal_code) ?? null : null,
    listing_images: listing.card_source === "official" ? imagesByListing.get(listing.id) ?? [] : []
  }));

  if (sort === "price_asc") return hydrated.sort((a, b) => a.rent_amount - b.rent_amount).slice(0, 60);
  if (sort === "available_soon") return hydrated.sort((a, b) => a.available_from.localeCompare(b.available_from)).slice(0, 60);
  if (sort === "ntu_commute") return hydrated.sort(compareNtuCommute).slice(0, 60);
  return hydrated
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 60);
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
): Promise<ListingCard[]> {
  let query = supabase
    .from("listing_import_candidates")
    .select("id,candidate_no,source,source_url,parsed_title,parsed_rent_amount,parsed_postal_code,parsed_area,parsed_mrt,parsed_room_type,parsed_available_from,parsed_available_note,parsed_min_lease_months,parsed_cooking_policy,parsed_registration_allowed,parsed_landlord_staying,parsed_bathroom_shared_with_count,parsed_current_occupants_count,parsed_description,parsed_description_clean,updated_at")
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

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((candidate) => ({
    id: `candidate-${candidate.id}`,
    candidate_no: candidate.candidate_no,
    listing_no: null,
    title: candidate.parsed_title ?? "未命名网络房源",
    rent_amount: candidate.parsed_rent_amount ?? 0,
    room_type: candidate.parsed_room_type,
    postal_code: candidate.parsed_postal_code,
    available_from: candidate.parsed_available_from ?? new Date().toISOString().slice(0, 10),
    available_note: candidate.parsed_available_note,
    min_lease_months: candidate.parsed_min_lease_months ?? 6,
    cooking_policy: candidate.parsed_cooking_policy as ListingCard["cooking_policy"],
    registration_allowed: candidate.parsed_registration_allowed ?? false,
    landlord_staying: candidate.parsed_landlord_staying ?? false,
    bathroom_shared_with_count: candidate.parsed_bathroom_shared_with_count,
    current_occupants_count: candidate.parsed_current_occupants_count,
    description: candidate.parsed_description,
    description_clean: candidate.parsed_description_clean,
    updated_at: candidate.updated_at,
    source_url: candidate.source_url,
    geocoding: null,
    ntu_commute: null,
    listing_images: [],
    card_source: "candidate" as const
  }));
}

export async function getListingDetail(id: string) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id,listing_no,owner_id,status,title,listing_type,room_type,rent_amount,deposit_amount,postal_code,available_from,available_note,min_lease_months,max_occupants,gender_preference,registration_allowed,landlord_staying,total_bedrooms,total_bathrooms,current_occupants_count,bathroom_shared_with_count,description,description_clean,source,contact_visibility,wechat,phone,is_owner_direct,is_agent,is_sublet,verification_status,utilities_policy,aircon_policy,cooking_policy,visitors_policy,smoking_policy,pets_policy,tenant_type_preference,updated_at")
    .eq("id", id)
    .single();

  if (error) return null;

  const [images, facilitiesRows, nearbyRows, geocoding, commute] = await Promise.all([
    supabase.from("listing_images").select("image_url,sort_order,caption").eq("listing_id", id).order("sort_order", { ascending: true }),
    supabase.from("listing_facilities").select("facility_name,availability,note").eq("listing_id", id),
    supabase.from("nearby_places_cache").select("place_type,name,distance_meters,walking_minutes").eq("listing_id", id),
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
      .maybeSingle()
  ]);

  return {
    ...data,
    geocoding: geocoding.data ?? null,
    ntu_commute: commute.data ?? null,
    listing_images: images.data ?? [],
    listing_facilities: facilitiesRows.data ?? [],
    nearby_places_cache: nearbyRows.data ?? []
  } as ListingDetail;
}

export async function findListingId(searchValue: string) {
  const value = searchValue.trim();
  if (!/^[0-9]{5}$/.test(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }

  const supabase = await createClient();
  const query = supabase.from("listings").select("id").eq("status", "published");
  const { data } = /^[0-9]{5}$/.test(value)
    ? await query.eq("listing_no", Number(value)).maybeSingle()
    : await query.eq("id", value).maybeSingle();
  return data?.id ?? null;
}
