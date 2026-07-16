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
  return { candidate, decision: decideImportStatus(candidate, { valid_image_count: 1 }) };
}

const emptyCleaned = cleanListingText({});
assert.equal(emptyCleaned.title, null);
assert.equal(emptyCleaned.rawText, "");
assert.equal(emptyCleaned.cleanText, "");

const sample1 = parse(
  "环境安静采光良好，适合学生长期居住。\n近地铁空调房可煮带家具马上入住限女生组屋\n86936399 $1,000",
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
assert.equal(sample1.decision.import_status, "parsed");
assert.ok(sample1.decision.parse_warnings.includes("缺少邮编，使用 MRT 位置估算"));
assert.ok(sample1.decision.parse_warnings.includes("报地址信息缺失"));
assert.ok(sample1.decision.parse_warnings.includes("屋主是否同住信息缺失"));

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
assert.equal(sample2.decision.import_status, "parsed");

const sample3 = parse("隔间出租 近地铁 可煮 500 包水电");
assert.equal(sample3.candidate.parsed_room_type, "partition_room");
assert.equal(sample3.decision.import_status, "rejected");
assert.ok(sample3.decision.parse_warnings.includes("疑似隔间房，直接拒绝"));

const wholeUnit = parse("裕廊西整套出租 邮编640123 电话81234567 $3200 可报地址 无屋主");
assert.equal(wholeUnit.candidate.parsed_listing_type, "whole_unit");
assert.equal(wholeUnit.candidate.parsed_room_type, null);

const maidBedspace = parse("佣人房床位出租 邮编640123 电话81234567 $500");
assert.equal(maidBedspace.candidate.parsed_listing_type, "bedspace");
assert.equal(maidBedspace.candidate.parsed_room_type, "maid_room");
assert.equal(maidBedspace.decision.import_status, "rejected");

const storageRoom = parse(
  "文礼附近，邮编640123，电话81234567，$500",
  "文礼储藏室"
);
assert.equal(storageRoom.decision.import_status, "rejected");
assert.ok(storageRoom.decision.parse_warnings.includes("拒绝依据：储藏室"));

const wholeUnitWithStorage = parse(
  "整套出租，带独立储藏室，邮编640123，电话81234567，$3200",
  "裕廊西整套出租"
);
assert.notEqual(wholeUnitWithStorage.decision.import_status, "rejected");
assert.ok(!wholeUnitWithStorage.decision.parse_warnings.includes("拒绝依据：储藏室"));

const directRejectCases = [
  { parsed_title: "短" },
  { parsed_rent_amount: null },
  { parsed_phone: null, parsed_wechat: null },
  { parsed_listing_type: "room", parsed_room_type: null },
  { parsed_room_type: "partition_room" },
  { parsed_room_type: "maid_room" },
  { parsed_is_agent: true },
  { parsed_is_sublet: true }
];
for (const overrides of directRejectCases) {
  assert.equal(
    decideImportStatus({ ...sample1.candidate, ...overrides }, { valid_image_count: 1 }).import_status,
    "rejected"
  );
}
assert.equal(
  decideImportStatus(
    { ...sample1.candidate, parsed_listing_type: "bedspace" },
    { valid_image_count: 1 }
  ).import_status,
  "needs_review"
);

const noImageDecision = decideImportStatus(sample2.candidate, { valid_image_count: 0 });
assert.equal(noImageDecision.import_status, "rejected");
assert.ok(noImageDecision.parse_warnings.includes("无有效房源图片，直接拒绝"));

const nonListingGiveaway = parse(
  "裕廊西 邮编640123 电话81234567 $900 普通房",
  "送人：男学生"
);
assert.equal(nonListingGiveaway.decision.import_status, "rejected");
assert.ok(nonListingGiveaway.decision.parse_warnings.includes("自动识别：非房源信息（送人或赠送信息）"));

const rentalRequest = parse(
  "预算 $1000，电话81234567，希望住普通房，邮编640123附近",
  "求租：NTU 附近房间"
);
assert.equal(rentalRequest.decision.import_status, "rejected");
assert.ok(rentalRequest.decision.parse_warnings.includes("自动识别：非房源信息（租客求租信息）"));

const roommateRequest = parse(
  "裕廊西普通房 邮编640123 电话81234567 $900",
  "找室友：NTU 男学生"
);
assert.equal(roommateRequest.decision.import_status, "needs_review");
assert.ok(roommateRequest.decision.parse_warnings.includes("室友招募信息需要人工确认"));

const normalRentalMentioningRoommate = parse(
  "房间采光良好，环境安静，适合长期居住。普通房出租，邮编640123，电话81234567，$900，现有室友为学生",
  "裕廊西普通房出租（找室友）"
);
assert.notEqual(normalRentalMentioningRoommate.decision.import_status, "rejected");
assert.ok(!normalRentalMentioningRoommate.decision.parse_warnings.some((warning) => warning.startsWith("自动识别：非房源信息")));

const furnished = parse("Clementi Woods 普通房出租 邮编129800 电话81234567 $1200 电视 / 洗衣机 / 烘干机 / 微波炉 / 冰箱一应俱全 厨房是公共区域，灶台是明火");
assert.deepEqual(furnished.candidate.parsed_facilities, [
  { facility_name: "tv", availability: "available", note: null },
  { facility_name: "washing_machine", availability: "available", note: null },
  { facility_name: "dryer", availability: "available", note: null },
  { facility_name: "fridge", availability: "available", note: null },
  { facility_name: "microwave", availability: "available", note: null },
  { facility_name: "kitchen", availability: "available", note: "公共区域；灶台为明火" }
]);
assert.equal(furnished.candidate.parsed_cooking_policy, "full");
assert.ok(!furnished.candidate.parsed_description_clean?.includes("电视 / 洗衣机"));
assert.ok(!furnished.candidate.parsed_description_clean?.includes("厨房是公共区域"));

const alphanumericWechat = parse(
  "NTU 云南园排屋主人房 微信 adam202488 地址：107 Yunnan Dr3,Singapore637974 电话82983428 $1760"
);
assert.equal(alphanumericWechat.candidate.parsed_postal_code, "637974");
assert.equal(alphanumericWechat.candidate.parsed_wechat, "adam202488");

const chineseGarden = parse(
  "裕华园MRT附近主人房出租。大牌号600308。环境干净安静，全屋只有6个人，包水电网，空调。可报服务业本屋地址 电话84396494 $1250"
);
assert.equal(chineseGarden.candidate.parsed_postal_code, "600308");
assert.equal(chineseGarden.candidate.parsed_area, "Jurong East");
assert.equal(chineseGarden.candidate.parsed_mrt, "Chinese Garden");
assert.equal(chineseGarden.decision.import_status, "parsed");

const cashewWithoutPostal = parse(
  "Cashew 凯秀 MRT 附近普通房出租 电话92371000 $800 包水电 无屋主"
);
assert.equal(cashewWithoutPostal.candidate.parsed_postal_code, null);
assert.equal(cashewWithoutPostal.candidate.parsed_mrt, "Cashew");
assert.equal(cashewWithoutPostal.decision.import_status, "parsed");

console.log("listingImportParser tests passed");
