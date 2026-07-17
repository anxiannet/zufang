import assert from "node:assert/strict";
import { parse_candidate_source_posted_at, parse_source_posted_at } from "../../lib/listingSourceDates";
import {
  get_listing_visibility_cutoff,
  is_listing_date_visible,
  LISTING_VISIBILITY_WINDOW_DAYS
} from "../../lib/listingVisibility";

assert.equal(LISTING_VISIBILITY_WINDOW_DAYS, 30);
assert.equal(
  get_listing_visibility_cutoff(new Date("2026-07-16T12:00:00.000Z")),
  "2026-06-16T12:00:00.000Z"
);
assert.equal(
  parse_source_posted_at("普通房 8天前 $1,200", "2026-07-13T19:19:12.101Z"),
  "2026-07-05T19:19:12.101Z"
);
assert.equal(
  parse_source_posted_at("昨天发布", "2026-07-13T19:19:12.101Z"),
  "2026-07-12T19:19:12.101Z"
);
assert.equal(
  parse_source_posted_at("置顶 日期 37天前 分类 主人房", "2026-07-13T19:19:38.257Z"),
  "2026-06-06T19:19:38.257Z"
);
assert.equal(
  parse_source_posted_at("详情 日期 35天前 列表 10天前", "2026-07-10T19:27:11.502Z"),
  "2026-06-05T19:27:11.502Z"
);
assert.equal(
  parse_candidate_source_posted_at(
    "列表 日期 10天前",
    "<html><body><main>详情 日期 35天前</main></body></html>",
    "2026-07-10T19:27:11.502Z"
  ),
  "2026-06-05T19:27:11.502Z"
);
assert.equal(is_listing_date_visible("2026-06-16T12:00:00.000Z", new Date("2026-07-16T12:00:00.000Z")), true);
assert.equal(is_listing_date_visible("2026-06-16T11:59:59.999Z", new Date("2026-07-16T12:00:00.000Z")), false);

console.log("listingVisibility tests passed");
