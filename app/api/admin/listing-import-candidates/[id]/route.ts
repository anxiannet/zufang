import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editable_fields = new Set([
  "parsed_title",
  "parsed_rent_amount",
  "parsed_postal_code",
  "parsed_room_type",
  "parsed_listing_type",
  "parsed_available_from",
  "parsed_min_lease_months",
  "parsed_max_occupants",
  "parsed_phone",
  "parsed_wechat",
  "parsed_registration_allowed",
  "parsed_landlord_staying",
  "parsed_utilities_policy",
  "parsed_aircon_policy",
  "parsed_cooking_policy",
  "parsed_visitors_policy",
  "parsed_smoking_policy",
  "parsed_pets_policy",
  "import_status"
]);
const editable_statuses = new Set(["parsed", "needs_review", "approved", "rejected", "duplicate"]);
const protected_statuses = new Set(["imported"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: candidate, error } = await supabase
    .from("listing_import_candidates")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });

  const { data: ingestion, error: ingestion_error } = await supabase
    .from("ingestion_listings")
    .select("*")
    .eq("id", candidate.ingestion_listing_id)
    .single();
  if (ingestion_error) return NextResponse.json({ error: ingestion_error.message }, { status: 500 });

  return NextResponse.json({ candidate, ingestion });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  let profile;
  try {
    profile = await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing, error: existing_error } = await supabase
    .from("listing_import_candidates")
    .select("import_status")
    .eq("id", id)
    .single();
  if (existing_error) return NextResponse.json({ error: existing_error.message }, { status: 404 });
  if (protected_statuses.has(existing.import_status)) {
    return NextResponse.json({ error: "Imported candidates cannot be edited" }, { status: 409 });
  }

  const update = Object.fromEntries(
    Object.entries(body).filter(([key]) => editable_fields.has(key))
  ) as Record<string, unknown>;
  if (typeof update.import_status === "string" && !editable_statuses.has(update.import_status)) {
    return NextResponse.json({ error: "Invalid import_status" }, { status: 400 });
  }
  update.reviewed_by = profile.id;
  update.reviewed_at = new Date().toISOString();
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("listing_import_candidates")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}
