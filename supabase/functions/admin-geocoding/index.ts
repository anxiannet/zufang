import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type GeocodingStatus = "pending" | "success" | "failed" | "not_found";

type GeocodingCacheRow = {
  postal_code: string;
  status: GeocodingStatus;
};

type GeocodingCacheLookupRow = GeocodingCacheRow & {
  address: string | null;
  block: string | null;
  road_name: string | null;
  building: string | null;
};

type ListingPostalCodeRow = {
  postal_code: string | null;
};

type OneMapResult = {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  ADDRESS?: string;
  POSTAL?: string;
  X?: string;
  Y?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_BATCH_LIMIT = 10;
const DEFAULT_REQUEST_DELAY_MS = 2_500;
const MAX_BATCH_LIMIT = 20;
const NTU = { latitude: 1.3483, longitude: 103.6831 };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "status");
    const limit = clampNumber(body.limit, 1, MAX_BATCH_LIMIT, DEFAULT_BATCH_LIMIT);
    const requestDelayMs = clampNumber(body.request_delay_ms, 500, 15_000, DEFAULT_REQUEST_DELAY_MS);
    const postalCode = cleanPostalCode(body.postal_code);
    const supabase = createSupabaseAdminClient();

    if (action === "enqueue") {
      const { data, error } = await supabase.rpc("enqueue_geocoding_jobs");
      if (error) throw error;
      return json(data ?? { ok: true });
    }

    if (action === "sync") {
      const synced = await callRpc(supabase, "sync_geocoding_cache_to_listing_indexes");
      const refreshed = await callRpc(supabase, "refresh_distance_commute_estimates");
      return json({
        synced_listing_count: extractCount(synced),
        refreshed_distance_count: extractCount(refreshed),
        synced,
        refreshed
      });
    }

    if (action === "retry_failed") {
      const query = supabase
        .from("geocoding_cache")
        .update({
          status: "pending",
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq("status", "failed");

      const { data, error } = postalCode
        ? await query.eq("postal_code", postalCode).select("postal_code")
        : await query.select("postal_code");

      if (error) throw error;
      return json({ enqueued: data?.length ?? 0 });
    }

    if (action !== "run" && action !== "rerun_missing") {
      return json({ error: `Unsupported action: ${action}` }, 400);
    }

    const rows = postalCode
      ? await prepareSinglePostalCode(supabase, postalCode)
      : action === "rerun_missing"
        ? await prepareMissingPostalCodes(supabase, limit)
        : await getPendingPostalCodes(supabase, limit);

    const summary = {
      enqueued: action === "rerun_missing" ? rows.length : undefined,
      processed_count: 0,
      success_count: 0,
      not_found_count: 0,
      failed_count: 0,
      rate_limited: false,
      last_error: null as string | null
    };

    for (const [index, row] of rows.entries()) {
      if (index > 0) await sleep(requestDelayMs + Math.floor(Math.random() * 700));

      const result = await geocodePostalCode(row.postal_code);
      if (result.kind === "rate_limited") {
        summary.rate_limited = true;
        summary.last_error = result.message;
        await markRateLimited(supabase, row.postal_code, result.message);
        break;
      }

      summary.processed_count += 1;

      if (result.kind === "success") {
        summary.success_count += 1;
        await saveSuccess(supabase, row.postal_code, result);
      } else if (result.kind === "not_found") {
        summary.not_found_count += 1;
        await saveFailure(supabase, row.postal_code, "not_found", result.message);
      } else {
        summary.failed_count += 1;
        await saveFailure(supabase, row.postal_code, "failed", result.message);
      }
    }

    const synced = await callRpc(supabase, "sync_geocoding_cache_to_listing_indexes");
    const refreshed = await callRpc(supabase, "refresh_distance_commute_estimates");

    return json({
      ...summary,
      synced_listing_count: extractCount(synced),
      refreshed_distance_count: extractCount(refreshed)
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

async function prepareSinglePostalCode(supabase: ReturnType<typeof createSupabaseAdminClient>, postalCode: string) {
  const { data, error } = await supabase
    .from("geocoding_cache")
    .upsert(
      {
        postal_code: postalCode,
        status: "pending",
        error_message: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "postal_code" }
    )
    .select("postal_code,status");

  if (error) throw error;
  return (data ?? []) as GeocodingCacheRow[];
}

async function prepareMissingPostalCodes(supabase: ReturnType<typeof createSupabaseAdminClient>, limit: number) {
  const { data: listingRows, error: listingError } = await supabase
    .from("listing_indexes")
    .select("postal_code")
    .eq("status", "active")
    .not("postal_code", "is", null)
    .limit(5000);

  if (listingError) throw listingError;

  const postalCodes = Array.from(
    new Set(
      ((listingRows ?? []) as ListingPostalCodeRow[])
        .map((row) => cleanPostalCode(row.postal_code))
        .filter(Boolean)
    )
  );

  if (postalCodes.length === 0) return [];

  const { data: cacheRows, error: cacheError } = await supabase
    .from("geocoding_cache")
    .select("postal_code,status,address,block,road_name,building")
    .in("postal_code", postalCodes);

  if (cacheError) throw cacheError;

  const cacheByPostalCode = new Map(
    ((cacheRows ?? []) as GeocodingCacheLookupRow[]).map((row) => [row.postal_code, row])
  );

  const selectedPostalCodes = postalCodes
    .filter((code) => isMissingGeocoding(cacheByPostalCode.get(code)))
    .slice(0, limit);

  if (selectedPostalCodes.length === 0) return [];

  const { data, error } = await supabase
    .from("geocoding_cache")
    .upsert(
      selectedPostalCodes.map((code) => ({
        postal_code: code,
        status: "pending",
        error_message: null,
        updated_at: new Date().toISOString()
      })),
      { onConflict: "postal_code" }
    )
    .select("postal_code,status");

  if (error) throw error;
  return (data ?? []) as GeocodingCacheRow[];
}

function isMissingGeocoding(row: GeocodingCacheLookupRow | undefined) {
  if (!row) return true;
  if (row.status !== "success") return true;
  return ![row.address, row.block, row.road_name, row.building]
    .some((value) => String(value ?? "").trim().length > 0);
}

async function getPendingPostalCodes(supabase: ReturnType<typeof createSupabaseAdminClient>, limit: number) {
  const { data, error } = await supabase
    .from("geocoding_cache")
    .select("postal_code,status")
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as GeocodingCacheRow[];
}

async function geocodePostalCode(postalCode: string) {
  const endpoint = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  endpoint.searchParams.set("searchVal", postalCode);
  endpoint.searchParams.set("returnGeom", "Y");
  endpoint.searchParams.set("getAddrDetails", "Y");
  endpoint.searchParams.set("pageNum", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "sg-chinese-rental-mvp/1.0"
    }
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    return {
      kind: "rate_limited" as const,
      message: retryAfter ? `OneMap HTTP 429, retry after ${retryAfter}s` : "OneMap HTTP 429 rate limited"
    };
  }

  if (!response.ok) {
    return { kind: "failed" as const, message: `OneMap HTTP ${response.status}` };
  }

  const payload = await response.json();
  const result = Array.isArray(payload?.results) ? payload.results[0] as OneMapResult | undefined : undefined;
  if (!result) return { kind: "not_found" as const, message: "OneMap returned no result" };

  const latitude = Number(result.LATITUDE);
  const longitude = Number(result.LONGITUDE);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "failed" as const, message: "OneMap result missing coordinates" };
  }

  return {
    kind: "success" as const,
    latitude,
    longitude,
    address: result.ADDRESS ?? ([result.BLK_NO, result.ROAD_NAME].filter(Boolean).join(" ") || (result.SEARCHVAL ?? null)),
    raw_result: result
  };
}

async function saveSuccess(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  postalCode: string,
  result: Extract<Awaited<ReturnType<typeof geocodePostalCode>>, { kind: "success" }>
) {
  const { error } = await supabase
    .from("geocoding_cache")
    .update({
      status: "success",
      latitude: result.latitude,
      longitude: result.longitude,
      address: result.address,
      block: result.raw_result.BLK_NO ?? null,
      road_name: result.raw_result.ROAD_NAME ?? null,
      building: result.raw_result.SEARCHVAL ?? null,
      error_message: null,
      distance_to_ntu_km: distanceKm(result.latitude, result.longitude, NTU.latitude, NTU.longitude),
      raw_result: result.raw_result,
      updated_at: new Date().toISOString()
    })
    .eq("postal_code", postalCode);

  if (error) throw error;
}

async function saveFailure(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  postalCode: string,
  status: "failed" | "not_found",
  message: string
) {
  const { error } = await supabase
    .from("geocoding_cache")
    .update({
      status,
      error_message: message,
      updated_at: new Date().toISOString()
    })
    .eq("postal_code", postalCode);

  if (error) throw error;
}

async function markRateLimited(supabase: ReturnType<typeof createSupabaseAdminClient>, postalCode: string, message: string) {
  const { error } = await supabase
    .from("geocoding_cache")
    .update({
      status: "pending",
      error_message: message,
      updated_at: new Date().toISOString()
    })
    .eq("postal_code", postalCode);

  if (error) throw error;
}

async function callRpc(supabase: ReturnType<typeof createSupabaseAdminClient>, name: string) {
  const { data, error } = await supabase.rpc(name);
  if (error) throw error;
  return data;
}

function cleanPostalCode(value: unknown) {
  const postalCode = String(value ?? "").trim();
  if (!postalCode) return "";
  if (!/^\d{6}$/.test(postalCode)) throw new Error("postal_code must be a 6 digit Singapore postal code");
  return postalCode;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function extractCount(value: unknown) {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    for (const key of ["count", "synced_listing_count", "refreshed_distance_count", "updated_count"]) {
      const count = (value as Record<string, unknown>)[key];
      if (typeof count === "number") return count;
    }
  }
  return 0;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
