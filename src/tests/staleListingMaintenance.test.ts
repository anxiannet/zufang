import assert from "node:assert/strict";
import { getDeletedSourceNotice, isSourceGoneHttpStatus } from "../crawler/staleListingMaintenance";

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

console.log("staleListingMaintenance tests passed");
