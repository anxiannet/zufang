import type { SupabaseClient } from "@supabase/supabase-js";
import { getOneMapAccessToken } from "./oneMapToken";

export const NTU_CENTER = {
  latitude: 1.3483,
  longitude: 103.6831,
  name: "Nanyang Technological University"
} as const;

const DEFAULT_ROUTE_TIME = "08:30:00";
const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HIGH_PRIORITY_DISTANCE_KM = 8;
const MAX_DISTANCE_KM = 12;
const MAX_BATCH_SIZE = 50;
const COORDINATE_EPSILON = 0.000001;

type GeocodingRow = {
  postal_code: string;
  latitude: number;
  longitude: number;
};

type CommuteCacheRow = {
  postal_code: string;
  origin_latitude: number | null;
  origin_longitude: number | null;
  ntu_straight_distance_km: number | null;
  status: "pending" | "processing" | "success" | "failed" | "skipped_far";
  computed_at: string | null;
};

type PreparedCommute = GeocodingRow & {
  ntu_straight_distance_km: number;
  cache: CommuteCacheRow | null;
  coordinates_changed: boolean;
  is_recent: boolean;
  next_status: CommuteCacheRow["status"];
  skip_reason: string | null;
  should_call_onemap: boolean;
};

type RouteResult = {
  minutes: number;
  distance_meters: number | null;
  raw_response: unknown;
};

export type NtuCommuteSummary = {
  scanned_count: number;
  inserted_or_updated_cache_count: number;
  skipped_recent_cache_count: number;
  skipped_far_count: number;
  onemap_called_count: number;
  success_count: number;
  failed_count: number;
  dry_run: boolean;
  results: Array<{
    postal_code: string;
    status: CommuteCacheRow["status"];
    ntu_straight_distance_km: number;
    bus_minutes?: number;
    drive_minutes?: number;
    error?: string;
  }>;
};

export type NtuDistanceBand = "high_priority" | "low_priority" | "skipped_far";

export async function enrichNtuCommuteCache(
  supabase: SupabaseClient,
  options: { limit?: number; dryRun?: boolean; postalCode?: string; force?: boolean } = {}
): Promise<NtuCommuteSummary> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_BATCH_SIZE);
  const force = Boolean(options.force);
  const dry_run = Boolean(options.dryRun);
  const now = new Date();
  const now_iso = now.toISOString();

  const postal_codes = await getPublishedPostalCodes(supabase, options.postalCode);
  const geocoding_rows = await getSuccessfulGeocoding(supabase, postal_codes);
  const cache_rows = await getCommuteCache(supabase, geocoding_rows.map((row) => row.postal_code));
  const cache_by_postal_code = new Map(cache_rows.map((row) => [row.postal_code, row]));

  const prepared = geocoding_rows.map((geocoding) =>
    prepareCommute(geocoding, cache_by_postal_code.get(geocoding.postal_code) ?? null, now, force)
  );
  const selected = selectBatch(prepared, limit, force);
  const summary: NtuCommuteSummary = {
    scanned_count: prepared.length,
    inserted_or_updated_cache_count: 0,
    skipped_recent_cache_count: selected.filter((row) => row.is_recent && !row.coordinates_changed && !force).length,
    skipped_far_count: selected.filter((row) => row.next_status === "skipped_far").length,
    onemap_called_count: 0,
    success_count: 0,
    failed_count: 0,
    dry_run,
    results: []
  };

  for (const row of selected) {
    if (!dry_run) {
      const cache_payload = buildCachePayload(row, now_iso);
      const { error: cache_error } = await supabase
        .from("listing_commute_cache")
        .upsert(cache_payload, { onConflict: "postal_code" });
      if (cache_error) throw new Error(cache_error.message);
      summary.inserted_or_updated_cache_count += 1;
    }

    if (!row.should_call_onemap) {
      summary.results.push({
        postal_code: row.postal_code,
        status: row.next_status,
        ntu_straight_distance_km: row.ntu_straight_distance_km
      });
    }
  }

  if (dry_run) return summary;

  const route_candidates = selected.filter((row) => row.should_call_onemap);
  if (route_candidates.length === 0) return summary;
  const token = await getOneMapAccessToken();

  for (const row of route_candidates) {
    const processing_time = new Date().toISOString();
    const { error: processing_error } = await supabase
      .from("listing_commute_cache")
      .update({ status: "processing", error_message: null, updated_at: processing_time })
      .eq("postal_code", row.postal_code);
    if (processing_error) throw new Error(processing_error.message);

    summary.onemap_called_count += 1;
    try {
      const result = await computePostalCommute(row, token);
      const completed_at = new Date().toISOString();
      const { error: update_error } = await supabase
        .from("listing_commute_cache")
        .update({
          ntu_bus_minutes: result.bus.minutes,
          ntu_drive_minutes: result.drive.minutes,
          bus_distance_meters: result.bus.distance_meters,
          drive_distance_meters: result.drive.distance_meters,
          status: "success",
          provider: "onemap",
          skip_reason: null,
          error_message: null,
          bus_raw_response: result.bus.raw_response,
          drive_raw_response: result.drive.raw_response,
          computed_at: completed_at,
          updated_at: completed_at
        })
        .eq("postal_code", row.postal_code);
      if (update_error) throw new Error(update_error.message);

      summary.success_count += 1;
      summary.results.push({
        postal_code: row.postal_code,
        status: "success",
        ntu_straight_distance_km: row.ntu_straight_distance_km,
        bus_minutes: result.bus.minutes,
        drive_minutes: result.drive.minutes
      });
    } catch (route_error) {
      summary.failed_count += 1;
      const message = route_error instanceof Error ? route_error.message : String(route_error);
      summary.results.push({
        postal_code: row.postal_code,
        status: "failed",
        ntu_straight_distance_km: row.ntu_straight_distance_km,
        error: message
      });
      await supabase
        .from("listing_commute_cache")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString()
        })
        .eq("postal_code", row.postal_code);
    }
  }

  return summary;
}

async function getPublishedPostalCodes(supabase: SupabaseClient, postal_code?: string): Promise<string[]> {
  let query = supabase
    .from("listings")
    .select("postal_code")
    .eq("status", "published")
    .not("postal_code", "is", null);
  if (postal_code) query = query.eq("postal_code", postal_code);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.postal_code).filter(isPostalCode))];
}

async function getSuccessfulGeocoding(
  supabase: SupabaseClient,
  postal_codes: string[]
): Promise<GeocodingRow[]> {
  if (postal_codes.length === 0) return [];
  const { data, error } = await supabase
    .from("geocoding_cache")
    .select("postal_code,latitude,longitude")
    .in("postal_code", postal_codes)
    .eq("status", "success")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? []).filter(
    (row): row is GeocodingRow =>
      isPostalCode(row.postal_code) && isCoordinate(row.latitude) && isCoordinate(row.longitude)
  );
}

async function getCommuteCache(
  supabase: SupabaseClient,
  postal_codes: string[]
): Promise<CommuteCacheRow[]> {
  if (postal_codes.length === 0) return [];
  const { data, error } = await supabase
    .from("listing_commute_cache")
    .select("postal_code,origin_latitude,origin_longitude,ntu_straight_distance_km,status,computed_at")
    .in("postal_code", postal_codes);
  if (error) throw new Error(error.message);
  return (data ?? []) as CommuteCacheRow[];
}

function prepareCommute(
  geocoding: GeocodingRow,
  cache: CommuteCacheRow | null,
  now: Date,
  force: boolean
): PreparedCommute {
  const ntu_straight_distance_km = roundDistance(
    haversineDistanceKm(geocoding.latitude, geocoding.longitude, NTU_CENTER.latitude, NTU_CENTER.longitude)
  );
  const coordinates_changed = !cache ||
    !sameCoordinate(cache.origin_latitude, geocoding.latitude) ||
    !sameCoordinate(cache.origin_longitude, geocoding.longitude);
  const is_recent = Boolean(cache?.computed_at) &&
    now.getTime() - new Date(cache!.computed_at!).getTime() < CACHE_TTL_MS;

  const distance_band = classifyNtuDistance(ntu_straight_distance_km);
  const recent_success = cache?.status === "success" && is_recent && !coordinates_changed && !force;
  return {
    ...geocoding,
    cache,
    ntu_straight_distance_km,
    coordinates_changed,
    is_recent,
    next_status: recent_success ? "success" : "pending",
    skip_reason: distance_band !== "high_priority"
      ? "low_priority_distance"
      : null,
    should_call_onemap: !recent_success
  };
}

function selectBatch(rows: PreparedCommute[], limit: number, force: boolean): PreparedCommute[] {
  return [...rows]
    .sort((a, b) => {
      const a_priority = batchPriority(a, force);
      const b_priority = batchPriority(b, force);
      if (a_priority !== b_priority) return a_priority - b_priority;
      return a.ntu_straight_distance_km - b.ntu_straight_distance_km;
    })
    .slice(0, limit);
}

function batchPriority(row: PreparedCommute, force: boolean): number {
  const band_priority = row.ntu_straight_distance_km <= HIGH_PRIORITY_DISTANCE_KM
    ? 0
    : row.ntu_straight_distance_km <= MAX_DISTANCE_KM || force
      ? 1
      : 2;
  return band_priority * 2 + (row.should_call_onemap ? 0 : 1);
}

function buildCachePayload(row: PreparedCommute, now: string): Record<string, unknown> {
  const base = {
    postal_code: row.postal_code,
    origin_latitude: row.latitude,
    origin_longitude: row.longitude,
    ntu_straight_distance_km: row.ntu_straight_distance_km,
    status: row.next_status,
    skip_reason: row.skip_reason,
    updated_at: now
  };

  if (row.next_status === "skipped_far") {
    return {
      ...base,
      ntu_bus_minutes: null,
      ntu_drive_minutes: null,
      bus_distance_meters: null,
      drive_distance_meters: null,
      bus_raw_response: null,
      drive_raw_response: null,
      error_message: null,
      computed_at: row.is_recent && !row.coordinates_changed
        ? row.cache?.computed_at ?? now
        : now
    };
  }

  if (row.next_status === "success") {
    return {
      ...base,
      skip_reason: null,
      computed_at: row.cache?.computed_at ?? now
    };
  }

  return {
    ...base,
    ntu_bus_minutes: row.coordinates_changed ? null : undefined,
    ntu_drive_minutes: row.coordinates_changed ? null : undefined,
    bus_distance_meters: row.coordinates_changed ? null : undefined,
    drive_distance_meters: row.coordinates_changed ? null : undefined,
    bus_raw_response: row.coordinates_changed ? null : undefined,
    drive_raw_response: row.coordinates_changed ? null : undefined,
    error_message: null,
    computed_at: row.coordinates_changed ? null : row.cache?.computed_at ?? null
  };
}

async function computePostalCommute(coordinates: GeocodingRow, token: string) {
  const [bus, drive] = await Promise.all([
    routeOneMap(coordinates, "pt", token),
    routeOneMap(coordinates, "drive", token)
  ]);
  return { bus, drive };
}

async function routeOneMap(
  start: { latitude: number; longitude: number },
  route_type: "pt" | "drive",
  token: string
): Promise<RouteResult> {
  const endpoint = new URL("https://www.onemap.gov.sg/api/public/routingsvc/route");
  endpoint.searchParams.set("start", `${start.latitude},${start.longitude}`);
  endpoint.searchParams.set("end", `${NTU_CENTER.latitude},${NTU_CENTER.longitude}`);
  endpoint.searchParams.set("routeType", route_type);
  if (route_type === "pt") {
    endpoint.searchParams.set("mode", "transit");
    endpoint.searchParams.set("date", routeDate());
    endpoint.searchParams.set("time", process.env.ONEMAP_ROUTE_TIME ?? DEFAULT_ROUTE_TIME);
    endpoint.searchParams.set("numItineraries", "1");
  }

  const response = await fetchWithTimeout(endpoint, { headers: oneMapHeaders(token) });
  if (!response.ok) throw new Error(`OneMap ${route_type} Route HTTP ${response.status}`);
  const payload = await response.json();
  const seconds = extractNumber(
    payload?.route_summary?.total_time,
    payload?.route_summary?.totalTime,
    payload?.plan?.itineraries?.[0]?.duration,
    payload?.total_time
  );
  if (!seconds || seconds <= 0) throw new Error(`OneMap ${route_type} response missing total time`);

  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    distance_meters: roundNullable(extractNumber(
      payload?.route_summary?.total_distance,
      payload?.route_summary?.totalDistance,
      payload?.plan?.itineraries?.[0]?.walkDistance,
      payload?.total_distance
    )),
    raw_response: payload
  };
}

export function haversineDistanceKm(
  start_latitude: number,
  start_longitude: number,
  end_latitude: number,
  end_longitude: number
): number {
  const earth_radius_km = 6371.0088;
  const latitude_delta = degreesToRadians(end_latitude - start_latitude);
  const longitude_delta = degreesToRadians(end_longitude - start_longitude);
  const start_latitude_radians = degreesToRadians(start_latitude);
  const end_latitude_radians = degreesToRadians(end_latitude);
  const a = Math.sin(latitude_delta / 2) ** 2 +
    Math.cos(start_latitude_radians) *
    Math.cos(end_latitude_radians) *
    Math.sin(longitude_delta / 2) ** 2;
  return earth_radius_km * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function classifyNtuDistance(distance_km: number): NtuDistanceBand {
  if (distance_km <= HIGH_PRIORITY_DISTANCE_KM) return "high_priority";
  if (distance_km <= MAX_DISTANCE_KM) return "low_priority";
  return "skipped_far";
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function roundDistance(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sameCoordinate(left: number | null, right: number): boolean {
  return left !== null && Math.abs(left - right) <= COORDINATE_EPSILON;
}

function oneMapHeaders(token: string): HeadersInit {
  return { Accept: "application/json", Authorization: token, "User-Agent": "ntu-rental-database/1.0" };
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

function routeDate(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${date.getFullYear()}`;
}

function extractNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPostalCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}
