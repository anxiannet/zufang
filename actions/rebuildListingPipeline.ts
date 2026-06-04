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

async function rebuildAllListingsFromIngestion(): Promise<RebuildSummary> {
  const supabase = createAdminClient();
  const summary: RebuildSummary = {
    found: 0,
    cleaned: 0,
    indexed: 0,
    invalid: 0,
    errors: 0
  };

  await clearTable(supabase, "listing_indexes");
  await clearTable(supabase, "listing_clean");

  let from = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("ingestion_listings")
      .select(
        "id,source,source_id,listing_url,detail_url,list_title,list_posted_text,list_price,list_contact,list_raw_html,list_raw_text,raw_detail_html,is_top,removed_from_source,scraped_at,created_at"
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

        const { data: cleanRow, error: cleanError } = await supabase
          .from("listing_clean")
          .insert(cleanInput)
          .select("*")
          .single();

        if (cleanError) throw new Error(cleanError.message);
        summary.cleaned += 1;

        if (cleanRow.status !== "active") {
          if (cleanRow.status === "invalid") summary.invalid += 1;
          continue;
        }

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

async function clearTable(supabase: ReturnType<typeof createAdminClient>, tableName: string) {
  const { error } = await supabase.from(tableName).delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}
