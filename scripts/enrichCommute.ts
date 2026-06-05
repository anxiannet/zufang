import { supabaseRequest } from "../src/db/pool";

export type SchoolCode = "NTU" | "NUS" | "SMU" | "SUTD";
type JobStatus = "pending" | "retry" | "completed" | "failed";

type QueueRow = {
  id: string;
  listing_index_id: string;
  postal_code: string | null;
  address_text: string | null;
  status: JobStatus;
  retry_count: number | null;
  title?: string | null;
  source?: string | null;
  source_id?: string | null;
};

type ListingIndexRow = {
  id: string;
  postal_code: string | null;
  address_text: string | null;
  latitude: number | null;
  longitude: number | null;
};

type SchoolLocation = {
  school_code: SchoolCode;
  latitude: number;
  longitude: number;
};

type OneMapSearchResult = {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

type GeocodeSuccess = {
  latitude: number;
  longitude: number;
  confidence: "postal_code" | "address_text";
  raw_result: OneMapSearchResult;
};

export type RunCommuteEnrichmentOptions = {
  limit?: number;
  dryRun?: boolean;
  school?: SchoolCode;
};

export type RunCommuteEnrichmentSummary = {
  pending_count: number;
  selected_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  dry_run: boolean;
  school: SchoolCode | "ALL";
};

const SCHOOL_CODES: SchoolCode[] = ["NTU", "NUS", "SMU", "SUTD"];
const COMMUTE_COLUMNS: Record<SchoolCode, string> = {
  NTU: "travel_time_bus_ntu",
  NUS: "travel_time_bus_nus",
  SMU: "travel_time_bus_smu",
  SUTD: "travel_time_bus_sutd"
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_ROUTE_TIME = "08:30:00";
const DEFAULT_ONEMAP_TIMEOUT_MS = 30_000;
const SUPABASE_REQUEST_RETRIES = 3;

export async function runCommuteEnrichment(optionsInput: RunCommuteEnrichmentOptions = {}): Promise<RunCommuteEnrichmentSummary> {
  const options = {
    limit: clampLimit(String(optionsInput.limit ?? DEFAULT_LIMIT)),
    dryRun: Boolean(optionsInput.dryRun),
    school: optionsInput.school
  };
  const schools = await fetchSchools(options.school);
  const pendingCount = await countPendingJobs();
  const jobs = await fetchPendingJobs(options.limit);

  const summary: RunCommuteEnrichmentSummary = {
    pending_count: pendingCount,
    selected_count: jobs.length,
    success_count: 0,
    failed_count: 0,
    skipped_count: 0,
    dry_run: options.dryRun,
    school: options.school ?? "ALL"
  };

  console.log(`Pending commute jobs: ${pendingCount}`);

  for (const job of jobs) {
    try {
      const listing = await fetchListing(job.listing_index_id);
      if (!listing) {
        summary.skipped_count += 1;
        await markJob(job, "failed", "listing_indexes row not found", options.dryRun);
        continue;
      }

      const coords = await ensureCoordinates(job, listing, options.dryRun);
      if (!coords) {
        summary.failed_count += 1;
        continue;
      }

      const routeResult = await computeRoutes(coords, schools);
      if (Object.keys(routeResult.travelTimes).length > 0) {
        await updateListingCommute(job.listing_index_id, routeResult.travelTimes, options.dryRun);
      }

      if (routeResult.errors.length > 0) {
        summary.failed_count += 1;
        await markJob(job, "retry", routeResult.errors.join("; "), options.dryRun);
        continue;
      }

      summary.success_count += 1;
      await markJob(job, "completed", null, options.dryRun);
    } catch (error) {
      summary.failed_count += 1;
      await markJob(job, "retry", errorMessage(error), options.dryRun);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  const summary = await runCommuteEnrichment(parseArgs(process.argv.slice(2)));
  if (summary.failed_count > 0) process.exitCode = 1;
}

async function fetchPendingJobs(limit: number): Promise<QueueRow[]> {
  const params = new URLSearchParams({
    select: "id,listing_index_id,postal_code,address_text,status,retry_count,last_error,created_at,updated_at,title,source,source_id",
    status: "in.(pending,retry)",
    order: "updated_at.asc.nullsfirst",
    limit: String(limit)
  });
  return supabaseRequestWithRetry<QueueRow[]>(`commute_enrichment_queue?${params.toString()}`);
}

async function countPendingJobs(): Promise<number> {
  const rows = await supabaseRequestWithRetry<{ count: number }[]>("commute_enrichment_jobs?select=count&status=in.(pending,retry)");
  return Number(rows[0]?.count ?? 0);
}

async function fetchListing(id: string): Promise<ListingIndexRow | null> {
  const rows = await supabaseRequestWithRetry<ListingIndexRow[]>(
    `listing_indexes?select=id,postal_code,address_text,latitude,longitude&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows[0] ?? null;
}

async function fetchSchools(school?: SchoolCode): Promise<SchoolLocation[]> {
  const selected = school ? [school] : SCHOOL_CODES;
  const rows = await supabaseRequestWithRetry<SchoolLocation[]>(
    `school_locations?select=school_code,latitude,longitude&school_code=in.(${selected.join(",")})`
  );
  const byCode = new Map(rows.map((row) => [row.school_code, row]));
  const missing = selected.filter((code) => !byCode.has(code));
  if (missing.length > 0) throw new Error(`Missing school_locations rows: ${missing.join(", ")}`);
  return selected.map((code) => byCode.get(code)!);
}

async function ensureCoordinates(job: QueueRow, listing: ListingIndexRow, dryRun: boolean) {
  if (isFiniteCoordinate(listing.latitude) && isFiniteCoordinate(listing.longitude)) {
    return { latitude: listing.latitude, longitude: listing.longitude };
  }

  const query = cleanSearchQuery(job.postal_code ?? listing.postal_code) ?? cleanSearchQuery(job.address_text ?? listing.address_text);
  if (!query) {
    await markJob(job, "failed", "Missing postal_code and address_text for geocoding", dryRun);
    return null;
  }

  const geocode = await geocodeOneMap(query, /^\d{6}$/.test(query) ? "postal_code" : "address_text");
  if (!geocode.ok) {
    await markJob(job, geocode.retryable ? "retry" : "failed", geocode.error, dryRun);
    return null;
  }

  if (!dryRun) {
    await updateListingCoordinates(job.listing_index_id, geocode.value);
  }

  return { latitude: geocode.value.latitude, longitude: geocode.value.longitude };
}

async function geocodeOneMap(query: string, confidence: GeocodeSuccess["confidence"]) {
  const endpoint = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  endpoint.searchParams.set("searchVal", query);
  endpoint.searchParams.set("returnGeom", "Y");
  endpoint.searchParams.set("getAddrDetails", "Y");
  endpoint.searchParams.set("pageNum", "1");

  const response = await fetchWithTimeout(endpoint, { headers: oneMapHeaders() });
  if (response.status === 429) return { ok: false as const, retryable: true, error: "OneMap Search HTTP 429 rate limited" };
  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, retryable: true, error: `OneMap Search HTTP ${response.status}: check ONEMAP_API_TOKEN` };
  }
  if (!response.ok) return { ok: false as const, retryable: true, error: `OneMap Search HTTP ${response.status}` };

  const payload = await response.json();
  if (payload?.error) return { ok: false as const, retryable: true, error: `OneMap Search error: ${String(payload.error)}` };

  const result = Array.isArray(payload?.results) ? payload.results[0] as OneMapSearchResult | undefined : undefined;
  if (!result) return { ok: false as const, retryable: false, error: "OneMap Search returned no result" };

  const latitude = Number(result.LATITUDE);
  const longitude = Number(result.LONGITUDE);
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) {
    return { ok: false as const, retryable: true, error: "OneMap Search result missing coordinates" };
  }

  return {
    ok: true as const,
    value: { latitude, longitude, confidence, raw_result: result }
  };
}

async function computeRoutes(coords: { latitude: number; longitude: number }, schools: SchoolLocation[]) {
  const travelTimes: Record<string, number> = {};
  const errors: string[] = [];

  for (const school of schools) {
    const result = await routeOneMap(coords, school);
    if (result.ok) {
      travelTimes[COMMUTE_COLUMNS[school.school_code]] = result.minutes;
    } else {
      errors.push(`${school.school_code}: ${result.error}`);
    }
  }

  return { travelTimes, errors };
}

async function routeOneMap(start: { latitude: number; longitude: number }, school: SchoolLocation) {
  const endpoint = new URL("https://www.onemap.gov.sg/api/public/routingsvc/route");
  endpoint.searchParams.set("start", `${start.latitude},${start.longitude}`);
  endpoint.searchParams.set("end", `${school.latitude},${school.longitude}`);
  endpoint.searchParams.set("routeType", "pt");
  endpoint.searchParams.set("mode", "transit");
  endpoint.searchParams.set("date", routeDate());
  endpoint.searchParams.set("time", process.env.ONEMAP_ROUTE_TIME ?? DEFAULT_ROUTE_TIME);
  endpoint.searchParams.set("numItineraries", "1");

  const response = await fetchWithTimeout(endpoint, { headers: oneMapHeaders() });
  if (response.status === 429) return { ok: false as const, error: "OneMap Route HTTP 429 rate limited" };
  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, error: `OneMap Route HTTP ${response.status}: check ONEMAP_API_TOKEN` };
  }
  if (!response.ok) return { ok: false as const, error: `OneMap Route HTTP ${response.status}` };

  const payload = await response.json();
  const seconds = extractRouteSeconds(payload);
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false as const, error: "OneMap Route response missing total time" };
  }

  return { ok: true as const, minutes: Math.max(1, Math.round(seconds / 60)) };
}

function extractRouteSeconds(payload: unknown): number | null {
  const record = payload as Record<string, any>;
  const direct = Number(record?.route_summary?.total_time ?? record?.route_summary?.totalTime ?? record?.total_time);
  if (Number.isFinite(direct)) return direct;

  const itinerary = record?.plan?.itineraries?.[0] ?? record?.itineraries?.[0];
  const duration = Number(itinerary?.duration ?? itinerary?.totalTime ?? itinerary?.time);
  return Number.isFinite(duration) ? duration : null;
}

async function updateListingCoordinates(listingIndexId: string, geocode: GeocodeSuccess): Promise<void> {
  await supabaseRequestWithRetry(`listing_indexes?id=eq.${encodeURIComponent(listingIndexId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      latitude: geocode.latitude,
      longitude: geocode.longitude,
      geocoded_at: new Date().toISOString(),
      geocode_source: "onemap_search",
      geocode_confidence: geocode.confidence
    })
  });
}

async function updateListingCommute(listingIndexId: string, travelTimes: Record<string, number>, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await supabaseRequestWithRetry(`listing_indexes?id=eq.${encodeURIComponent(listingIndexId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      ...travelTimes,
      commute_computed_at: new Date().toISOString(),
      commute_source: "onemap_route_pt"
    })
  });
}

async function markJob(job: QueueRow, status: JobStatus, lastError: string | null, dryRun: boolean): Promise<void> {
  if (dryRun) {
    if (lastError) {
      console.warn("Dry-run job status update", {
        job_id: job.id,
        listing_index_id: job.listing_index_id,
        status,
        last_error: lastError
      });
    }
    return;
  }
  await supabaseRequestWithRetry(`commute_enrichment_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      retry_count: status === "retry" ? Number(job.retry_count ?? 0) + 1 : Number(job.retry_count ?? 0),
      last_error: lastError,
      updated_at: new Date().toISOString()
    })
  });
}

async function supabaseRequestWithRetry<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SUPABASE_REQUEST_RETRIES; attempt += 1) {
    try {
      return await supabaseRequest<T>(path, init);
    } catch (error) {
      lastError = error;
      if (attempt === SUPABASE_REQUEST_RETRIES || !isRetryableSupabaseError(error)) break;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function isRetryableSupabaseError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("fetch failed")
    || message.includes("timeout")
    || message.includes("econnreset")
    || message.includes("enotfound")
    || message.includes("503")
    || message.includes("504");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneMapHeaders(): HeadersInit {
  const token = process.env.ONEMAP_API_TOKEN ?? process.env.ONEMAP_TOKEN;
  return {
    Accept: "application/json",
    ...(token ? { Authorization: token } : {}),
    "User-Agent": "sg-chinese-rental-mvp/1.0"
  };
}

async function fetchWithTimeout(input: URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = clampTimeout(process.env.ONEMAP_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OneMap request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function clampTimeout(value: string | undefined): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ONEMAP_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 5_000), 120_000);
}

function routeDate(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${date.getFullYear()}`;
}

function parseArgs(args: string[]) {
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  let school: SchoolCode | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--limit") limit = clampLimit(args[index + 1]);
    if (arg.startsWith("--limit=")) limit = clampLimit(arg.slice("--limit=".length));
    if (arg === "--school") school = parseSchool(args[index + 1]);
    if (arg.startsWith("--school=")) school = parseSchool(arg.slice("--school=".length));
  }

  return { limit, dryRun, school };
}

function parseSchool(value: string | undefined): SchoolCode {
  const school = String(value ?? "").trim().toUpperCase();
  if (!SCHOOL_CODES.includes(school as SchoolCode)) throw new Error(`--school must be one of ${SCHOOL_CODES.join(", ")}`);
  return school as SchoolCode;
}

function clampLimit(value: string | undefined): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function cleanSearchQuery(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1]?.endsWith("enrichCommute.ts")) {
  main().catch((error) => {
    console.error("Failed to enrich commute data", error);
    process.exit(1);
  });
}
