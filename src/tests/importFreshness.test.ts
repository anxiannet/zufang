import assert from "node:assert/strict";
import { should_refresh_candidate } from "../import/repository";

assert.equal(should_refresh_candidate(null, "2026-07-16T00:00:00Z"), true);

assert.equal(
  should_refresh_candidate(
    { import_status: "needs_review", updated_at: "2026-07-10T00:00:00Z" },
    "2026-07-16T00:00:00Z"
  ),
  true
);

assert.equal(
  should_refresh_candidate(
    { import_status: "needs_review", updated_at: "2026-07-16T00:00:00Z" },
    "2026-07-10T00:00:00Z"
  ),
  false
);

assert.equal(
  should_refresh_candidate(
    { import_status: "rejected", updated_at: "2026-07-10T00:00:00Z" },
    "2026-07-16T00:00:00Z"
  ),
  false
);

console.log("import freshness tests passed");
