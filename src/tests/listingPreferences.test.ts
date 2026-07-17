import assert from "node:assert/strict";
import {
  empty_listing_preference_store,
  apply_cloud_listing_preferences,
  parse_listing_preference_store,
  update_listing_preference_store
} from "../../lib/listingPreferences";
import type { ListingCard } from "../../lib/types";
import { resolve_listing_preference_stats } from "../../lib/listingPreferenceDisplay";
import { parse_listing_preference_snapshot } from "../../lib/listingPreferenceSnapshot";

const listing: ListingCard = {
  id: "candidate-test-id",
  listing_no: null,
  candidate_no: 408,
  title: "文礼普通房",
  rent_amount: 1000,
  room_type: "common_room",
  postal_code: "640695",
  available_from: null,
  available_note: "马上入住",
  min_lease_months: null,
  cooking_policy: "no",
  registration_allowed: true,
  landlord_staying: null,
  bathroom_shared_with_count: null,
  current_occupants_count: null,
  description: "不应写入本地列表的完整正文",
  description_clean: "不应写入本地列表的完整正文",
  updated_at: "2026-07-17T00:00:00.000Z",
  geocoding: null,
  ntu_commute: null,
  listing_images: [
    { image_url: "4.jpg", sort_order: 4, caption: null },
    { image_url: "1.jpg", sort_order: 1, caption: null },
    { image_url: "2.jpg", sort_order: 2, caption: null },
    { image_url: "3.jpg", sort_order: 3, caption: null }
  ],
  card_source: "candidate"
};

const disliked = update_listing_preference_store(
  empty_listing_preference_store(),
  listing,
  "disliked",
  "2026-07-17T01:00:00.000Z"
);
assert.equal(disliked.items.C0408.status, "disliked");
assert.equal(disliked.items.C0408.listing.description, null);
assert.deepEqual(disliked.items.C0408.listing.listing_images?.map((image) => image.sort_order), [1, 2, 3]);

const favorite = update_listing_preference_store(disliked, listing, "favorite", "2026-07-17T02:00:00.000Z");
assert.equal(favorite.items.C0408.status, "favorite");
assert.equal(Object.keys(favorite.items).length, 1);

const cleared = update_listing_preference_store(favorite, listing, null);
assert.deepEqual(cleared.items, {});

assert.deepEqual(parse_listing_preference_store("invalid json"), empty_listing_preference_store());
assert.deepEqual(parse_listing_preference_store(JSON.stringify({ version: 2, items: {} })), empty_listing_preference_store());

const localFallback = resolve_listing_preference_stats(undefined, "favorite");
assert.equal(localFallback.is_local_fallback, true);
assert.equal(localFallback.stats?.counts.favorite, 1);
assert.equal(localFallback.stats?.total_users, 1);

const serverStats = {
  counts: { favorite: 3, contact_later: 2, rented: 1, disliked: 0 },
  total_users: 6
};
const serverPreferred = resolve_listing_preference_stats(serverStats, "disliked");
assert.equal(serverPreferred.is_local_fallback, false);
assert.deepEqual(serverPreferred.stats, serverStats);

const cloudListing = { ...listing, title: "云端房源标题" };
const cloudMerged = apply_cloud_listing_preferences(empty_listing_preference_store(), [{
  listing_key: "C0408",
  status: "contact_later",
  updated_at: "2026-07-17T03:00:00.000Z",
  listing: cloudListing
}]);
assert.equal(cloudMerged.items.C0408.status, "contact_later");
assert.equal(cloudMerged.items.C0408.listing.title, "云端房源标题");

const localWins = apply_cloud_listing_preferences(favorite, [{
  listing_key: "C0408",
  status: "disliked",
  updated_at: "2026-07-17T01:30:00.000Z",
  listing: cloudListing
}]);
assert.equal(localWins.items.C0408.status, "favorite");

const cloudDeleted = apply_cloud_listing_preferences(favorite, [{
  listing_key: "C0408",
  status: null,
  updated_at: "2026-07-17T03:00:00.000Z",
  listing: null
}]);
assert.deepEqual(cloudDeleted.items, {});

const sanitizedSnapshot = parse_listing_preference_snapshot({ ...listing, phone: "should-not-sync" });
assert.ok(sanitizedSnapshot);
assert.equal("phone" in sanitizedSnapshot, false);

console.log("listingPreferences tests passed");
