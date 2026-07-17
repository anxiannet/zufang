import { createAdminClient } from "@/lib/supabase/admin";
import {
  listing_preference_statuses,
  type ListingPreferenceStatus
} from "@/lib/listingPreferences";

export type ListingPreferenceStats = {
  counts: Record<ListingPreferenceStatus, number>;
  total_users: number;
};

export function empty_listing_preference_stats(): ListingPreferenceStats {
  return {
    counts: {
      favorite: 0,
      contact_later: 0,
      rented: 0,
      disliked: 0
    },
    total_users: 0
  };
}

export async function get_listing_preference_stats(
  listing_key: string
): Promise<ListingPreferenceStats> {
  const stats_by_key = await get_listing_preference_stats_map([listing_key]);
  return stats_by_key.get(listing_key) ?? empty_listing_preference_stats();
}

export async function get_listing_preference_stats_map(
  listing_keys: string[]
): Promise<Map<string, ListingPreferenceStats>> {
  const unique_keys = [...new Set(listing_keys.filter(Boolean))];
  if (unique_keys.length === 0) return new Map();

  const { data, error } = await createAdminClient()
    .from("listing_preference_stats")
    .select("listing_key,status,user_count")
    .in("listing_key", unique_keys);

  if (error) {
    console.error("读取房源用户标记统计失败", { listing_keys: unique_keys, message: error.message });
    return new Map();
  }

  const stats_by_key = new Map<string, ListingPreferenceStats>();
  for (const row of data ?? []) {
    if (!listing_preference_statuses.includes(row.status as ListingPreferenceStatus)) continue;
    const status = row.status as ListingPreferenceStatus;
    const user_count = Number(row.user_count);
    if (!Number.isSafeInteger(user_count) || user_count < 0) continue;
    const stats = stats_by_key.get(row.listing_key) ?? empty_listing_preference_stats();
    stats.counts[status] = user_count;
    stats.total_users += user_count;
    stats_by_key.set(row.listing_key, stats);
  }
  return stats_by_key;
}
