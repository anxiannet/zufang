import type { ListingCard } from "@/lib/types";

export function getListingPublicId(listing: Pick<ListingCard, "id" | "listing_no" | "candidate_no" | "card_source">) {
  const isCandidate = listing.card_source === "candidate" || listing.id.startsWith("candidate-");

  if (isCandidate && listing.candidate_no) {
    return `C${String(listing.candidate_no).padStart(4, "0")}`;
  }

  if (!isCandidate && listing.listing_no) {
    return String(listing.listing_no).padStart(5, "0");
  }

  return listing.id;
}

export function getListingHref(
  listing: Pick<ListingCard, "id" | "listing_no" | "candidate_no" | "card_source">,
  return_to?: string
) {
  const href = `/rent/${getListingPublicId(listing)}`;
  if (!return_to) return href;
  const params = new URLSearchParams({ return_to });
  return `${href}?${params.toString()}`;
}
