import type {
  CookingPolicy,
  ListingCard,
  ListingGeocoding,
  NtuCommuteCache
} from "@/lib/types";

const cooking_policies = new Set<CookingPolicy>(["full", "light", "no"]);
const commute_statuses = new Set<NtuCommuteCache["status"]>([
  "pending",
  "processing",
  "success",
  "failed",
  "skipped_far"
]);

export function create_listing_preference_snapshot(listing: ListingCard): ListingCard {
  return {
    id: listing.id,
    listing_no: listing.listing_no,
    candidate_no: listing.candidate_no ?? null,
    title: listing.title,
    rent_amount: listing.rent_amount,
    room_type: listing.room_type,
    postal_code: listing.postal_code,
    mrt: listing.mrt ?? null,
    available_from: listing.available_from,
    available_note: listing.available_note,
    min_lease_months: listing.min_lease_months,
    cooking_policy: listing.cooking_policy,
    registration_allowed: listing.registration_allowed,
    landlord_staying: listing.landlord_staying,
    bathroom_shared_with_count: listing.bathroom_shared_with_count,
    current_occupants_count: listing.current_occupants_count,
    description: null,
    description_clean: null,
    updated_at: listing.updated_at,
    source_posted_at: listing.source_posted_at ?? null,
    geocoding: sanitize_geocoding(listing.geocoding),
    ntu_commute: sanitize_commute(listing.ntu_commute),
    listing_images: sanitize_images(listing.listing_images),
    card_source: listing.card_source,
    source_url: listing.source_url ?? null
  };
}

export function parse_listing_preference_snapshot(value: unknown): ListingCard | null {
  if (!is_record(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 100) return null;
  if (typeof value.title !== "string" || value.title.length === 0 || value.title.length > 500) return null;
  if (typeof value.rent_amount !== "number" || !Number.isSafeInteger(value.rent_amount) || value.rent_amount < 0) return null;
  if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) return null;

  const listing_no = nullable_positive_integer(value.listing_no);
  const candidate_no = nullable_positive_integer(value.candidate_no);
  if (listing_no === undefined || candidate_no === undefined) return null;
  const card_source = value.card_source === "candidate" || value.card_source === "official"
    ? value.card_source
    : undefined;
  const cooking_policy = typeof value.cooking_policy === "string" && cooking_policies.has(value.cooking_policy as CookingPolicy)
    ? value.cooking_policy as CookingPolicy
    : null;

  const snapshot = create_listing_preference_snapshot({
    id: value.id,
    listing_no,
    candidate_no,
    title: value.title,
    rent_amount: value.rent_amount,
    room_type: nullable_string(value.room_type, 100),
    postal_code: nullable_string(value.postal_code, 20),
    mrt: nullable_string(value.mrt, 200),
    available_from: nullable_string(value.available_from, 50),
    available_note: nullable_string(value.available_note, 500),
    min_lease_months: nullable_nonnegative_integer(value.min_lease_months),
    cooking_policy,
    registration_allowed: nullable_boolean(value.registration_allowed),
    landlord_staying: nullable_boolean(value.landlord_staying),
    bathroom_shared_with_count: nullable_nonnegative_integer(value.bathroom_shared_with_count),
    current_occupants_count: nullable_nonnegative_integer(value.current_occupants_count),
    description: null,
    description_clean: null,
    updated_at: value.updated_at,
    source_posted_at: nullable_string(value.source_posted_at, 50),
    geocoding: sanitize_geocoding(value.geocoding),
    ntu_commute: sanitize_commute(value.ntu_commute),
    listing_images: sanitize_images(value.listing_images),
    card_source,
    source_url: nullable_string(value.source_url, 2048)
  });

  return JSON.stringify(snapshot).length <= 65536 ? snapshot : null;
}

function sanitize_images(value: unknown): ListingCard["listing_images"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image) => {
    if (!is_record(image) || typeof image.image_url !== "string" || image.image_url.length > 4096) return [];
    const sort_order = typeof image.sort_order === "number" && Number.isSafeInteger(image.sort_order)
      ? image.sort_order
      : 0;
    return [{
      image_url: image.image_url,
      sort_order,
      caption: nullable_string(image.caption, 500)
    }];
  }).sort((left, right) => left.sort_order - right.sort_order).slice(0, 3);
}

function sanitize_geocoding(value: unknown): ListingGeocoding | null {
  if (!is_record(value)) return null;
  return {
    block: nullable_string(value.block, 100),
    road_name: nullable_string(value.road_name, 300),
    building: nullable_string(value.building, 300),
    property_type: nullable_string(value.property_type, 100),
    latitude: nullable_number(value.latitude),
    longitude: nullable_number(value.longitude)
  };
}

function sanitize_commute(value: unknown): NtuCommuteCache | null {
  if (!is_record(value) || typeof value.postal_code !== "string") return null;
  const status = typeof value.status === "string" && commute_statuses.has(value.status as NtuCommuteCache["status"])
    ? value.status as NtuCommuteCache["status"]
    : "pending";
  return {
    postal_code: value.postal_code.slice(0, 20),
    ntu_bus_minutes: nullable_number(value.ntu_bus_minutes),
    ntu_drive_minutes: nullable_number(value.ntu_drive_minutes),
    ntu_straight_distance_km: nullable_number(value.ntu_straight_distance_km),
    status,
    skip_reason: nullable_string(value.skip_reason, 500),
    computed_at: nullable_string(value.computed_at, 50),
    is_estimated: typeof value.is_estimated === "boolean" ? value.is_estimated : undefined,
    estimate_basis: nullable_string(value.estimate_basis, 300)
  };
}

function is_record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullable_string(value: unknown, max_length: number): string | null {
  return typeof value === "string" ? value.slice(0, max_length) : null;
}

function nullable_number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullable_boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullable_positive_integer(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nullable_nonnegative_integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
