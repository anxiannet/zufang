import { haversineDistanceKm, NTU_CENTER } from "@/lib/ntuDistance";
import type { NtuCommuteCache } from "@/lib/types";

type MrtEstimate = {
  canonical_name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  ntu_public_transport_minutes: number;
  ntu_drive_minutes: number;
};

const mrt_estimates: MrtEstimate[] = [
  {
    canonical_name: "Cashew",
    aliases: ["cashew", "凯秀"],
    latitude: 1.368975,
    longitude: 103.764803,
    ntu_public_transport_minutes: 70,
    ntu_drive_minutes: 14
  }
];

export function build_mrt_commute_estimate(mrt: string | null | undefined): NtuCommuteCache | null {
  const normalized_mrt = mrt?.trim().toLowerCase();
  if (!normalized_mrt) return null;
  const station = mrt_estimates.find((item) =>
    item.aliases.some((alias) => normalized_mrt.includes(alias.toLowerCase()))
  );
  if (!station) return null;

  const distance_km = Math.round(haversineDistanceKm(
    station.latitude,
    station.longitude,
    NTU_CENTER.latitude,
    NTU_CENTER.longitude
  ) * 1000) / 1000;

  return {
    postal_code: `mrt:${station.canonical_name.toLowerCase()}`,
    ntu_bus_minutes: station.ntu_public_transport_minutes,
    ntu_drive_minutes: station.ntu_drive_minutes,
    ntu_straight_distance_km: distance_km,
    status: "success",
    skip_reason: "estimated_from_mrt",
    computed_at: null,
    is_estimated: true,
    estimate_basis: `${station.canonical_name} MRT`
  };
}
