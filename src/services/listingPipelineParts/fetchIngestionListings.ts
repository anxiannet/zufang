import { IngestionListingRow } from "../../models/listing";
import { supabaseRequest } from "../../db/pool";
import { INGESTION_TABLE, CLEAN_TABLE } from "./constants";
import { ProcessNewListingsOptions } from "./types";

export async function fetchUnprocessedIngestionListings(
  options: Required<Pick<ProcessNewListingsOptions, "limit" | "onlyActive">> & { source?: string }
): Promise<IngestionListingRow[]> {
  const output: IngestionListingRow[] = [];
  const pageSize = Math.min(Math.max(options.limit * 5, options.limit), 500);
  let offset = 0;

  while (output.length < options.limit) {
    const candidates = await fetchIngestionListings({
      limit: pageSize,
      offset,
      source: options.source,
      onlyActive: options.onlyActive
    });

    if (candidates.length === 0) break;

    for (const row of candidates) {
      if (output.length >= options.limit) break;
      if (!row.source || !row.source_id) continue;
      const alreadyCleaned = await hasListingClean(row.source, row.source_id);
      if (!alreadyCleaned) output.push(row);
    }

    if (candidates.length < pageSize) break;
    offset += pageSize;
  }

  return output;
}

async function fetchIngestionListings(options: {
  limit: number;
  offset: number;
  source?: string;
  onlyActive: boolean;
}): Promise<IngestionListingRow[]> {
  const params = new URLSearchParams({
    select: [
      "id",
      "source",
      "source_id",
      "listing_url",
      "detail_url",
      "list_title",
      "list_price",
      "list_contact",
      "list_raw_html",
      "list_raw_text",
      "raw_detail_html",
      "is_top",
      "removed_from_source",
      "scraped_at",
      "created_at"
    ].join(","),
    order: "scraped_at.desc.nullslast",
    limit: String(options.limit),
    offset: String(options.offset)
  });

  if (options.source) params.set("source", `eq.${options.source}`);
  if (options.onlyActive) params.set("removed_from_source", "is.false");

  return supabaseRequest<IngestionListingRow[]>(`${INGESTION_TABLE}?${params.toString()}`);
}

async function hasListingClean(source: string, sourceId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "id",
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1"
  });
  const rows = await supabaseRequest<Array<{ id: string }>>(`${CLEAN_TABLE}?${params.toString()}`);
  return rows.length > 0;
}
