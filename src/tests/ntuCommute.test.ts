import assert from "node:assert/strict";
import {
  classifyNtuDistance,
  collectEligiblePostalCodes,
  haversineDistanceKm,
  NTU_CENTER
} from "../services/ntuCommute";
import { build_ntu_commute_fallback } from "../../lib/ntuDistance";
import { build_mrt_commute_estimate } from "../../lib/mrtCommuteEstimates";
import { shouldGeocode } from "../services/postalGeocoding";

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

assert.equal(shouldGeocode(undefined), true);
assert.equal(shouldGeocode({ postal_code: "640975", status: "pending", updated_at: null }), true);
assert.equal(shouldGeocode({ postal_code: "640975", status: "success", updated_at: null }), false);
assert.equal(shouldGeocode({ postal_code: "640975", status: "not_found", updated_at: null }), false);
assert.equal(shouldGeocode({
  postal_code: "640975",
  status: "failed",
  updated_at: "2026-07-14T00:00:00.000Z"
}, Date.parse("2026-07-16T00:00:00.000Z")), true);

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
assert.ok((cashew_estimate?.ntu_straight_distance_km ?? 0) > 9);
assert.equal(cashew_estimate?.ntu_bus_minutes, 67);
assert.equal(cashew_estimate?.ntu_drive_minutes, 21);

const boon_lay_estimate = build_mrt_commute_estimate("Boon Lay 文礼");
assert.equal(boon_lay_estimate?.is_estimated, true);
assert.equal(boon_lay_estimate?.ntu_bus_minutes, 20);
assert.equal(boon_lay_estimate?.ntu_drive_minutes, 11);
assert.ok((boon_lay_estimate?.ntu_straight_distance_km ?? 0) > 0);

const pioneer_estimate = build_mrt_commute_estimate("Pioneer 先驱");
assert.equal(pioneer_estimate?.is_estimated, true);
assert.equal(pioneer_estimate?.ntu_bus_minutes, 16);
assert.equal(pioneer_estimate?.ntu_drive_minutes, 9);
assert.ok((pioneer_estimate?.ntu_straight_distance_km ?? 0) > 0);

const chinese_garden_estimate = build_mrt_commute_estimate("裕华园 MRT");
assert.equal(chinese_garden_estimate?.is_estimated, true);
assert.equal(chinese_garden_estimate?.estimate_basis, "Chinese Garden MRT");
assert.equal(chinese_garden_estimate?.ntu_bus_minutes, 30);
assert.equal(chinese_garden_estimate?.ntu_drive_minutes, 15);
assert.ok((chinese_garden_estimate?.ntu_straight_distance_km ?? 0) > 0);

console.log("ntuCommute tests passed");
