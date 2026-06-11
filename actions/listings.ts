"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { facilities, type FacilityAvailability, type ListingCard, type ListingDetail } from "@/lib/types";

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

export async function createListing(formData: FormData) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/landlord/listings/new&reason=listing");
  }

  if (!["landlord", "agent", "admin"].includes(profile.role)) {
    redirect("/landlord/listings/new?error=listing_role");
  }

  const supabase = await createClient();
  const postalCode = text(formData, "postal_code");
  const title = text(formData, "title");
  const rentAmount = intValue(formData, "rent_amount");
  const availableFrom = text(formData, "available_from");

  const validationErrors = new URLSearchParams();
  if (!title) validationErrors.set("missing", "title");
  else if (!postalCode) validationErrors.set("missing", "postal_code");
  else if (!rentAmount) validationErrors.set("missing", "rent_amount");
  else if (!availableFrom) validationErrors.set("missing", "available_from");

  if (validationErrors.size > 0) {
    redirect(`/landlord/listings/new?${validationErrors.toString()}`);
  }

  const isAdmin = profile.role === "admin";
  const description = nullableText(formData, "description");

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      owner_id: profile.id,
      status: "pending_review",
      title,
      listing_type: text(formData, "listing_type", "room"),
      room_type: text(formData, "room_type", "common_room"),
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
      source: isAdmin ? text(formData, "source", "owner_submit") : "owner_submit",
      contact_visibility: text(formData, "contact_visibility", "private"),
      wechat: nullableText(formData, "wechat"),
      phone: nullableText(formData, "phone"),
      is_owner_direct: boolValue(formData, "is_owner_direct"),
      is_agent: boolValue(formData, "is_agent"),
      is_sublet: boolValue(formData, "is_sublet"),
      verification_status: isAdmin ? text(formData, "verification_status", "unverified") : "unverified",
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
    redirect(`/landlord/listings/new?error=create_failed`);
  }

  const facilityRows = facilities.map((facility) => ({
    listing_id: listing.id,
    facility_name: facility,
    availability: text(formData, `facility_${facility}`, "not_available") as FacilityAvailability,
    note: text(formData, `facility_note_${facility}`) || null
  }));

  const imageUrls = formData
    .getAll("image_url")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const imageRows = imageUrls.map((image_url, index) => ({
    listing_id: listing.id,
    image_url,
    sort_order: Number(formData.get(`image_sort_${index}`) ?? index),
    caption: text(formData, `image_caption_${index}`) || null
  }));

  await supabase.from("listing_facilities").insert(facilityRows);
  if (imageRows.length > 0) await supabase.from("listing_images").insert(imageRows);

  revalidatePath("/rent");
  redirect(`/rent/${listing.id}`);
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

export async function searchListings(searchParams: Record<string, string | string[] | undefined>) {
  const supabase = await createClient();
  const selectedFacilities = Array.isArray(searchParams.facility)
    ? searchParams.facility.map(String)
    : searchParams.facility
      ? [String(searchParams.facility)]
      : [];

  let query = supabase
    .from("listings")
    .select("id,listing_no,title,rent_amount,room_type,postal_code,available_from,available_note,min_lease_months,cooking_policy,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count,description,description_clean")
    .eq("status", "published");

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
    if (matchingIds.length === 0) return [];
    query = query.in("id", matchingIds);
  }

  const keyword = String(searchParams.q ?? "").trim();
  if (keyword) {
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

  const location = String(searchParams.location ?? "").trim();
  if (location) {
    const escaped = location.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    const { data: matchingGeocoding } = await supabase
      .from("geocoding_cache")
      .select("postal_code")
      .or(`postal_code.ilike.%${escaped}%,block.ilike.%${escaped}%,road_name.ilike.%${escaped}%,building.ilike.%${escaped}%`)
      .limit(100);
    const postalCodes = [...new Set((matchingGeocoding ?? []).map((row) => row.postal_code).filter(Boolean))];
    if (postalCodes.length === 0) return [];
    query = query.in("postal_code", postalCodes);
  }

  const sort = String(searchParams.sort ?? "latest");
  if (sort === "price_asc") query = query.order("rent_amount", { ascending: true });
  else if (sort === "available_soon") query = query.order("available_from", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(60);
  if (error) throw new Error(error.message);

  const listings = (data ?? []) as ListingCard[];
  const ids = listings.map((listing) => listing.id);
  if (ids.length === 0) return listings;

  const postalCodes = [...new Set(listings.map((listing) => listing.postal_code).filter(Boolean))];
  const [imagesResult, geocodingResult] = await Promise.all([
    supabase
      .from("listing_images")
      .select("listing_id,image_url,sort_order,caption")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true }),
    supabase
      .from("geocoding_cache")
      .select("postal_code,block,road_name,building,property_type,latitude,longitude")
      .in("postal_code", postalCodes)
      .eq("status", "success")
  ]);

  const imagesByListing = new Map<string, { image_url: string; sort_order: number; caption: string | null }[]>();
  for (const image of imagesResult.data ?? []) {
    const current = imagesByListing.get(image.listing_id) ?? [];
    current.push({ image_url: image.image_url, sort_order: image.sort_order, caption: image.caption });
    imagesByListing.set(image.listing_id, current);
  }
  const geocodingByPostalCode = new Map((geocodingResult.data ?? []).map((row) => [row.postal_code, row]));

  return listings.map((listing) => ({
    ...listing,
    geocoding: geocodingByPostalCode.get(listing.postal_code) ?? null,
    listing_images: imagesByListing.get(listing.id) ?? []
  }));
}

export async function getListingDetail(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id,listing_no,owner_id,status,title,listing_type,room_type,rent_amount,deposit_amount,postal_code,available_from,available_note,min_lease_months,max_occupants,gender_preference,registration_allowed,landlord_staying,total_bedrooms,total_bathrooms,current_occupants_count,bathroom_shared_with_count,description,description_clean,source,contact_visibility,wechat,phone,is_owner_direct,is_agent,is_sublet,verification_status,utilities_policy,aircon_policy,cooking_policy,visitors_policy,smoking_policy,pets_policy,tenant_type_preference")
    .eq("id", id)
    .single();

  if (error) return null;

  const [images, facilitiesRows, nearbyRows, geocoding] = await Promise.all([
    supabase.from("listing_images").select("image_url,sort_order,caption").eq("listing_id", id).order("sort_order", { ascending: true }),
    supabase.from("listing_facilities").select("facility_name,availability,note").eq("listing_id", id),
    supabase.from("nearby_places_cache").select("place_type,name,distance_meters,walking_minutes").eq("listing_id", id),
    supabase
      .from("geocoding_cache")
      .select("block,road_name,building,property_type,latitude,longitude")
      .eq("postal_code", data.postal_code)
      .eq("status", "success")
      .maybeSingle()
  ]);

  return {
    ...data,
    geocoding: geocoding.data ?? null,
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
