import assert from "node:assert/strict";
import dayjs from "dayjs";
import { parseDetailPage } from "../parser/zufangDetailParser.js";
import { parsePostedAt } from "../parser/timeParser.js";

const html = `
<!doctype html>
<html>
  <body>
    <nav>首页 登录 注册</nav>
    <main>
      <div class="breadcrumb">单间租房 / 编号 592077 / Yishun, 义顺</div>
      <h1>义顺大牌214 主人房出租 冷气 租$1200 免付中介费 86507689</h1>
      <div>日期 1小时前</div>
      <div>分类 单间租房</div>
      <div>标签 <span>无中介费</span> <span>马上入住</span> <span>可煮</span> <span>包水电</span> <span>近地铁</span></div>
      <div>地铁 Yishun, 义顺</div>
      <div>价格 $1,200</div>
      <div>联系 86507689</div>
      <div>电话 86507689 86507689</div>
      <article>
        <p>义顺大牌 214 主人房出租 冷气 租$1200 免付中介费 86507689</p>
        <p>义顺大牌 214 主人房出租</p>
        <p>双人床，冷气，网络，不能煮</p>
        <p>近义顺地铁站</p>
        <p>随时可以入住</p>
        <p>租 $1200 包水电网</p>
        <p>免付中介费</p>
        <p>有意请联系 86507689</p>
        <p>CEA REG NO R003385i</p>
        <section>相关广告 这里不应该出现</section>
        <section>评论 这里不应该出现</section>
        <section>登录 后评论</section>
      </article>
      <a href="https://wa.me/6586507689">WhatsApp</a>
    </main>
    <footer>App 下载提示</footer>
  </body>
</html>
`;

const parsed = parseDetailPage(html, "https://www.zufang.sg/592077");

assert.equal(parsed.sourceId, "592077");
assert.equal(parsed.price, 1200);
assert.ok(parsePostedAt("1小时前", dayjs("2026-05-23T12:00:00+08:00")));
assert.deepEqual(parsed.tags, ["无中介费", "马上入住", "可煮", "包水电", "近地铁"]);
assert.equal(parsed.ceaRegNo, "R003385i");
assert.equal(parsed.phone, "86507689");
assert.equal(parsed.whatsappUrl, "https://wa.me/6586507689");
assert.ok(parsed.bodyText?.includes("义顺大牌 214 主人房出租"));
assert.ok(!parsed.bodyText?.includes("相关广告"));
assert.ok(!parsed.bodyText?.includes("评论"));
assert.ok(!parsed.bodyText?.includes("登录"));

console.log("zufangDetailParser tests passed");
