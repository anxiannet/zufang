import assert from "node:assert/strict";
import { assessNtuSuitability } from "../../lib/ntuSuitability";
import { cleanListingText } from "../import/cleanListingText";
import { decideImportStatus } from "../import/decideImportStatus";
import { parseListingByRules } from "../import/ruleParser";

assert.equal(
  assessNtuSuitability({
    title: "超大阳台房；制造业地址（爱德薇花园公寓）（507004）",
    description: "爱德薇花园公寓，超大阳台房；近机场机场；交通便利，环境优美",
    postalCode: "507004"
  }).suitable,
  false
);

assert.equal(
  assessNtuSuitability({
    title: "Pioneer 先驱普通房出租",
    description: "适合 NTU 学生，楼下有直达巴士",
    postalCode: "640975"
  }).suitable,
  true
);

const cleaned = cleanListingText({
  list_title: "近机场普通房出租",
  list_raw_text: "爱德薇花园公寓，超大阳台房；近机场，2月10日入住，邮编507004 电话98612281 $1200"
});
const candidate = parseListingByRules({
  ingestionId: 1,
  source: "shichengbbs.com",
  sourceId: "test",
  sourceUrl: "https://example.com/test",
  title: cleaned.title,
  rawText: cleaned.rawText,
  cleanText: cleaned.cleanText
});
const decision = decideImportStatus(candidate, { valid_image_count: 1 });

assert.equal(decision.import_status, "rejected");
assert.ok(decision.parse_warnings.some((warning) => warning.includes("不适合 NTU 学生")));

console.log("ntuSuitability tests passed");
