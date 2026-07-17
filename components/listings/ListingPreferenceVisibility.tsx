"use client";

import type { ReactNode } from "react";
import type { ListingCard } from "@/lib/types";
import { useListingPreferences } from "@/components/listings/useListingPreferences";

export function ListingPreferenceVisibility({ listing, children }: { listing: ListingCard; children: ReactNode }) {
  const { get_listing_preference, is_hydrated } = useListingPreferences();
  if (is_hydrated && get_listing_preference(listing)?.status === "disliked") return null;
  return children;
}
