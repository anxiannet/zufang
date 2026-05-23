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

export type ListingCard = {
  id: string;
  title: string;
  rent_amount: number;
  currency: string;
  room_type: string;
  postal_code: string;
  street_name: string | null;
  nearest_mrt: string | null;
  available_from: string;
  min_lease_months: number;
  cooking_allowed: boolean;
  registration_allowed: boolean;
  landlord_staying: boolean;
  bathroom_shared_with_count: number | null;
  current_occupants_count: number | null;
  listing_images?: { image_url: string; sort_order: number; caption: string | null }[];
};

export type ListingDetail = ListingCard & {
  owner_id: string;
  status: ListingStatus;
  listing_type: string;
  property_type: string;
  deposit_amount: number | null;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  max_occupants: number;
  gender_preference: string;
  visitors_allowed: boolean;
  smoking_allowed: boolean;
  pets_allowed: boolean;
  total_bedrooms: number | null;
  total_bathrooms: number | null;
  description: string | null;
  house_rules: string | null;
  listing_facilities?: { facility_name: string; availability: FacilityAvailability; note: string | null }[];
  nearby_places_cache?: { place_type: string; name: string; distance_meters: number; walking_minutes: number }[];
  users_profile?: { display_name: string; whatsapp: string | null; wechat: string | null; phone: string | null } | null;
};
