import type { SupabaseClient } from "@supabase/supabase-js";
import { getEligiblePostalCodes } from "./ntuCommute";

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 50;

type GeocodingCacheRow = {
  postal_code: string;
  status: "pending" | "success" | "failed" | "not_found";
  updated_at: string | null;
};

type OneMapResult = {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

export type PostalGeocodingSummary = {
  eligible_count: number;
  processed_count: number;
  success_count: number;
  not_found_count: number;
  failed_count: number;
  results: Array<{ postal_code: string; status: GeocodingCacheRow["status"]; error?: string }>;
};

export async function enrichPostalGeocodingCache(
  supabase: SupabaseClient,
  options: { limit?: number; postalCode?: string } = {}
): Promise<PostalGeocodingSummary> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), MAX_BATCH_SIZE);
  const eligible_postal_codes = await getEligiblePostalCodes(supabase, options.postalCode);
  const cache_rows = await getGeocodingCache(supabase, eligible_postal_codes);
  const cache_by_postal_code = new Map(cache_rows.map((row) => [row.postal_code, row]));
  const selected = eligible_postal_codes
    .filter((postal_code) => shouldGeocode(cache_by_postal_code.get(postal_code)))
    .slice(0, limit);

  const summary: PostalGeocodingSummary = {
    eligible_count: eligible_postal_codes.length,
    processed_count: 0,
    success_count: 0,
    not_found_count: 0,
    failed_count: 0,
    results: []
  };

  for (const postal_code of selected) {
    const now = new Date().toISOString();
    const { error: pending_error } = await supabase.from("geocoding_cache").upsert({
      postal_code,
      status: "pending",
      error_message: null,
      updated_at: now
    }, { onConflict: "postal_code" });
    if (pending_error) throw new Error(pending_error.message);

    summary.processed_count += 1;
    try {
      const result = await geocodePostalCode(postal_code);
      if (!result) {
        summary.not_found_count += 1;
        summary.results.push({ postal_code, status: "not_found" });
        await updateFailure(supabase, postal_code, "not_found", "OneMap returned no result");
        continue;
      }

      const completed_at = new Date().toISOString();
      const { error } = await supabase.from("geocoding_cache").update({
        latitude: result.latitude,
        longitude: result.longitude,
        building: result.raw_result.SEARCHVAL ?? null,
        block: result.raw_result.BLK_NO ?? null,
        road_name: result.raw_result.ROAD_NAME ?? null,
        address: result.raw_result.ADDRESS ?? null,
        provider: "onemap",
        status: "success",
        error_message: null,
        raw_response: result.raw_result,
        geocoded_at: completed_at,
        updated_at: completed_at
      }).eq("postal_code", postal_code);
      if (error) throw new Error(error.message);

      summary.success_count += 1;
      summary.results.push({ postal_code, status: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed_count += 1;
      summary.results.push({ postal_code, status: "failed", error: message });
      await updateFailure(supabase, postal_code, "failed", message);
    }
  }

  return summary;
}

async function getGeocodingCache(
  supabase: SupabaseClient,
  postal_codes: string[]
): Promise<GeocodingCacheRow[]> {
  if (postal_codes.length === 0) return [];
  const { data, error } = await supabase
    .from("geocoding_cache")
    .select("postal_code,status,updated_at")
    .in("postal_code", postal_codes);
  if (error) throw new Error(error.message);
  return (data ?? []) as GeocodingCacheRow[];
}

export function shouldGeocode(row: GeocodingCacheRow | undefined, now = Date.now()): boolean {
  if (!row || row.status === "pending") return true;
  if (row.status === "success" || row.status === "not_found") return false;
  const updated_at = row.updated_at ? Date.parse(row.updated_at) : 0;
  return !Number.isFinite(updated_at) || now - updated_at >= RETRY_AFTER_MS;
}

async function geocodePostalCode(postal_code: string) {
  const endpoint = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  endpoint.searchParams.set("searchVal", postal_code);
  endpoint.searchParams.set("returnGeom", "Y");
  endpoint.searchParams.set("getAddrDetails", "Y");
  endpoint.searchParams.set("pageNum", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "ntu-rental-database/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`OneMap geocoding HTTP ${response.status}`);
    const payload = await response.json();
    const raw_result = Array.isArray(payload?.results)
      ? payload.results.find((row: OneMapResult) => row.POSTAL === postal_code) ?? payload.results[0]
      : null;
    if (!raw_result) return null;

    const latitude = Number(raw_result.LATITUDE);
    const longitude = Number(raw_result.LONGITUDE);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("OneMap geocoding result missing coordinates");
    }
    return { latitude, longitude, raw_result: raw_result as OneMapResult };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateFailure(
  supabase: SupabaseClient,
  postal_code: string,
  status: "failed" | "not_found",
  error_message: string
): Promise<void> {
  const { error } = await supabase.from("geocoding_cache").update({
    status,
    error_message,
    updated_at: new Date().toISOString()
  }).eq("postal_code", postal_code);
  if (error) throw new Error(error.message);
}
