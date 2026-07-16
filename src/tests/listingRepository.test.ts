import assert from "node:assert/strict";
import { detailContainsCurrentListImages, getMissingColumnFromError } from "../db/listingRepository";

assert.equal(
  getMissingColumnFromError(
    new Error(
      `Supabase request failed: 400 Bad Request {"code":"PGRST204","details":null,"hint":null,"message":"Could not find the 'list_phone' column of 'ingestion_listings' in the schema cache"}`
    )
  ),
  "list_phone"
);

assert.equal(getMissingColumnFromError(new Error("Supabase request failed: 500 Internal Server Error")), null);
assert.equal(getMissingColumnFromError("plain string error"), null);

const current_list_html = `<img src="/img/app.models.Image/5833163/120x90/0.avif?v=1">`;
const current_detail_html = `<img src="/images/image/583/5833163.avif?1">`;
const stale_detail_html = `<img src="/images/image/583/5831749.avif?1">`;

assert.equal(detailContainsCurrentListImages(current_list_html, current_detail_html), true);
assert.equal(detailContainsCurrentListImages(current_list_html, stale_detail_html), false);
assert.equal(detailContainsCurrentListImages(`<img src="/imgdef/image.avif">`, stale_detail_html), true);

console.log("listingRepository tests passed");
