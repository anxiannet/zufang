import assert from "node:assert/strict";
import { cleanPublicListingDescription } from "../../lib/listingDescription";

const cleaned = cleanPublicListingDescription(`
  日期 15分钟前 分类 普通房 标签 房型公寓
  价格 $1,200 联系 98612281 微信 591736662 电话 98612281 98612281
  Jurong West 公寓普通房出租，包水电网，适合 NTU 学生。
  可小煮，近 Pioneer MRT，楼下有巴士。
  本作者共发布了2个广告
  评论
  0 条评论
  还没有评论
  有疑问可以先留言，后来的用户也能看到。
`);

assert.equal(cleaned, "Jurong West 公寓普通房出租，包水电网，适合 NTU 学生。\n可小煮，近 Pioneer MRT，楼下有巴士。");

console.log("publicDescription tests passed");
