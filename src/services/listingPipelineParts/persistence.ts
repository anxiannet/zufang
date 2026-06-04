import { ListingIndexRow } from "../../models/listing";
import { supabaseRequest } from "../../db/pool";
import { CLEAN_TABLE, INDEX_TABLE } from "./constants";
import { ListingCleanInsertRow, ListingCleanRow } from "./types";

export async function upsertListingClean(row: ListingCleanInsertRow): Promise<ListingCleanRow> {
  const result = await supabaseRequest<ListingCleanRow[]>(`${CLEAN_TABLE}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(row)
  });

  const cleanRow = result[0];
  if (!cleanRow?.id) {
    throw new Error("listing_clean upsert did not return an id");
  }
  return cleanRow;
}

export async function upsertListingIndex(row: ListingIndexRow): Promise<void> {
  await supabaseRequest(`${INDEX_TABLE}?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  });
}
