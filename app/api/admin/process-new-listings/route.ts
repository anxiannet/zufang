import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { processNewListings } from "@/src/services/listingPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProcessNewListingsRequest = {
  limit?: number;
};

export async function POST(request: NextRequest) {
  const authorized = await isAuthorized(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await readJsonBody(request);
    const limit = normalizeLimit(body?.limit);
    const summary = await processNewListings(limit);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        found: 0,
        cleaned: 0,
        indexed: 0,
        errors: 1
      },
      { status: 500 }
    );
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

async function readJsonBody(request: NextRequest): Promise<ProcessNewListingsRequest | null> {
  try {
    return (await request.json()) as ProcessNewListingsRequest;
  } catch {
    return null;
  }
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.floor(value), 500);
}
