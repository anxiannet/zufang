export type CandidateImportStatus =
  | "pending"
  | "parsed"
  | "needs_review"
  | "approved"
  | "rejected"
  | "imported"
  | "failed"
  | "duplicate";

export type IngestionListing = {
  id: number;
  source: string | null;
  source_id: string | null;
  listing_url: string | null;
  detail_url: string | null;
  list_title: string | null;
  list_price: number | null;
  list_contact: string | null;
  list_raw_html: string | null;
  list_raw_text: string | null;
  raw_detail_html: string | null;
  scraped_at?: string | null;
  created_at?: string | null;
  last_seen_at?: string | null;
};

export type ParsedListingCandidate = {
  parsed_title: string | null;
  parsed_description: string | null;
  parsed_description_clean: string | null;
  parsed_rent_amount: number | null;
  parsed_deposit_amount: number | null;
  parsed_postal_code: string | null;
  parsed_area: string | null;
  parsed_mrt: string | null;
  parsed_listing_type: string | null;
  parsed_room_type: string | null;
  parsed_available_from: string | null;
  parsed_available_note: string | null;
  parsed_min_lease_months: number | null;
  parsed_max_occupants: number | null;
  parsed_registration_allowed: boolean | null;
  parsed_landlord_staying: boolean | null;
  parsed_total_bedrooms: number | null;
  parsed_total_bathrooms: number | null;
  parsed_current_occupants_count: number | null;
  parsed_bathroom_shared_with_count: number | null;
  parsed_gender_preference: string | null;
  parsed_wechat: string | null;
  parsed_phone: string | null;
  parsed_is_owner_direct: boolean | null;
  parsed_is_agent: boolean | null;
  parsed_is_sublet: boolean | null;
  parsed_utilities_policy: string | null;
  parsed_aircon_policy: string | null;
  parsed_cooking_policy: string | null;
  parsed_visitors_policy: string | null;
  parsed_smoking_policy: string | null;
  parsed_pets_policy: string | null;
  parsed_tenant_type_preference: string[];
  parsed_facilities: {
    facility_name: string;
    availability: "available" | "restricted" | "not_available";
    note: string | null;
  }[];
  parse_confidence: number;
  parse_warnings: string[];
};

export type ListingImportCandidate = ParsedListingCandidate & {
  id: string;
  candidate_no: number;
  ingestion_listing_id: number;
  source: string;
  source_id: string | null;
  source_url: string | null;
  parser_version: string;
  import_status: CandidateImportStatus;
  import_error: string | null;
  listing_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
