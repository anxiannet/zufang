import assert from "node:assert/strict";
import { parseSemanticRentalFields } from "../parser/semanticRentalParser";

const baseInput = {
  category: "单间租房",
  mrtArea: "Boon Lay, 文礼",
  price: 1000,
  phone: null,
  wechat: null,
  tags: ["近地铁", "包水电", "空调房", "可煮", "可报地址"],
  detailUrl: "https://www.zufang.sg/123456"
};

const commonRoom = parseSemanticRentalFields({
  ...baseInput,
  title: "靠近文礼地铁站靠近ntu普通房出租",
  bodyText: "靠近EW27文礼地铁站靠近台大，Blk262普通房间出租，房间宽私都干净通风包水电网络空调，不可煮，只租一个人，整套房住人少，特别适合学生",
  rawDetailText: "靠近文礼地铁站靠近ntu普通房出租\n靠近EW27文礼地铁站靠近台大，Blk262普通房间出租，房间宽私都干净通风包水电网络空调，不可煮，只租一个人，整套房住人少，特别适合学生"
});

assert.equal(commonRoom.roomType, "普通房");
assert.equal(commonRoom.normalizedRoomType, "common_room");
assert.equal(commonRoom.cookingAllowed, false);

const wholeUnit = parseSemanticRentalFields({
  ...baseInput,
  title: "裕廊东整套出租",
  bodyText: "整套房出租，两房一厅，适合家庭入住，可煮。",
  rawDetailText: "裕廊东整套出租\n整套房出租，两房一厅，适合家庭入住，可煮。"
});

assert.equal(wholeUnit.roomType, null);
assert.equal(wholeUnit.normalizedRoomType, "unknown");

const singleRoom = parseSemanticRentalFields({
  ...baseInput,
  title: "近地铁储物间出租",
  bodyText: "储物间出租，适合一个人，不能煮。",
  rawDetailText: "近地铁储物间出租\n储物间出租，适合一个人，不能煮。"
});

assert.equal(singleRoom.roomType, "储物间");
assert.equal(singleRoom.normalizedRoomType, "single_room");

console.log("semanticRentalParser tests passed");
