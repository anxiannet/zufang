import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichNearbyPlacesCache } from "@/src/services/nearbyPlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = Math.min(
      Math.max(Number.parseInt(process.env.NEARBY_PLACES_ENRICHMENT_LIMIT ?? "10", 10) || 10, 1),
      50
    );
    const result = await enrichNearbyPlacesCache(createAdminClient(), { limit });
    console.info("Nearby places enrichment", result);
    return NextResponse.json(result, { status: result.failed_count > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
