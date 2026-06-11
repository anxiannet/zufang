import type { SupabaseClient } from "@supabase/supabase-js";
import { getOneMapAccessToken } from "./oneMapToken";

const NTU_LATITUDE = 1.3483;
const NTU_LONGITUDE = 103.6831;
const DEFAULT_ROUTE_TIME = "08:30:00";
const DEFAULT_TIMEOUT_MS = 30_000;

type PendingCommute = {
  postal_code: string;
};

type RouteResult = {
  minutes: number;
  distance_meters: number | null;
  raw_response: unknown;
};

export async function enrichNtuCommuteCache(
  supabase: SupabaseClient,
  options: { limit?: number; dryRun?: boolean; postalCode?: string } = {}
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  let query = supabase
    .from("listing_commute_cache")
    .select("postal_code")
    .in("status", ["pending", "failed"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (options.postalCode) query = query.eq("postal_code", options.postalCode);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const summary: {
    selected: number;
    success: number;
    failed: number;
    dry_run: boolean;
    results: Array<{ postal_code: string; status: "success" | "failed"; bus_minutes?: number; drive_minutes?: number; error?: string }>;
  } = {
    selected: data?.length ?? 0,
    success: 0,
    failed: 0,
    dry_run: Boolean(options.dryRun),
    results: []
  };
  for (const row of (data ?? []) as PendingCommute[]) {
    try {
      const result = await computePostalCommute(supabase, row.postal_code);
      if (!options.dryRun) {
        const now = new Date().toISOString();
        const { error: update_error } = await supabase
          .from("listing_commute_cache")
          .update({
            origin_latitude: result.latitude,
            origin_longitude: result.longitude,
            ntu_bus_minutes: result.bus.minutes,
            ntu_drive_minutes: result.drive.minutes,
            bus_distance_meters: result.bus.distance_meters,
            drive_distance_meters: result.drive.distance_meters,
            status: "success",
            provider: "onemap",
            error_message: null,
            bus_raw_response: result.bus.raw_response,
            drive_raw_response: result.drive.raw_response,
            computed_at: now,
            updated_at: now
          })
          .eq("postal_code", row.postal_code);
        if (update_error) throw new Error(update_error.message);
      }
      summary.success += 1;
      summary.results.push({
        postal_code: row.postal_code,
        status: "success",
        bus_minutes: result.bus.minutes,
        drive_minutes: result.drive.minutes
      });
    } catch (route_error) {
      summary.failed += 1;
      const message = route_error instanceof Error ? route_error.message : String(route_error);
      summary.results.push({ postal_code: row.postal_code, status: "failed", error: message });
      if (!options.dryRun) {
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
  }

  return summary;
}

async function computePostalCommute(supabase: SupabaseClient, postal_code: string) {
  const coordinates = await getCoordinates(supabase, postal_code);
  const token = await getOneMapAccessToken();
  const [bus, drive] = await Promise.all([
    routeOneMap(coordinates, "pt", token),
    routeOneMap(coordinates, "drive", token)
  ]);
  return { ...coordinates, bus, drive };
}

async function getCoordinates(supabase: SupabaseClient, postal_code: string) {
  const { data } = await supabase
    .from("geocoding_cache")
    .select("latitude,longitude")
    .eq("postal_code", postal_code)
    .eq("status", "success")
    .maybeSingle();
  if (isCoordinate(data?.latitude) && isCoordinate(data?.longitude)) {
    return { latitude: data.latitude, longitude: data.longitude };
  }

  const endpoint = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  endpoint.searchParams.set("searchVal", postal_code);
  endpoint.searchParams.set("returnGeom", "Y");
  endpoint.searchParams.set("getAddrDetails", "Y");
  endpoint.searchParams.set("pageNum", "1");

  const token = await getOneMapAccessToken();
  const response = await fetchWithTimeout(endpoint, { headers: oneMapHeaders(token) });
  if (!response.ok) throw new Error(`OneMap Search HTTP ${response.status}`);
  const payload = await response.json();
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  const latitude = Number(result?.LATITUDE);
  const longitude = Number(result?.LONGITUDE);
  if (!isCoordinate(latitude) || !isCoordinate(longitude)) {
    throw new Error(`OneMap Search did not return coordinates for ${postal_code}`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("geocoding_cache").upsert({
    postal_code,
    latitude,
    longitude,
    building: result?.BUILDING ?? result?.SEARCHVAL ?? null,
    block: result?.BLK_NO ?? null,
    road_name: result?.ROAD_NAME ?? null,
    address: result?.ADDRESS ?? null,
    provider: "onemap_search",
    status: "success",
    error_message: null,
    raw_response: result,
    geocoded_at: now,
    updated_at: now
  }, { onConflict: "postal_code" });
  if (error) throw new Error(error.message);
  return { latitude, longitude };
}

async function routeOneMap(
  start: { latitude: number; longitude: number },
  route_type: "pt" | "drive",
  token: string
): Promise<RouteResult> {
  const endpoint = new URL("https://www.onemap.gov.sg/api/public/routingsvc/route");
  endpoint.searchParams.set("start", `${start.latitude},${start.longitude}`);
  endpoint.searchParams.set("end", `${NTU_LATITUDE},${NTU_LONGITUDE}`);
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

function oneMapHeaders(token: string): HeadersInit {
  return { Accept: "application/json", Authorization: token, "User-Agent": "sg-chinese-rental-mvp/1.0" };
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
