import type { ListingPreferenceStatus } from "@/lib/listingPreferences";
import type { ListingCard } from "@/lib/types";

type PreferenceStats = NonNullable<ListingCard["user_preference_stats"]>;

export function resolve_listing_preference_stats(
  server_stats: ListingCard["user_preference_stats"],
  local_status: ListingPreferenceStatus | null
): { stats: ListingCard["user_preference_stats"]; is_local_fallback: boolean } {
  if (server_stats && server_stats.total_users > 0) {
    return { stats: server_stats, is_local_fallback: false };
  }
  if (!local_status) return { stats: server_stats, is_local_fallback: false };

  const counts: PreferenceStats["counts"] = {
    favorite: 0,
    contact_later: 0,
    rented: 0,
    disliked: 0
  };
  counts[local_status] = 1;
  return {
    stats: { counts, total_users: 1 },
    is_local_fallback: true
  };
}
