"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListingCard } from "@/lib/types";
import {
  empty_listing_preference_store,
  LISTING_PREFERENCES_CHANGED_EVENT,
  LISTING_PREFERENCES_STORAGE_KEY,
  listing_preference_key,
  persist_listing_preference,
  read_listing_preference_store,
  type ListingPreferenceStatus
} from "@/lib/listingPreferences";

export function useListingPreferences() {
  const [store, set_store] = useState(empty_listing_preference_store);
  const [is_hydrated, set_is_hydrated] = useState(false);

  const refresh = useCallback(() => {
    set_store(read_listing_preference_store());
    set_is_hydrated(true);
  }, []);

  useEffect(() => {
    refresh();
    const handle_storage = (event: StorageEvent) => {
      if (event.key === LISTING_PREFERENCES_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", handle_storage);
    window.addEventListener(LISTING_PREFERENCES_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", handle_storage);
      window.removeEventListener(LISTING_PREFERENCES_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const set_listing_status = useCallback((listing: ListingCard, status: ListingPreferenceStatus | null) => {
    set_store(persist_listing_preference(listing, status));
  }, []);

  const preferences = useMemo(
    () => Object.entries(store.items).sort((left, right) => right[1].updated_at.localeCompare(left[1].updated_at)),
    [store.items]
  );

  return {
    store,
    preferences,
    is_hydrated,
    set_listing_status,
    get_listing_preference: (listing: ListingCard) => store.items[listing_preference_key(listing)] ?? null
  };
}
