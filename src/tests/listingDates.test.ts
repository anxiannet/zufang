import assert from "node:assert/strict";
import { parseListingAvailability } from "../../lib/listingDates";
import { cleanPublicListingDescription } from "../../lib/listingDescription";

const referenceDate = new Date("2026-06-17T00:00:00+08:00");

assert.deepEqual(
  parseListingAvailability("爱德薇花园公寓，2月10日入住", referenceDate),
  { date: "2027-02-10", note: null }
);

assert.deepEqual(
  parseListingAvailability("2026年8月1日可入住", referenceDate),
  { date: "2026-08-01", note: null }
);

assert.deepEqual(
  parseListingAvailability("马上入住", referenceDate),
  { date: null, note: "马上入住" }
);

assert.equal(
  cleanPublicListingDescription("交通便利，环境优美，2月10日入住；近机场。"),
  "交通便利，环境优美；近机场"
);

console.log("listingDates tests passed");
