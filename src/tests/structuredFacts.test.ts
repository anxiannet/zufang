import assert from "node:assert/strict";
import { cleanPublicListingDescription } from "../../lib/listingDescription";
import { extractListingStructuredFacts } from "../../lib/listingStructuredFacts";
import { cleanListingText } from "../import/cleanListingText";
import { parseListingByRules } from "../import/ruleParser";

const text = `
房间：普通房一间(3b2b)
入住时间：2026年7月初(至少一年)
条件: 男生
靠近 Pioneer MRT，适合 NTU 学生。
`;

const facts = extractListingStructuredFacts(text);
assert.equal(facts.room_type, "common_room");
assert.equal(facts.total_bedrooms, 3);
assert.equal(facts.total_bathrooms, 2);
assert.equal(facts.available_from, "2026-07-01");
assert.equal(facts.available_note, "2026年7月初");
assert.equal(facts.min_lease_months, 12);
assert.equal(facts.gender_preference, "male");

assert.equal(cleanPublicListingDescription(text), "靠近 Pioneer MRT，适合 NTU 学生");

const cleaned = cleanListingText({ list_raw_text: `${text}\n电话84392266 $1200 邮编640975` });
const candidate = parseListingByRules({
  ingestionId: 1,
  source: "shichengbbs.com",
  sourceId: "test",
  sourceUrl: "https://example.com/test",
  title: cleaned.title,
  rawText: cleaned.rawText,
  cleanText: cleaned.cleanText
});

assert.equal(candidate.parsed_room_type, "common_room");
assert.equal(candidate.parsed_total_bedrooms, 3);
assert.equal(candidate.parsed_total_bathrooms, 2);
assert.equal(candidate.parsed_available_from, "2026-07-01");
assert.equal(candidate.parsed_available_note, "2026年7月初");
assert.equal(candidate.parsed_min_lease_months, 12);
assert.equal(candidate.parsed_gender_preference, "male");
assert.equal(candidate.parsed_description_clean, "靠近 Pioneer MRT，适合 NTU 学生");

console.log("structuredFacts tests passed");
