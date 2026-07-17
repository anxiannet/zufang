import type { ListingCard } from "@/lib/types";
import { getListingPublicId } from "@/lib/listingUrl";
import {
  create_listing_preference_snapshot,
  parse_listing_preference_snapshot
} from "@/lib/listingPreferenceSnapshot";

export const LISTING_PREFERENCES_STORAGE_KEY = "weijie_listing_preferences_v1";
export const LISTING_PREFERENCES_CHANGED_EVENT = "weijie:listing-preferences-changed";
export const LISTING_PREFERENCE_VISITOR_ID_KEY = "weijie_listing_preference_visitor_id_v1";

export const listing_preference_statuses = [
  "favorite",
  "contact_later",
  "rented",
  "disliked"
] as const;

export type ListingPreferenceStatus = (typeof listing_preference_statuses)[number];

export type ListingPreference = {
  status: ListingPreferenceStatus;
  updated_at: string;
  listing: ListingCard;
};

export type ListingPreferenceStore = {
  version: 1;
  items: Record<string, ListingPreference>;
};

export type CloudListingPreference = {
  listing_key: string;
  status: ListingPreferenceStatus | null;
  updated_at: string;
  listing: ListingCard | null;
};

export function empty_listing_preference_store(): ListingPreferenceStore {
  return { version: 1, items: {} };
}

export function listing_preference_key(listing: ListingCard): string {
  return getListingPublicId(listing);
}

export function parse_listing_preference_store(value: string | null): ListingPreferenceStore {
  if (!value) return empty_listing_preference_store();

  try {
    const parsed = JSON.parse(value) as Partial<ListingPreferenceStore>;
    if (parsed.version !== 1 || !parsed.items || typeof parsed.items !== "object") {
      return empty_listing_preference_store();
    }

    const items: Record<string, ListingPreference> = {};
    for (const [key, value] of Object.entries(parsed.items)) {
      const preference = value as Partial<ListingPreference> | null;
      const listing = parse_listing_preference_snapshot(preference?.listing);
      if (
        !preference ||
        !listing ||
        !listing_preference_statuses.includes(preference.status as ListingPreferenceStatus) ||
        typeof preference.updated_at !== "string" ||
        !Number.isFinite(Date.parse(preference.updated_at))
      ) continue;
      items[key] = {
        status: preference.status as ListingPreferenceStatus,
        updated_at: preference.updated_at,
        listing
      };
    }
    return { version: 1, items };
  } catch {
    return empty_listing_preference_store();
  }
}

export function read_listing_preference_store(): ListingPreferenceStore {
  if (typeof window === "undefined") return empty_listing_preference_store();
  return parse_listing_preference_store(window.localStorage.getItem(LISTING_PREFERENCES_STORAGE_KEY));
}

export function apply_cloud_listing_preferences(
  local_store: ListingPreferenceStore,
  cloud_preferences: CloudListingPreference[]
): ListingPreferenceStore {
  const items = { ...local_store.items };
  for (const cloud_preference of cloud_preferences) {
    if (
      !/^[A-Za-z0-9-]{1,64}$/.test(cloud_preference.listing_key) ||
      !Number.isFinite(Date.parse(cloud_preference.updated_at))
    ) continue;
    const local_preference = items[cloud_preference.listing_key];
    if (local_preference && local_preference.updated_at > cloud_preference.updated_at) continue;
    if (cloud_preference.status === null) {
      delete items[cloud_preference.listing_key];
      continue;
    }
    if (!listing_preference_statuses.includes(cloud_preference.status)) continue;
    const listing = cloud_preference.listing ?? local_preference?.listing;
    if (!listing) continue;
    items[cloud_preference.listing_key] = {
      status: cloud_preference.status,
      updated_at: cloud_preference.updated_at,
      listing: create_listing_preference_snapshot(listing)
    };
  }
  return { version: 1, items };
}

export function write_listing_preference_store(store: ListingPreferenceStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LISTING_PREFERENCES_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(LISTING_PREFERENCES_CHANGED_EVENT));
}

export function update_listing_preference_store(
  store: ListingPreferenceStore,
  listing: ListingCard,
  status: ListingPreferenceStatus | null,
  updated_at = new Date().toISOString()
): ListingPreferenceStore {
  const key = listing_preference_key(listing);
  const items = { ...store.items };
  if (status === null) {
    delete items[key];
  } else {
    items[key] = {
      status,
      updated_at,
      listing: create_listing_preference_snapshot(listing)
    };
  }
  return { version: 1, items };
}

export function persist_listing_preference(
  listing: ListingCard,
  status: ListingPreferenceStatus | null
): ListingPreferenceStore {
  const updated_at = new Date().toISOString();
  const next_store = update_listing_preference_store(
    read_listing_preference_store(),
    listing,
    status,
    updated_at
  );
  write_listing_preference_store(next_store);
  submit_listing_preference_silently(listing, status, updated_at);
  return next_store;
}

export function submit_listing_preference_silently(
  listing: ListingCard,
  status: ListingPreferenceStatus | null,
  updated_at: string
) {
  if (typeof window === "undefined") return;
  const visitor_id = get_or_create_listing_preference_visitor_id();
  if (!visitor_id) return;
  const is_candidate = listing.card_source === "candidate" || listing.id.startsWith("candidate-");
  const body = JSON.stringify({
    visitor_id,
    listing_key: listing_preference_key(listing),
    listing_source: is_candidate ? "candidate" : "official",
    status,
    candidate_no: is_candidate ? listing.candidate_no ?? null : null,
    listing_no: is_candidate ? null : listing.listing_no,
    updated_at,
    listing_snapshot: create_listing_preference_snapshot(listing)
  });

  window.setTimeout(() => {
    void window.fetch("/api/listing-preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true
    }).catch(() => undefined);
  }, 0);
}

function get_or_create_listing_preference_visitor_id(): string | null {
  try {
    const existing = window.localStorage.getItem(LISTING_PREFERENCE_VISITOR_ID_KEY);
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)
    ) return existing;
    const visitor_id = window.crypto.randomUUID();
    window.localStorage.setItem(LISTING_PREFERENCE_VISITOR_ID_KEY, visitor_id);
    return visitor_id;
  } catch {
    return null;
  }
}
