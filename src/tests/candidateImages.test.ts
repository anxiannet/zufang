import assert from "node:assert/strict";
import { extract_candidate_images, normalize_candidate_image_url } from "../../lib/candidateImages";

const page_url = "https://www.shichengbbs.com/3030896";

const no_image_detail_html = `
  <article class="node-view-page">
    <main>
      <h1>主人房出租</h1>
      <p>裕华园 MRT 附近主人房出租。</p>
    </main>
    <aside class="node-view-sidebar">
      <h5>相关广告</h5>
      <img src="/img/app.models.Image/5822482/120x90/0.avif" alt="次卧出租">
      <img src="/img/app.models.Image/5757522/120x90/0.avif" alt="其他房源">
    </aside>
  </article>
`;

const placeholder_list_html = `
  <article>
    <h2>主人房出租</h2>
    <img src="/imgdef/image.avif" alt="主人房出租">
  </article>
`;

assert.deepEqual(
  extract_candidate_images({
    detail_html: no_image_detail_html,
    list_html: placeholder_list_html,
    page_url
  }),
  []
);

const detail_with_gallery_html = `
  <article>
    <main>
      <div class="gallery">
        <img data-src="/img/app.models.Image/6000001/1200x900/0.avif" alt="房间">
        <img srcset="/img/app.models.Image/6000002/640x480/0.avif 640w, /img/app.models.Image/6000002/1200x900/0.avif 1200w" alt="浴室">
      </div>
    </main>
    <aside>
      <h5>相关广告</h5>
      <img src="/img/app.models.Image/9999999/120x90/0.avif" alt="其他房源">
    </aside>
  </article>
`;

assert.deepEqual(
  extract_candidate_images({
    detail_html: detail_with_gallery_html,
    list_html: null,
    page_url
  }).map((image) => image.image_url),
  [
    "https://www.shichengbbs.com/img/app.models.Image/6000001/1200x900/0.avif",
    "https://www.shichengbbs.com/img/app.models.Image/6000002/1200x900/0.avif",
    "https://www.shichengbbs.com/img/app.models.Image/6000002/640x480/0.avif"
  ]
);

const list_thumbnail_html = `
  <article>
    <img src="/img/app.models.Image/6000003/120x90/0.avif" alt="主人房出租">
  </article>
`;

assert.deepEqual(
  extract_candidate_images({
    detail_html: detail_with_gallery_html,
    list_html: list_thumbnail_html,
    page_url
  }).map((image) => image.image_url),
  [
    "https://www.shichengbbs.com/images/image/600/6000003.avif",
    "https://www.shichengbbs.com/img/app.models.Image/6000001/1200x900/0.avif",
    "https://www.shichengbbs.com/img/app.models.Image/6000002/1200x900/0.avif",
    "https://www.shichengbbs.com/img/app.models.Image/6000002/640x480/0.avif"
  ]
);

assert.equal(normalize_candidate_image_url("/imgdef/install-ios.webp", page_url), null);
assert.equal(normalize_candidate_image_url("javascript:alert(1)", page_url), null);
assert.equal(
  normalize_candidate_image_url("/images/image/583/5831749.avif?1783652866", page_url),
  "https://www.shichengbbs.com/images/image/583/5831749.avif?1783652866"
);
assert.equal(
  normalize_candidate_image_url("/img/app.models.Image/5835665/120x90/0.avif?v=1784087296&cv=2", page_url),
  "https://www.shichengbbs.com/images/image/583/5835665.avif?1784087296"
);

console.log("candidateImages tests passed");
