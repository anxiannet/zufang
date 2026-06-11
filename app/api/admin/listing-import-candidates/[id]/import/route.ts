import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { importCandidateToListing } from "@/src/import/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let profile;
  try {
    profile = await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readBody(request);
  const system_owner_id = String(body?.systemOwnerId ?? "").trim();
  if (!system_owner_id) {
    return NextResponse.json({ error: "systemOwnerId is required" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await importCandidateToListing(createAdminClient(), id, {
      reviewedBy: profile.id,
      systemOwnerId: system_owner_id
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}
