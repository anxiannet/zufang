import { NextResponse } from "next/server";
import { listing_preference_statuses, type CloudListingPreference } from "@/lib/listingPreferences";
import { parse_listing_preference_snapshot } from "@/lib/listingPreferenceSnapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth_client = await createClient();
  const { data: { user } } = await auth_client.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const { data, error } = await createAdminClient()
    .from("listing_user_preferences")
    .select("listing_key,status,updated_at,listing_snapshot")
    .eq("visitor_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return new Response(null, { status: 500 });

  const preferences: CloudListingPreference[] = [];
  for (const row of data ?? []) {
    const status = row.status === null
      ? null
      : listing_preference_statuses.includes(row.status as (typeof listing_preference_statuses)[number])
        ? row.status as (typeof listing_preference_statuses)[number]
        : undefined;
    if (status === undefined || !/^[A-Za-z0-9-]{1,64}$/.test(row.listing_key)) continue;
    const listing = parse_listing_preference_snapshot(row.listing_snapshot);
    if (status !== null && !listing) continue;
    preferences.push({
      listing_key: row.listing_key,
      status,
      updated_at: row.updated_at,
      listing
    });
  }

  return NextResponse.json(
    { preferences },
    { headers: { "cache-control": "private, no-store" } }
  );
}
