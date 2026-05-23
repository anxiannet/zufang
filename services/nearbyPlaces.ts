export type NearbyPlace = {
  place_type: "mrt" | "bus_stop" | "food_court" | "supermarket" | "mall" | "school";
  name: string;
  distance_meters: number;
  walking_minutes: number;
  source: "mock";
};

export async function getNearbyPlaces(latitude: number, longitude: number): Promise<NearbyPlace[]> {
  const seed = Math.abs(Math.round((latitude + longitude) * 100)) % 5;
  const distance = (base: number) => base + seed * 35;

  return [
    { place_type: "mrt", name: "附近 MRT 站", distance_meters: distance(520), walking_minutes: 7 + seed, source: "mock" },
    { place_type: "bus_stop", name: "巴士站", distance_meters: distance(180), walking_minutes: 3 + seed, source: "mock" },
    { place_type: "food_court", name: "熟食中心", distance_meters: distance(420), walking_minutes: 6 + seed, source: "mock" },
    { place_type: "supermarket", name: "FairPrice / Sheng Siong", distance_meters: distance(650), walking_minutes: 9 + seed, source: "mock" },
    { place_type: "mall", name: "邻里商场", distance_meters: distance(900), walking_minutes: 12 + seed, source: "mock" }
  ];
}
