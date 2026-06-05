"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildIndex } from "@/src/services/listingPipelineParts/buildIndex";
import { cleanListing } from "@/src/services/listingPipelineParts/cleanListing";

type RebuildSummary = {
  found: number;
  cleaned: number;
  indexed: number;
  invalid: number;
  errors: number;
};

export type ListingPipelineStats = {
  clean: number;
  indexes: number;
  active: number;
  invalid: number;
  removed: number;
  orphanIndexes: number;
  diff: number;
};

const BATCH_SIZE = 500;

export async function rebuildListingPipeline() {
  await requireRole(["admin"]);

  let summary: RebuildSummary;
  try {
    summary = await rebuildAllListingsFromIngestion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/admin/ingestion?rebuild_error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/ingestion");
  redirect(
    `/admin/ingestion?rebuilt=1&found=${summary.found}&cleaned=${summary.cleaned}&indexed=${summary.indexed}&invalid=${summary.invalid}&errors=${summary.errors}`
  );
}

export async function getListingPipelineStats(): Promise<ListingPipelineStats> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();

  const [clean, indexes, active, invalid, removed, orphanCandidates] = await Promise.all([
    supabase.from("listing_clean").select("id", { count: "exact", head: true }),
    supabase.from("listing_indexes").select("id", { count: "exact", head: true }),
    supabase.from("listing_clean").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("listing_clean").select("id", { count: "exact", head: true }).eq("status", "invalid"),
    supabase.from("listing_clean").select("id", { count: "exact", head: true }).eq("status", "removed"),
    supabase.from("listing_indexes").select("id,clean_listing_id").limit(1000)
  ]);

  for (const result of [clean, indexes, active, invalid, removed, orphanCandidates]) {
    if (result.error) throw new Error(result.error.message);
  }

  const cleanIds = await fetchCleanIdSet(supabase);
  const orphanIndexes = (orphanCandidates.data ?? []).filter((row: any) => !cleanIds.has(String(row.clean_listing_id))).length;
  const cleanCount = clean.count ?? 0;
  const indexCount = indexes.count ?? 0;
  const invalidCount = invalid.count ?? 0;
  const removedCount = removed.count ?? 0;

  return {
    clean: cleanCount,
    indexes: indexCount,
    active: active.count ?? 0,
    invalid: invalidCount,
    removed: removedCount,
    orphanIndexes,
    diff: Math.max(cleanCount - invalidCount - removedCount - indexCount, 0)
  };
}

async function fetchCleanIdSet(supabase: ReturnType<typeof createAdminClient>): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("listing_clean")
      .select("id")
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) ids.add(String(row.id));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return ids;
}

async function rebuildAllListingsFromIngestion(): Promise<RebuildSummary> {
  const supabase = createAdminClient();
  const summary: RebuildSummary = {
    found: 0,
    cleaned: 0,
    indexed: 0,
    invalid: 0,
    errors: 0
  };

  let from = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("ingestion_listings")
      .select(
        "id,source,source_id,listing_url,detail_url,list_title,list_price,list_contact,list_raw_html,list_raw_text,raw_detail_html,is_top,removed_from_source,scraped_at,created_at"
      )
      .order("scraped_at", { ascending: true, nullsFirst: false })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!rows?.length) break;

    summary.found += rows.length;

    for (const row of rows) {
      try {
        const cleanInput = cleanListing(row as any);
        if (!cleanInput) {
          summary.errors += 1;
          continue;
        }

        const { data: cleanRows, error: cleanError } = await supabase
          .from("listing_clean")
          .upsert(cleanInput, { onConflict: "source,source_id" })
          .select("*");

        if (cleanError) throw new Error(cleanError.message);
        const cleanRow = cleanRows?.[0];
        if (!cleanRow?.id) throw new Error("listing_clean upsert did not return an id");
        summary.cleaned += 1;

        if (cleanRow.status === "invalid") summary.invalid += 1;

        const indexRow = buildIndex(cleanRow as any);
        const { error: indexError } = await supabase
          .from("listing_indexes")
          .upsert(indexRow, { onConflict: "source,source_id" });

        if (indexError) throw new Error(indexError.message);
        summary.indexed += 1;
      } catch (error) {
        summary.errors += 1;
        console.error("Failed to rebuild listing", {
          source: row.source,
          source_id: row.source_id,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (rows.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return summary;
}
