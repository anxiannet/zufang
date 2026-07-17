import assert from "node:assert/strict";
import { getDeletedSourceNotice, isSourceGoneHttpStatus } from "../crawler/staleListingMaintenance";
import { is_displayed_candidate_listing } from "../db/listingRepository";

const deletedExamples = [
  "<html><body><div>帖子已经删除，并且已经失效。请不要联系！</div></body></html>",
  "<html><body><main>此贴已经删除了，请勿联系！</main></body></html>",
  "<html><body><p>帖子已经删除, 并且已经失效. 请不要联系!</p></body></html>"
];

for (const html of deletedExamples) {
  assert.ok(getDeletedSourceNotice(html), html);
}

assert.equal(
  getDeletedSourceNotice("<html><body><article>裕廊西普通房出租，请联系屋主看房。</article></body></html>"),
  null
);

assert.equal(isSourceGoneHttpStatus(404), true);
assert.equal(isSourceGoneHttpStatus(410), true);
assert.equal(isSourceGoneHttpStatus(403), false);
assert.equal(isSourceGoneHttpStatus(500), false);

const displayedCandidate = {
  ingestion_listing_id: 1,
  parsed_postal_code: "640123",
  parsed_mrt: null,
  updated_at: "2026-07-16T12:00:00.000Z"
};
const displayedIngestion = {
  id: 1,
  source: "shichengbbs.com",
  source_id: "123",
  listing_url: "https://example.com/123",
  detail_url: "https://example.com/123",
  list_title: "测试房源",
  list_raw_text: "日期 8天前",
  raw_detail_html: null,
  scraped_at: "2026-07-16T12:00:00.000Z"
};
assert.equal(is_displayed_candidate_listing(displayedCandidate, displayedIngestion, new Date("2026-07-16T12:00:00.000Z")), true);
assert.equal(is_displayed_candidate_listing({ ...displayedCandidate, parsed_postal_code: null }, displayedIngestion, new Date("2026-07-16T12:00:00.000Z")), false);
assert.equal(is_displayed_candidate_listing(displayedCandidate, { ...displayedIngestion, list_raw_text: "日期 31天前" }, new Date("2026-07-16T12:00:00.000Z")), false);

console.log("staleListingMaintenance tests passed");
