import assert from "node:assert/strict";
import { getMissingColumnFromError } from "../db/listingRepository";

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

console.log("listingRepository tests passed");
