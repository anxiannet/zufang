export const facilities = [
  "wifi",
  "aircon",
  "washing_machine",
  "dryer",
  "fridge",
  "microwave",
  "wardrobe",
  "desk",
  "chair",
  "bed",
  "sofa",
  "kitchen",
  "private_bathroom",
  "shared_bathroom"
] as const;

export const facilityLabels: Record<(typeof facilities)[number], string> = {
  wifi: "WiFi",
  aircon: "空调",
  washing_machine: "洗衣机",
  dryer: "烘干机",
  fridge: "冰箱",
  microwave: "微波炉",
  wardrobe: "衣柜",
  desk: "书桌",
  chair: "椅子",
  bed: "床",
  sofa: "沙发",
  kitchen: "厨房",
  private_bathroom: "独立浴室",
  shared_bathroom: "共用浴室"
};

export type UserRole = "tenant" | "landlord" | "agent" | "admin";
export type ListingStatus = "draft" | "pending_review" | "published" | "rejected" | "rented";
export type FacilityAvailability = "available" | "not_available" | "restricted";
export type ListingSource = "owner_submit" | "wechat_group" | "zufang" | "xiaohongshu" | "manual";
export type ContactVisibility = "public" | "login_only" | "group_only" | "private";
export type VerificationStatus = "unverified" | "owner_verified" | "agent_verified" | "suspicious" | "rejected";
export type UtilitiesPolicy = "included" | "shared" | "excluded" | "capped";
export type AirconPolicy = "included" | "extra_charge" | "limited_hours" | "not_available";
export type CookingPolicy = "full" | "light" | "no";
export type VisitorsPolicy = "allowed" | "limited" | "not_allowed";
export type SmokingPolicy = "allowed" | "not_allowed";
export type PetsPolicy = "allowed" | "not_allowed";

export type ListingGeocoding = {
  block: string | null;
  road_name: string | null;
  building: string | null;
  property_type: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type NtuCommuteCache = {
  postal_code: string;
  ntu_bus_minutes: number | null;
  ntu_drive_minutes: number | null;
  ntu_straight_distance_km: number | null;
  status: "pending" | "processing" | "success" | "failed" | "skipped_far";
  skip_reason: string | null;
  computed_at: string | null;
};

export type ListingCard = {
  id: string;
  listing_no: number | null;
  candidate_no?: number | null;
  title: string;
  rent_amount: number;
  room_type: string | null;
  postal_code: string | null;
  available_from: string | null;
  available_note: string | null;
  min_lease_months: number | null;
  cooking_policy: CookingPolicy | null;
  registration_allowed: boolean | null;
  landlord_staying: boolean | null;
  bathroom_shared_with_count: number | null;
  current_occupants_count: number | null;
  description: string | null;
  description_clean: string | null;
  updated_at: string;
  geocoding: ListingGeocoding | null;
  ntu_commute: NtuCommuteCache | null;
  listing_images?: { image_url: string; sort_order: number; caption: string | null }[];
  card_source?: "official" | "candidate";
  source_url?: string | null;
};

export type ListingDetail = ListingCard & {
  owner_id: string | null;
  status: ListingStatus | null;
  listing_type: string | null;
  deposit_amount: number | null;
  max_occupants: number | null;
  gender_preference: string | null;
  source: ListingSource | string | null;
  contact_visibility: ContactVisibility | null;
  wechat: string | null;
  phone: string | null;
  is_owner_direct: boolean | null;
  is_agent: boolean | null;
  is_sublet: boolean | null;
  verification_status: VerificationStatus | null;
  utilities_policy: UtilitiesPolicy | null;
  aircon_policy: AirconPolicy | null;
  visitors_policy: VisitorsPolicy | null;
  smoking_policy: SmokingPolicy | null;
  pets_policy: PetsPolicy | null;
  tenant_type_preference: string[] | null;
  total_bedrooms: number | null;
  total_bathrooms: number | null;
  listing_facilities?: { facility_name: string; availability: FacilityAvailability; note: string | null }[];
  nearby_places_cache?: { place_type: string; name: string; distance_meters: number; walking_minutes: number }[];
  detail_source?: "official" | "candidate";
};
