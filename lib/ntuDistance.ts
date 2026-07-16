import type { ListingGeocoding, NtuCommuteCache } from "@/lib/types";

export const NTU_CENTER = {
  latitude: 1.3483,
  longitude: 103.6831,
  name: "Nanyang Technological University"
} as const;

export function haversineDistanceKm(
  start_latitude: number,
  start_longitude: number,
  end_latitude: number,
  end_longitude: number
): number {
  const earth_radius_km = 6371.0088;
  const latitude_delta = degrees_to_radians(end_latitude - start_latitude);
  const longitude_delta = degrees_to_radians(end_longitude - start_longitude);
  const start_latitude_radians = degrees_to_radians(start_latitude);
  const end_latitude_radians = degrees_to_radians(end_latitude);
  const a = Math.sin(latitude_delta / 2) ** 2 +
    Math.cos(start_latitude_radians) *
    Math.cos(end_latitude_radians) *
    Math.sin(longitude_delta / 2) ** 2;
  return earth_radius_km * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function build_ntu_commute_fallback(
  postal_code: string | null,
  geocoding: ListingGeocoding | null,
  commute: NtuCommuteCache | null
): NtuCommuteCache | null {
  if (commute?.ntu_straight_distance_km != null) return commute;
  if (!postal_code || geocoding?.latitude == null || geocoding.longitude == null) return commute;

  const distance_km = Math.round(haversineDistanceKm(
    geocoding.latitude,
    geocoding.longitude,
    NTU_CENTER.latitude,
    NTU_CENTER.longitude
  ) * 1000) / 1000;

  return {
    postal_code,
    ntu_bus_minutes: commute?.ntu_bus_minutes ?? null,
    ntu_drive_minutes: commute?.ntu_drive_minutes ?? null,
    ntu_straight_distance_km: distance_km,
    status: commute?.status ?? (distance_km > 12 ? "skipped_far" : "pending"),
    skip_reason: commute?.skip_reason ?? (distance_km > 12 ? "distance_over_12km" : null),
    computed_at: commute?.computed_at ?? null
  };
}

function degrees_to_radians(degrees: number): number {
  return degrees * Math.PI / 180;
}
