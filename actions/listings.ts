"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { facilities, type FacilityAvailability, type ListingCard, type ListingDetail } from "@/lib/types";
import { geocodePostalCode } from "@/services/geocoding";
import { getNearbyPlaces } from "@/services/nearbyPlaces";

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

  const geo = await geocodePostalCode(postalCode);

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      owner_id: profile.id,
      status: "pending_review",
      title,
      listing_type: text(formData, "listing_type", "room"),
      room_type: text(formData, "room_type", "common_room"),
      property_type: text(formData, "property_type", "hdb"),
      rent_amount: rentAmount,
      deposit_amount: intValue(formData, "deposit_amount"),
      postal_code: postalCode,
      block: geo.block,
      street_name: geo.streetName,
      latitude: geo.latitude,
      longitude: geo.longitude,
      nearest_mrt: geo.nearestMrt,
      available_from: availableFrom,
      min_lease_months: intValue(formData, "min_lease_months", 6),
      max_occupants: intValue(formData, "max_occupants", 1),
      gender_preference: text(formData, "gender_preference", "any"),
      cooking_allowed: boolValue(formData, "cooking_allowed"),
      registration_allowed: boolValue(formData, "registration_allowed"),
      visitors_allowed: boolValue(formData, "visitors_allowed"),
      smoking_allowed: boolValue(formData, "smoking_allowed"),
      pets_allowed: boolValue(formData, "pets_allowed"),
      landlord_staying: boolValue(formData, "landlord_staying"),
      total_bedrooms: intValue(formData, "total_bedrooms"),
      total_bathrooms: intValue(formData, "total_bathrooms"),
      current_occupants_count: intValue(formData, "current_occupants_count"),
      bathroom_shared_with_count: intValue(formData, "bathroom_shared_with_count"),
      description: text(formData, "description"),
      house_rules: text(formData, "house_rules")
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

  const places = await getNearbyPlaces(geo.latitude, geo.longitude);

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
  await supabase.from("nearby_places_cache").insert(places.map((place) => ({ listing_id: listing.id, ...place })));
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
      house_rules: text(formData, "house_rules")
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
    .select("id,title,rent_amount,currency,room_type,postal_code,street_name,nearest_mrt,available_from,min_lease_months,cooking_allowed,registration_allowed,landlord_staying,bathroom_shared_with_count,current_occupants_count")
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
  if (keyword) query = query.textSearch("title", keyword, { type: "websearch" });
  if (searchParams.min_price) query = query.gte("rent_amount", Number(searchParams.min_price));
  if (searchParams.max_price) query = query.lte("rent_amount", Number(searchParams.max_price));
  if (searchParams.room_type) query = query.eq("room_type", searchParams.room_type);
  if (searchParams.available_from) query = query.lte("available_from", String(searchParams.available_from));
  if (searchParams.min_lease_months) query = query.lte("min_lease_months", Number(searchParams.min_lease_months));
  if (searchParams.cooking_allowed === "on") query = query.eq("cooking_allowed", true);
  if (searchParams.registration_allowed === "on") query = query.eq("registration_allowed", true);
  if (searchParams.no_landlord === "on") query = query.eq("landlord_staying", false);
  if (searchParams.max_bathroom_shared) query = query.lte("bathroom_shared_with_count", Number(searchParams.max_bathroom_shared));
  if (searchParams.max_current_occupants) query = query.lte("current_occupants_count", Number(searchParams.max_current_occupants));
  if (searchParams.gender_preference) query = query.in("gender_preference", ["any", String(searchParams.gender_preference)]);

  const location = String(searchParams.location ?? "").trim();
  if (location) query = query.or(`postal_code.ilike.%${location}%,street_name.ilike.%${location}%,nearest_mrt.ilike.%${location}%`);

  const sort = String(searchParams.sort ?? "latest");
  if (sort === "price_asc") query = query.order("rent_amount", { ascending: true });
  else if (sort === "available_soon") query = query.order("available_from", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(60);
  if (error) throw new Error(error.message);

  const listings = (data ?? []) as ListingCard[];
  const ids = listings.map((listing) => listing.id);
  if (ids.length === 0) return listings;

  const { data: images } = await supabase
    .from("listing_images")
    .select("listing_id,image_url,sort_order,caption")
    .in("listing_id", ids)
    .order("sort_order", { ascending: true });

  const imagesByListing = new Map<string, { image_url: string; sort_order: number; caption: string | null }[]>();
  for (const image of images ?? []) {
    const current = imagesByListing.get(image.listing_id) ?? [];
    current.push({ image_url: image.image_url, sort_order: image.sort_order, caption: image.caption });
    imagesByListing.set(image.listing_id, current);
  }

  return listings.map((listing) => ({
    ...listing,
    listing_images: imagesByListing.get(listing.id) ?? []
  }));
}

export async function getListingDetail(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;

  const [owner, images, facilitiesRows, nearbyRows] = await Promise.all([
    supabase.from("users_profile").select("display_name,whatsapp,wechat,phone").eq("id", data.owner_id).single(),
    supabase.from("listing_images").select("image_url,sort_order,caption").eq("listing_id", id).order("sort_order", { ascending: true }),
    supabase.from("listing_facilities").select("facility_name,availability,note").eq("listing_id", id),
    supabase.from("nearby_places_cache").select("place_type,name,distance_meters,walking_minutes").eq("listing_id", id)
  ]);

  return {
    ...data,
    users_profile: owner.data ?? null,
    listing_images: images.data ?? [],
    listing_facilities: facilitiesRows.data ?? [],
    nearby_places_cache: nearbyRows.data ?? []
  } as ListingDetail;
}
