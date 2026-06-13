import assert from "node:assert/strict";
import { classifyNtuDistance, haversineDistanceKm, NTU_CENTER } from "../services/ntuCommute";

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

console.log("ntuCommute tests passed");
