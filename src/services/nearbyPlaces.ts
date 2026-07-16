import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineDistanceKm } from "./ntuCommute";
import { getOneMapAccessToken } from "./oneMapToken";

export type NearbyPlaceType = "mrt" | "bus_stop" | "food_court" | "supermarket" | "mall" | "school";

type ListingRow = {
  id: string;
  postal_code: string | null;
};

type GeocodingRow = {
  postal_code: string;
  latitude: number;
  longitude: number;
};

type FetchedNearbyPlace = {
  place_type: NearbyPlaceType;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
};

type NearbyPlaceInsert = {
  postal_code: string;
  place_type: NearbyPlaceType;
  name: string;
  distance_meters: number;
  walking_minutes: number;
  source: string;
};

export type NearbyPlacesSummary = {
  scanned_count: number;
  skipped_existing_count: number;
  enriched_listing_count: number;
  inserted_place_count: number;
  failed_count: number;
  dry_run: boolean;
  results: Array<{
    listing_id: string;
    postal_code: string | null;
    status: "skipped_existing" | "missing_geocoding" | "enriched" | "failed";
    planned_place_count?: number;
    inserted_place_count?: number;
    error?: string;
    place_type_errors?: Partial<Record<NearbyPlaceType, string>>;
  }>;
};

const MAX_BATCH_SIZE = 50;
const DEFAULT_BATCH_SIZE = 20;
const PER_TYPE_LIMIT = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

const distance_limits_meters: Record<NearbyPlaceType, number> = {
  mrt: 3000,
  bus_stop: 800,
  food_court: 1500,
  supermarket: 1500,
  mall: 1500,
  school: 3000
};

const onemap_theme_names: Record<NearbyPlaceType, string[]> = {
  mrt: envThemeNames("ONEMAP_MRT_THEME_NAMES", ["mrtlrt_stn"]),
  bus_stop: envThemeNames("ONEMAP_BUS_STOP_THEME_NAMES", ["bus_stop", "bus_stops"]),
  food_court: envThemeNames("ONEMAP_FOOD_COURT_THEME_NAMES", ["hawkercentre", "hawker_centres"]),
  supermarket: envThemeNames("ONEMAP_SUPERMARKET_THEME_NAMES", ["supermarkets"]),
  mall: envThemeNames("ONEMAP_MALL_THEME_NAMES", ["shopping_malls"]),
  school: envThemeNames("ONEMAP_SCHOOL_THEME_NAMES", ["schools"])
};

const theme_cache = new Map<string, FetchedNearbyPlace[]>();

export async function enrichNearbyPlacesCache(
  supabase: SupabaseClient,
  options: { limit?: number; listingId?: string; force?: boolean; dryRun?: boolean } = {}
): Promise<NearbyPlacesSummary> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE);
  const force = Boolean(options.force);
  const dry_run = Boolean(options.dryRun);

  const listings = await getPublishedListings(supabase, limit, options.listingId);
  const geocoding_rows = await getSuccessfulGeocoding(
    supabase,
    listings.map((listing) => listing.postal_code).filter(isPostalCode)
  );
  const geocoding_by_postal_code = new Map(geocoding_rows.map((row) => [row.postal_code, row]));
  const existing_postal_codes = await getExistingNearbyPostalCodes(
    supabase,
    listings.map((listing) => listing.postal_code).filter(isPostalCode)
  );
  const summary: NearbyPlacesSummary = {
    scanned_count: listings.length,
    skipped_existing_count: 0,
    enriched_listing_count: 0,
    inserted_place_count: 0,
    failed_count: 0,
    dry_run,
    results: []
  };

  for (const listing of listings) {
    try {
      const geocoding = listing.postal_code ? geocoding_by_postal_code.get(listing.postal_code) : undefined;
      if (!geocoding) {
        summary.results.push({
          listing_id: listing.id,
          postal_code: listing.postal_code,
          status: "missing_geocoding"
        });
        continue;
      }

      if (existing_postal_codes.has(geocoding.postal_code) && !force) {
        summary.skipped_existing_count += 1;
        summary.results.push({
          listing_id: listing.id,
          postal_code: listing.postal_code,
          status: "skipped_existing"
        });
        continue;
      }

      const { places, errors } = await buildNearbyPlaceRows(geocoding);

      if (!dry_run) {
        if (force) {
          const { error: delete_error } = await supabase
            .from("nearby_places_cache")
            .delete()
            .eq("postal_code", geocoding.postal_code);
          if (delete_error) throw new Error(delete_error.message);
        }

        if (places.length > 0) {
          const { error: insert_error } = await supabase.from("nearby_places_cache").insert(places);
          if (insert_error) throw new Error(insert_error.message);
        }
      }

      summary.enriched_listing_count += 1;
      summary.inserted_place_count += dry_run ? 0 : places.length;
      summary.results.push({
        listing_id: listing.id,
        postal_code: listing.postal_code,
        status: "enriched",
        planned_place_count: places.length,
        inserted_place_count: dry_run ? 0 : places.length,
        place_type_errors: Object.keys(errors).length > 0 ? errors : undefined
      });
    } catch (error) {
      summary.failed_count += 1;
      summary.results.push({
        listing_id: listing.id,
        postal_code: listing.postal_code,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return summary;
}

async function getPublishedListings(
  supabase: SupabaseClient,
  limit: number,
  listing_id?: string
): Promise<ListingRow[]> {
  let query = supabase
    .from("listings")
    .select("id,postal_code")
    .eq("status", "published")
    .not("postal_code", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (listing_id) query = query.eq("id", listing_id).limit(1);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row): row is ListingRow => typeof row.id === "string");
}

async function getSuccessfulGeocoding(
  supabase: SupabaseClient,
  postal_codes: string[]
): Promise<GeocodingRow[]> {
  const unique_postal_codes = [...new Set(postal_codes)];
  if (unique_postal_codes.length === 0) return [];

  const { data, error } = await supabase
    .from("geocoding_cache")
    .select("postal_code,latitude,longitude")
    .in("postal_code", unique_postal_codes)
    .eq("status", "success")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? []).filter(
    (row): row is GeocodingRow =>
      isPostalCode(row.postal_code) && isCoordinate(row.latitude) && isCoordinate(row.longitude)
  );
}

async function getExistingNearbyPostalCodes(supabase: SupabaseClient, postal_codes: string[]): Promise<Set<string>> {
  const unique_postal_codes = [...new Set(postal_codes)];
  if (unique_postal_codes.length === 0) return new Set();

  const { data, error } = await supabase
    .from("nearby_places_cache")
    .select("postal_code")
    .in("postal_code", unique_postal_codes);
  if (error) throw new Error(error.message);

  return new Set((data ?? []).map((row) => row.postal_code).filter(isPostalCode));
}

async function buildNearbyPlaceRows(
  geocoding: GeocodingRow
): Promise<{ places: NearbyPlaceInsert[]; errors: Partial<Record<NearbyPlaceType, string>> }> {
  const errors: Partial<Record<NearbyPlaceType, string>> = {};
  const fetchers: Record<NearbyPlaceType, () => Promise<FetchedNearbyPlace[]>> = {
    mrt: () => fetchNearbyMrt(geocoding.latitude, geocoding.longitude),
    bus_stop: () => fetchNearbyBusStops(geocoding.latitude, geocoding.longitude),
    food_court: () => fetchNearbyAmenities("food_court", geocoding.latitude, geocoding.longitude),
    supermarket: () => fetchNearbyAmenities("supermarket", geocoding.latitude, geocoding.longitude),
    mall: () => fetchNearbyAmenities("mall", geocoding.latitude, geocoding.longitude),
    school: () => fetchNearbySchools(geocoding.latitude, geocoding.longitude)
  };
  const rows: NearbyPlaceInsert[] = [];

  for (const place_type of Object.keys(fetchers) as NearbyPlaceType[]) {
    try {
      const fetched = await fetchers[place_type]();
      rows.push(...selectNearestPlaces(geocoding, fetched, place_type));
    } catch (error) {
      errors[place_type] = error instanceof Error ? error.message : String(error);
    }
  }

  return { places: dedupeRows(rows), errors };
}

export async function fetchNearbyMrt(latitude: number, longitude: number): Promise<FetchedNearbyPlace[]> {
  return fetchNearbyByType("mrt", latitude, longitude);
}

export async function fetchNearbyBusStops(latitude: number, longitude: number): Promise<FetchedNearbyPlace[]> {
  return fetchNearbyByType("bus_stop", latitude, longitude);
}

export async function fetchNearbyAmenities(
  place_type: "food_court" | "supermarket" | "mall",
  latitude: number,
  longitude: number
): Promise<FetchedNearbyPlace[]> {
  return fetchNearbyByType(place_type, latitude, longitude);
}

export async function fetchNearbySchools(latitude: number, longitude: number): Promise<FetchedNearbyPlace[]> {
  return fetchNearbyByType("school", latitude, longitude);
}

async function fetchNearbyByType(
  place_type: NearbyPlaceType,
  latitude: number,
  longitude: number
): Promise<FetchedNearbyPlace[]> {
  const themes = onemap_theme_names[place_type];
  const results: FetchedNearbyPlace[] = [];
  const errors: string[] = [];

  for (const theme of themes) {
    try {
      results.push(...await fetchOneMapTheme(theme, place_type));
    } catch (error) {
      errors.push(`${theme}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return results.filter((place) =>
    haversineDistanceKm(latitude, longitude, place.latitude, place.longitude) * 1000 <= distance_limits_meters[place_type]
  );
}

async function fetchOneMapTheme(theme_name: string, place_type: NearbyPlaceType): Promise<FetchedNearbyPlace[]> {
  const cache_key = `${place_type}:${theme_name}`;
  const cached = theme_cache.get(cache_key);
  if (cached) return cached;

  const token = await getOneMapAccessToken();
  const endpoint = new URL("https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme");
  endpoint.searchParams.set("queryName", theme_name);
  const response = await fetchWithTimeout(endpoint, {
    headers: { Accept: "application/json", Authorization: token, "User-Agent": "ntu-rental-database/1.0" }
  });
  if (!response.ok) throw new Error(`OneMap theme ${theme_name} HTTP ${response.status}`);

  const payload = await response.json();
  const rows = Array.isArray(payload?.SrchResults)
    ? payload.SrchResults
    : Array.isArray(payload?.SearchResults)
      ? payload.SearchResults
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  const places = rows.flatMap((row: Record<string, unknown>) => {
    const coordinates = extractCoordinates(row);
    const name = extractName(row);
    if (!coordinates || !name) return [];
    return [{
      place_type,
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: `onemap:${theme_name}`
    }];
  });

  theme_cache.set(cache_key, places);
  return places;
}

function selectNearestPlaces(
  geocoding: GeocodingRow,
  places: FetchedNearbyPlace[],
  place_type: NearbyPlaceType
): NearbyPlaceInsert[] {
  return places
    .map((place) => {
      const distance_meters = Math.round(
        haversineDistanceKm(geocoding.latitude, geocoding.longitude, place.latitude, place.longitude) * 1000
      );
      return {
        postal_code: geocoding.postal_code,
        place_type,
        name: normalizeName(place.name),
        distance_meters,
        walking_minutes: Math.max(1, Math.round(distance_meters / 80)),
        source: place.source
      };
    })
    .filter((place) => place.distance_meters <= distance_limits_meters[place_type])
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, PER_TYPE_LIMIT);
}

function dedupeRows(rows: NearbyPlaceInsert[]): NearbyPlaceInsert[] {
  const seen = new Set<string>();
  const deduped: NearbyPlaceInsert[] = [];

  for (const row of rows) {
    const key = `${row.postal_code}:${row.place_type}:${row.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function extractCoordinates(row: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const lat_lng = firstString(row.LatLng, row.latLng, row.LATLNG, row.location);
  if (lat_lng) {
    const [latitude, longitude] = lat_lng.split(",").map((part) => Number.parseFloat(part.trim()));
    if (isCoordinate(latitude) && isCoordinate(longitude)) return { latitude, longitude };
  }

  const latitude = firstNumber(row.LATITUDE, row.latitude, row.lat, row.Latitude);
  const longitude = firstNumber(row.LONGITUDE, row.longitude, row.lng, row.Longitude);
  return isCoordinate(latitude) && isCoordinate(longitude) ? { latitude, longitude } : null;
}

function extractName(row: Record<string, unknown>): string | null {
  return firstString(row.NAME, row.name, row.Name, row.SEARCHVAL, row.DESCRIPTION, row.description)?.trim() || null;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function envThemeNames(key: string, fallback: string[]): string[] {
  const value = process.env[key];
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

async function fetchWithTimeout(input: URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPostalCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}
