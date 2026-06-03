export interface ListListing {
  source: string;
  sourceId: string;
  detailUrl: string;
  listTitle: string | null;
  listPostedText: string | null;
  listPrice: number | null;
  listContact: string | null;
  listRawHtml: string;
  listRawText: string;
  listPhone: string | null;
  listWechat: string | null;
  listPostedAt: Date | null;
  listTags: string[];
  listMrtArea: string | null;
  isTop: boolean;
}

export interface DetailListing {
  source: string;
  sourceId: string;
  detailUrl: string;
  title: string | null;
  postedText: string | null;
  postedAt: Date | null;
  category: string | null;
  mrtArea: string | null;
  price: number | null;
  contactText: string | null;
  phone: string | null;
  wechat: string | null;
  whatsappUrl: string | null;
  tags: string[];
  bodyText: string | null;
  ceaRegNo: string | null;
  rawDetailHtml: string;
  rawDetailText: string;
  scrapedAt: Date;
}

export interface Listing extends DetailListing {
  title: string;
  category: string;
  detailUrl: string;
  listingUrl: string;
  listTitle: string | null;
  listPostedText: string | null;
  listPrice: number | null;
  listContact: string | null;
  listRawHtml: string;
  listRawText: string;
  latestSourceSnapshot: Record<string, unknown>;
  isTop: boolean;
}

export interface CrawlStats {
  pagesVisited: number;
  listingsParsed: number;
  detailsFetched: number;
  listingsSaved: number;
  listingsSkipped: number;
  listingsChanged: number;
  listingsInserted: number;
  listingsUpdated: number;
  errors: number;
  stopReason: string | null;
}

export type CrawlMode = "manual" | "vercel-cron";

export type CrawlSummary = {
  inserted: number;
  targetInserted: number;
  updated: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
  detailsFetched: number;
  stoppedReason?: string;
};

export interface IngestionListingRow {
  id: string | number;
  source: string;
  source_id: string;
  title: string | null;
  category: string | null;
  listing_url: string | null;
  detail_url: string | null;
  raw_detail_html: string | null;
  raw_detail_text: string | null;
  raw_html: string | null;
  raw_text: string | null;
  body_text: string | null;
  posted_text: string | null;
  posted_at: string | null;
  contact_text: string | null;
  whatsapp_url: string | null;
  cea_reg_no: string | null;
  mrt_area: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  tags: string[] | null;
  is_top: boolean | null;
  removed_from_source?: boolean | null;
  scraped_at: string | null;
  updated_at?: string | null;
}

export interface ListingIndexRow {
  source: string;
  source_id: string;
  ingestion_listing_id: string | number;
  title: string;
  listing_url: string | null;
  detail_url: string | null;
  category: string | null;
  price: number | null;
  phone: string | null;
  wechat: string | null;
  whatsapp_url: string | null;
  contact_text: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  mrt_area: string | null;
  tags: string[];
  body_text: string | null;
  search_text: string;
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
  raw_snapshot: Record<string, unknown>;
  index_version: string;
  indexed_at: string;
  status: "active" | "removed" | "invalid";
}
