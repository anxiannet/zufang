import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = ["pending", "parsed", "needs_review", "approved", "rejected", "imported", "failed", "duplicate"];

export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  if (status && !statuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("listing_import_candidates")
    .select("id,source,source_id,source_url,parsed_title,parsed_rent_amount,parsed_postal_code,parsed_area,parsed_mrt,parsed_room_type,parsed_phone,parsed_wechat,parse_confidence,parse_warnings,import_status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("import_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
