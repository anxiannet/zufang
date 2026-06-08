import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCommuteEnrichment, type SchoolCode } from "@/scripts/enrichCommute";
import { enqueueMissingCommuteJobs } from "@/src/services/commuteEnrichmentQueue";
import { ensureOneMapTokenEnv } from "@/src/services/oneMapToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SCHOOL_CODES: SchoolCode[] = ["NTU", "NUS", "SMU", "SUTD"];

let isRunning = false;

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (isRunning) {
    return NextResponse.json(
      { success: false, error: "Commute task is already running. Please wait for the current run to finish." },
      { status: 409 }
    );
  }

  isRunning = true;
  const startedAt = new Date();

  try {
    const body = await readJsonBody(request);
    const action = String(body?.action ?? "run");
    const limit = parseLimit(body?.limit);
    const school = parseSchool(body?.school);

    if (action === "enqueue_missing") {
      const result = await enqueueMissingCommuteJobs(limit);
      return successResponse(startedAt, action, result);
    }

    if (action === "retry_failed") {
      const adminSupabase = createAdminClient();
      const { data, error } = await adminSupabase
        .from("commute_enrichment_jobs")
        .update({
          status: "pending",
          retry_count: 0,
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq("status", "failed")
        .select("id");

      if (error) throw new Error(error.message);
      return successResponse(startedAt, action, { enqueued: data?.length ?? 0 });
    }

    if (action === "run" || action === "dry_run") {
      await ensureOneMapTokenEnv();
      const result = await runCommuteEnrichment({
        limit,
        school,
        dryRun: action === "dry_run"
      });
      return successResponse(startedAt, action, result);
    }

    throw new Error(`Unsupported commute action: ${action}`);
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

function successResponse(startedAt: Date, action: string, result: unknown) {
  return NextResponse.json({
    success: true,
    action,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    result
  });
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
