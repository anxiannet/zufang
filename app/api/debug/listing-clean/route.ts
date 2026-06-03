import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEBUG_TOKEN = process.env.DEBUG_API_TOKEN;
const TABLE_NAME = process.env.LISTING_CLEAN_TABLE_NAME ?? "listing_clean";

const publicFields = [
  "source_id",
  "title",
  "listing_url",
  "detail_url",
  "category",
  "price",
  "mrt_area",
  "phone",
  "wechat",
  "whatsapp_url",
  "tags",
  "body_text",
  "clean_text",
  "room_type",
  "normalized_room_type",
  "available_from",
  "cooking_allowed",
  "can_register_address",
  "landlord_stay",
  "bathroom_type",
  "shared_bathroom_count",
  "current_tenant_count",
  "gender_preference",
  "amenities",
  "address_text",
  "postal_code",
  "fingerprint",
  "status",
  "parsed_from_html",
  "raw_html_available",
  "clean_version",
  "updated_at"
];

export async function GET(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing" },
      { status: 500 }
    );
  }

  if (DEBUG_TOKEN) {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== DEBUG_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 20, 1);
  const sourceId = url.searchParams.get("source_id")?.trim();
  const status = url.searchParams.get("status")?.trim() || "active";

  const params = new URLSearchParams({
    select: publicFields.join(","),
    order: "updated_at.desc.nullslast",
    limit: String(limit)
  });

  if (sourceId) {
    params.set("source_id", `eq.${sourceId}`);
  }

  if (status && status !== "all") {
    params.set("status", `eq.${status}`);
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${TABLE_NAME}?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "Failed to fetch listing_clean", status: response.status, body },
      { status: 500 }
    );
  }

  const rows = await response.json();

  return NextResponse.json({
    table: TABLE_NAME,
    count: Array.isArray(rows) ? rows.length : 0,
    filters: { source_id: sourceId ?? null, status, limit },
    data: rows
  });
}

function clampNumber(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
