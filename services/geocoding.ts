export type GeocodeResult = {
  postalCode: string;
  block: string;
  streetName: string;
  latitude: number;
  longitude: number;
  nearestMrt: string;
};

const mrtByPrefix: Record<string, Pick<GeocodeResult, "streetName" | "latitude" | "longitude" | "nearestMrt">> = {
  "12": { streetName: "Queenstown / Commonwealth", latitude: 1.2942, longitude: 103.7861, nearestMrt: "Commonwealth" },
  "23": { streetName: "Bukit Timah / Beauty World", latitude: 1.3416, longitude: 103.7758, nearestMrt: "Beauty World" },
  "31": { streetName: "Toa Payoh", latitude: 1.3326, longitude: 103.8474, nearestMrt: "Toa Payoh" },
  "46": { streetName: "Bedok / East Coast", latitude: 1.3236, longitude: 103.9273, nearestMrt: "Bedok" },
  "52": { streetName: "Tampines", latitude: 1.3525, longitude: 103.9447, nearestMrt: "Tampines" },
  "56": { streetName: "Ang Mo Kio", latitude: 1.3691, longitude: 103.8454, nearestMrt: "Ang Mo Kio" },
  "64": { streetName: "Jurong West", latitude: 1.3396, longitude: 103.7073, nearestMrt: "Boon Lay" },
  "73": { streetName: "Yishun", latitude: 1.4295, longitude: 103.8357, nearestMrt: "Yishun" },
  "82": { streetName: "Punggol", latitude: 1.4052, longitude: 103.9023, nearestMrt: "Punggol"
  }
};

export async function geocodePostalCode(postalCode: string): Promise<GeocodeResult> {
  const clean = postalCode.trim();
  const match = mrtByPrefix[clean.slice(0, 2)] ?? {
    streetName: "Central Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    nearestMrt: "Dhoby Ghaut"
  };

  return {
    postalCode: clean,
    block: clean.slice(-3),
    ...match
  };
}
