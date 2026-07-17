import { NextResponse } from "next/server";
import { listing_preference_statuses } from "@/lib/listingPreferences";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { get_listing_preference_stats_map } from "@/lib/listingPreferenceStats";
import { parse_listing_preference_snapshot } from "@/lib/listingPreferenceSnapshot";
import type { ListingCard } from "@/lib/types";

export const dynamic = "force-dynamic";

type PreferenceSubmission = {
  visitor_id: string;
  listing_key: string;
  listing_source: "official" | "candidate";
  status: (typeof listing_preference_statuses)[number] | null;
  candidate_no: number | null;
  listing_no: number | null;
  updated_at: string;
  listing_snapshot: ListingCard | null;
};

export async function GET(request: Request) {
  const listing_keys = [...new Set(new URL(request.url).searchParams.getAll("listing_key"))];
  if (
    listing_keys.length === 0 ||
    listing_keys.length > 100 ||
    listing_keys.some((key) => key.length > 64 || !/^[A-Za-z0-9-]+$/.test(key))
  ) {
    return NextResponse.json({ error: "invalid_listing_keys" }, { status: 400 });
  }

  const stats_by_key = await get_listing_preference_stats_map(listing_keys);
  return NextResponse.json(
    { stats: Object.fromEntries(stats_by_key) },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const content_length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(content_length) && content_length > 100_000) {
    return new Response(null, { status: 413 });
  }

  let submission: PreferenceSubmission;
  try {
    const body = await request.text();
    if (body.length > 100_000) return new Response(null, { status: 413 });
    submission = validate_submission(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "invalid_submission" }, { status: 400 });
  }

  const auth_client = await createClient();
  const { data: { user } } = await auth_client.auth.getUser();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("record_listing_user_preference", {
    p_visitor_id: user?.id ?? submission.visitor_id,
    p_anonymous_visitor_id: submission.visitor_id,
    p_listing_key: submission.listing_key,
    p_listing_source: submission.listing_source,
    p_status: submission.status,
    p_candidate_no: submission.candidate_no,
    p_listing_no: submission.listing_no,
    p_updated_at: submission.updated_at,
    p_listing_snapshot: submission.listing_snapshot,
    p_keep_tombstone: Boolean(user)
  });
  if (error) return new Response(null, { status: 500 });
  return new Response(null, { status: 204 });
}

function validate_submission(value: unknown): PreferenceSubmission {
  if (!value || typeof value !== "object") throw new Error("invalid_payload");
  const input = value as Record<string, unknown>;
  const visitor_id = string_value(input.visitor_id);
  const listing_key = string_value(input.listing_key);
  const listing_source = input.listing_source;
  const status = input.status;
  const candidate_no = nullable_positive_integer(input.candidate_no);
  const listing_no = nullable_positive_integer(input.listing_no);
  const updated_at = string_value(input.updated_at);
  const listing_snapshot = parse_listing_preference_snapshot(input.listing_snapshot);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor_id)) {
    throw new Error("invalid_visitor_id");
  }
  if (listing_key.length > 64 || !/^[A-Za-z0-9-]+$/.test(listing_key)) {
    throw new Error("invalid_listing_key");
  }
  if (listing_source !== "official" && listing_source !== "candidate") {
    throw new Error("invalid_listing_source");
  }
  if (status !== null && !listing_preference_statuses.includes(status as PreferenceSubmission["status"] & string)) {
    throw new Error("invalid_status");
  }
  if (listing_source === "candidate" && listing_no !== null) throw new Error("invalid_listing_no");
  if (listing_source === "official" && candidate_no !== null) throw new Error("invalid_candidate_no");
  if (!Number.isFinite(Date.parse(updated_at))) throw new Error("invalid_updated_at");
  if (status !== null && !listing_snapshot) throw new Error("invalid_listing_snapshot");
  if (listing_snapshot && listing_preference_key_for_snapshot(listing_snapshot) !== listing_key) {
    throw new Error("listing_snapshot_mismatch");
  }

  return {
    visitor_id,
    listing_key,
    listing_source,
    status: status as PreferenceSubmission["status"],
    candidate_no,
    listing_no,
    updated_at,
    listing_snapshot
  };
}

function listing_preference_key_for_snapshot(listing: ListingCard): string {
  const is_candidate = listing.card_source === "candidate" || listing.id.startsWith("candidate-");
  if (is_candidate && listing.candidate_no) return `C${String(listing.candidate_no).padStart(4, "0")}`;
  if (!is_candidate && listing.listing_no) return String(listing.listing_no).padStart(5, "0");
  return listing.id;
}

function string_value(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("invalid_string");
  return value;
}

function nullable_positive_integer(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("invalid_integer");
  return value as number;
}
