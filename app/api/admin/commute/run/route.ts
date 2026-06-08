import { NextResponse } from "next/server";
import { runCommuteEnrichment, type SchoolCode } from "@/scripts/enrichCommute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SCHOOL_CODES: SchoolCode[] = ["NTU", "NUS", "SMU", "SUTD"];

let isRunning = false;

export async function POST(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  if (isRunning) {
    return NextResponse.json(
      { success: false, error: "Commute enrichment is already running. Please wait for the current run to finish." },
      { status: 409 }
    );
  }

  isRunning = true;
  const startedAt = new Date();

  try {
    const body = await readJsonBody(request);
    const limit = parseLimit(body?.limit);
    const school = parseSchool(body?.school);
    const dryRun = body?.dryRun === true;

    const result = await runCommuteEnrichment({ limit, school, dryRun });

    return NextResponse.json({
      success: true,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}

function authorizeAdminRequest(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_JOB_SECRET;
  if (!secret) return null;

  const headerSecret = request.headers.get("x-admin-job-secret");
  if (headerSecret === secret) return null;

  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseSchool(value: unknown): SchoolCode | undefined {
  const school = String(value ?? "").trim().toUpperCase();
  if (!school || school === "ALL") return undefined;
  if (SCHOOL_CODES.includes(school as SchoolCode)) return school as SchoolCode;
  throw new Error(`school must be one of ALL, ${SCHOOL_CODES.join(", ")}`);
}
