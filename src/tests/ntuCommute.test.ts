import assert from "node:assert/strict";
import {
  classifyNtuDistance,
  collectEligiblePostalCodes,
  haversineDistanceKm,
  NTU_CENTER
} from "../services/ntuCommute";
import { build_ntu_commute_fallback } from "../../lib/ntuDistance";
import { build_mrt_commute_estimate } from "../../lib/mrtCommuteEstimates";

const same_point_distance = haversineDistanceKm(
  NTU_CENTER.latitude,
  NTU_CENTER.longitude,
  NTU_CENTER.latitude,
  NTU_CENTER.longitude
);
assert.equal(same_point_distance, 0);

const downtown_distance = haversineDistanceKm(
  1.2834,
  103.8515,
  NTU_CENTER.latitude,
  NTU_CENTER.longitude
);
assert.ok(downtown_distance > 12);

assert.equal(classifyNtuDistance(8), "high_priority");
assert.equal(classifyNtuDistance(8.001), "low_priority");
assert.equal(classifyNtuDistance(12), "low_priority");
assert.equal(classifyNtuDistance(12.001), "skipped_far");

assert.deepEqual(
  collectEligiblePostalCodes(
    [{ postal_code: "639798" }, { postal_code: "600278" }],
    [
      { parsed_postal_code: "600278" },
      { parsed_postal_code: "640922" },
      { parsed_postal_code: "invalid" },
      { parsed_postal_code: null }
    ]
  ),
  ["639798", "600278", "640922"]
);

const fallback_commute = build_ntu_commute_fallback(
  "120512",
  {
    block: "512",
    road_name: "WEST COAST DRIVE",
    building: null,
    property_type: null,
    latitude: 1.30995900089387,
    longitude: 103.760210268491
  },
  null
);
assert.equal(fallback_commute?.status, "pending");
assert.equal(fallback_commute?.ntu_straight_distance_km, 9.574);
assert.equal(fallback_commute?.ntu_bus_minutes, null);

const cashew_estimate = build_mrt_commute_estimate("Cashew, 凯秀");
assert.equal(cashew_estimate?.is_estimated, true);
assert.equal(cashew_estimate?.ntu_straight_distance_km, 9.369);
assert.equal(cashew_estimate?.ntu_bus_minutes, 70);
assert.equal(cashew_estimate?.ntu_drive_minutes, 14);

console.log("ntuCommute tests passed");
