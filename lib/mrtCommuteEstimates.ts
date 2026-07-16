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
    canonical_name: "Ang Mo Kio",
    aliases: ["ang mo kio", "amk", "宏茂桥"],
    latitude: 1.36993284962264,
    longitude: 103.849558091776,
    ntu_public_transport_minutes: 79,
    ntu_drive_minutes: 37
  },
  {
    canonical_name: "Boon Lay",
    aliases: ["boon lay", "文礼"],
    latitude: 1.33860405469845,
    longitude: 103.706064622772,
    ntu_public_transport_minutes: 20,
    ntu_drive_minutes: 11
  },
  {
    canonical_name: "Pioneer",
    aliases: ["pioneer", "先驱"],
    latitude: 1.33758701106708,
    longitude: 103.697321608474,
    ntu_public_transport_minutes: 16,
    ntu_drive_minutes: 9
  },
  {
    canonical_name: "Chinese Garden",
    aliases: ["chinese garden", "裕华园"],
    latitude: 1.3425,
    longitude: 103.7325,
    ntu_public_transport_minutes: 30,
    ntu_drive_minutes: 15
  },
  {
    canonical_name: "Clementi",
    aliases: ["clementi", "金文泰"],
    latitude: 1.31511625277378,
    longitude: 103.765191452888,
    ntu_public_transport_minutes: 35,
    ntu_drive_minutes: 22
  },
  {
    canonical_name: "Cashew",
    aliases: ["cashew", "凯秀"],
    latitude: 1.36984601365741,
    longitude: 103.764315051619,
    ntu_public_transport_minutes: 67,
    ntu_drive_minutes: 21
  },
  {
    canonical_name: "Khatib",
    aliases: ["khatib", "卡迪"],
    latitude: 1.41738337009565,
    longitude: 103.832979908243,
    ntu_public_transport_minutes: 72,
    ntu_drive_minutes: 37
  },
  {
    canonical_name: "Yishun",
    aliases: ["yishun", "义顺"],
    latitude: 1.42944308477331,
    longitude: 103.835005047246,
    ntu_public_transport_minutes: 69,
    ntu_drive_minutes: 39
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
