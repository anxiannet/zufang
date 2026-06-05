import { runCommuteEnrichment } from "@/scripts/enrichCommute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ONEMAP_API_TOKEN && !process.env.ONEMAP_TOKEN) {
    return Response.json({ success: false, error: "ONEMAP_API_TOKEN is required" }, { status: 500 });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? process.env.COMMUTE_ENRICHMENT_LIMIT ?? "10", 10);

  try {
    const summary = await runCommuteEnrichment({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10
    });

    return Response.json({ success: summary.failed_count === 0, ...summary });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
