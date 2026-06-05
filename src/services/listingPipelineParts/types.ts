import { ListingIndexRow } from "../../models/listing";

export type ProcessNewListingsOptions = {
  limit?: number;
  source?: string;
  onlyActive?: boolean;
};

export type ProcessNewListingsSummary = {
  found: number;
  cleaned: number;
  indexed: number;
  errors: number;
};

export type ListingCleanInsertRow = {
  ingestion_listing_id: string;
  source: string;
  source_id: string;
  title: string;
  listing_url: string | null;
  detail_url: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  mrt_area: string | null;
  tags: string[];
  clean_text: string | null;
  raw_detail_text: string | null;
  room_type: string | null;
  normalized_room_type: string;
  available_from: string | null;
  cooking_allowed: boolean | null;
  can_register_address: boolean | null;
  landlord_stay: boolean | null;
  bathroom_type: string | null;
  shared_bathroom_count: number | null;
  current_tenant_count: number | null;
  gender_preference: string | null;
  amenities: string[];
  address_text: string | null;
  postal_code: string | null;
  image_urls: string[];
  fingerprint: string;
  clean_version: string;
  status: ListingIndexRow["status"];
};

export type ListingCleanRow = ListingCleanInsertRow & { id: string };
