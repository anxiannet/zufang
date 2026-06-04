import assert from "node:assert/strict";
import { getHtmlListingExclusionMatch, getListingExclusionMatch } from "../crawler/listingExclusion";

const excludedExamples = [
  "普通房床位出租",
  "Jurong East bedspace available",
  "bed space near MRT",
  "日租房可马上入住",
  "按天租，短租几天都可以",
  "hourly room daily rental"
];

for (const example of excludedExamples) {
  assert.equal(getListingExclusionMatch(example).excluded, true, example);
}

assert.equal(getListingExclusionMatch("裕廊东普通房出租，可煮，长租优先").excluded, false);
assert.equal(getHtmlListingExclusionMatch("<html><body><h1>湖畔普通房</h1><p>床铺出租</p></body></html>").excluded, true);
assert.equal(getHtmlListingExclusionMatch(`
  <html>
    <body>
      <article>
        <h1>裕廊东普通房出租</h1>
        <p>价格 $1100，近地铁，长租优先。</p>
      </article>
      <section>
        <h2>相关房源</h2>
        <a href="/301">床位出租 $350</a>
        <a href="/302">日租房 $80</a>
      </section>
    </body>
  </html>
`).excluded, false);

console.log("listingExclusion tests passed");
