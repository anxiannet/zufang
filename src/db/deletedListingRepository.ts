import { ListListing } from "../models/listing";
import { supabaseRequest } from "./pool";

type DeletedListingRow = {
  source: string;
  source_id: string;
};

export async function findDeletedListings(listings: ListListing[]): Promise<Set<string>> {
  const uniqueListings = Array.from(
    new Map(listings.map((listing) => [deletedListingKey(listing.source, listing.sourceId), listing])).values()
  );

  if (uniqueListings.length === 0) return new Set();

  const deletedKeys = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < uniqueListings.length; index += chunkSize) {
    const chunk = uniqueListings.slice(index, index + chunkSize);
    const sources = Array.from(new Set(chunk.map((listing) => listing.source)));
    const sourceIds = chunk.map((listing) => listing.sourceId);
    const params = new URLSearchParams({
      select: "source,source_id",
      source: `in.(${sources.map(escapePostgrestListValue).join(",")})`,
      source_id: `in.(${sourceIds.map(escapePostgrestListValue).join(",")})`
    });

    let rows: DeletedListingRow[] = [];
    try {
      rows = await supabaseRequest<DeletedListingRow[]>(`deleted_ingestion_listings?${params.toString()}`);
    } catch (error) {
      if (isMissingDeletedListingTableError(error)) return deletedKeys;
      throw error;
    }
    rows.forEach((row) => deletedKeys.add(deletedListingKey(row.source, row.source_id)));
  }

  return deletedKeys;
}

export function deletedListingKey(source: string, sourceId: string) {
  return `${source}:${sourceId}`;
}

function escapePostgrestListValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isMissingDeletedListingTableError(error: unknown) {
  return error instanceof Error && /deleted_ingestion_listings|PGRST205|404/.test(error.message);
}
