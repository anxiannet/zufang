import assert from "node:assert/strict";
import { cleanListingText } from "../import/cleanListingText";
import { decideImportStatus } from "../import/decideImportStatus";
import { parseListingByRules } from "../import/ruleParser";

function parse(text: string, title?: string) {
  const cleaned = cleanListingText({ list_title: title, list_raw_text: text });
  const candidate = parseListingByRules({
    ingestionId: 1,
    source: "shichengbbs.com",
    sourceId: "test",
    sourceUrl: "https://example.com/test",
    title: cleaned.title,
    rawText: cleaned.rawText,
    cleanText: cleaned.cleanText
  });
  return { candidate, decision: decideImportStatus(candidate) };
}

const emptyCleaned = cleanListingText({});
assert.equal(emptyCleaned.title, null);
assert.equal(emptyCleaned.rawText, "");
assert.equal(emptyCleaned.cleanText, "");

const sample1 = parse(
  "房间干净，靠近AMK地铁 近地铁空调房可煮无中介费带家具马上入住限女生组屋 86936399 $1,000",
  "房间干净，靠近AMK地铁"
);
assert.equal(sample1.candidate.parsed_title, "房间干净，靠近AMK地铁");
assert.equal(sample1.candidate.parsed_rent_amount, 1000);
assert.equal(sample1.candidate.parsed_phone, "86936399");
assert.equal(sample1.candidate.parsed_area, "Ang Mo Kio");
assert.equal(sample1.candidate.parsed_mrt, "Ang Mo Kio");
assert.equal(sample1.candidate.parsed_aircon_policy, "included");
assert.equal(sample1.candidate.parsed_cooking_policy, "full");
assert.equal(sample1.candidate.parsed_gender_preference, "female");
assert.equal(sample1.candidate.parsed_available_note, "马上入住");
assert.equal(sample1.candidate.parsed_room_type, "common_room");
assert.equal(sample1.candidate.parsed_postal_code, null);
assert.equal(sample1.decision.import_status, "needs_review");

const sample2 = parse(
  "Pioneer 先驱地铁站 Jurong West 主人房出租 $1300 押金$1,300 包水电 有空调 可报地址 blk975 邮编640975 电话84392266"
);
assert.equal(sample2.candidate.parsed_rent_amount, 1300);
assert.equal(sample2.candidate.parsed_deposit_amount, 1300);
assert.equal(sample2.candidate.parsed_postal_code, "640975");
assert.equal(sample2.candidate.parsed_area, "Jurong West");
assert.equal(sample2.candidate.parsed_mrt, "Pioneer");
assert.equal(sample2.candidate.parsed_room_type, "master_room");
assert.equal(sample2.candidate.parsed_utilities_policy, "included");
assert.equal(sample2.candidate.parsed_aircon_policy, "included");
assert.equal(sample2.candidate.parsed_registration_allowed, true);
assert.equal(sample2.candidate.parsed_phone, "84392266");

const sample3 = parse("隔间出租 近地铁 可煮 500 包水电");
assert.equal(sample3.candidate.parsed_room_type, "partition_room");
assert.equal(sample3.decision.import_status, "needs_review");
assert.ok(sample3.decision.parse_warnings.includes("疑似隔间房，需要人工审核"));

const wholeUnit = parse("裕廊西整套出租 邮编640123 电话81234567 $3200 可报地址 无屋主");
assert.equal(wholeUnit.candidate.parsed_listing_type, "whole_unit");
assert.equal(wholeUnit.candidate.parsed_room_type, null);

const maidBedspace = parse("佣人房床位出租 邮编640123 电话81234567 $500");
assert.equal(maidBedspace.candidate.parsed_listing_type, "bedspace");
assert.equal(maidBedspace.candidate.parsed_room_type, "maid_room");
assert.equal(maidBedspace.decision.import_status, "needs_review");

console.log("listingImportParser tests passed");
