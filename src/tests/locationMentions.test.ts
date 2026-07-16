import assert from "node:assert/strict";
import { extractLocationMentions } from "../../lib/listingLocationMentions";

const input = `
📍 位置
步行 15 分钟就能到 NUS Central Library，不需要交通费
步行10 分钟就能到学校后街小吃街和 Kent Ridge Bus Terminal
步行10分钟以内西海岸公园、麦当劳、West Coast plaza、巴刹等
小区门口就是公交站牌，143/51/30 等，30 分钟直达 Vivo City，去圣淘沙玩超方便
`;

const result = extractLocationMentions(input);

assert.deepEqual(
  result.places.map((place) => [place.place_type, place.name, place.display_note]),
  [
    ["school", "NUS Central Library", "步行约 15 分钟"],
    ["bus_terminal", "Kent Ridge Bus Terminal", "步行约 10 分钟"],
    ["park", "West Coast Park", "步行约 10 分钟内"],
    ["mall", "West Coast Plaza", "步行约 10 分钟内"],
    ["bus_stop", "小区门口公交站", "小区门口"],
    ["mall", "VivoCity", "公交约 30 分钟"]
  ]
);

assert.equal(
  result.description_clean,
  "不需要交通费\n步行10 分钟就能到学校后街小吃街\n麦当劳、巴刹等\n去圣淘沙玩超方便"
);

console.log("locationMentions tests passed");
