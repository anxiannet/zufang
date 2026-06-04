import * as cheerio from "cheerio";
import { cleanText } from "../utils/textClean";

const excludedListingPatterns: RegExp[] = [
  /床位出租/i,
  /床位/i,
  /搭房/i,
  /搭铺/i,
  /床铺/i,
  /bed\s*space/i,
  /bedspace/i,
  /日租/i,
  /按天租/i,
  /短租几天/i,
  /小时房/i,
  /hourly/i,
  /daily\s*rental/i,
  /daily\s*stay/i
];

export type ListingExclusionMatch = {
  excluded: boolean;
  keyword?: string;
};

export function getListingExclusionMatch(text: string | null | undefined): ListingExclusionMatch {
  const normalized = cleanText(text ?? "");

  for (const pattern of excludedListingPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        excluded: true,
        keyword: match[0]
      };
    }
  }

  return { excluded: false };
}

export function getHtmlListingExclusionMatch(html: string): ListingExclusionMatch {
  const $ = cheerio.load(html);
  pruneDetailNoise($);

  const titleText = cleanText([
    $("title").first().text().split(/\s+-\s+/)[0],
    $("h1").first().text(),
    $(".title").first().text(),
    $(".node-title").first().text(),
    $(".page-title").first().text()
  ].join(" "));
  const mainText = extractMainDetailText($);

  return getListingExclusionMatch(`${titleText} ${mainText}`);
}

function pruneDetailNoise($: cheerio.CheerioAPI): void {
  $("script, style, noscript, svg, nav, footer, header, form, aside, iframe").remove();

  $("section, aside, div, ul, ol").each((_, element) => {
    const node = $(element);
    const text = cleanText(node.text());
    if (!text) return;

    if (isNoisyContainer(text) || countRelatedListingLinks($, node) >= 2) {
      node.remove();
    }
  });
}

function extractMainDetailText($: cheerio.CheerioAPI): string {
  const selectors = ["article", ".node-content", ".post-content", ".field-name-body", ".content .body", "main"];
  const candidates = selectors
    .map((selector) => cleanText($(selector).first().text()))
    .filter((value) => value.length > 0)
    .sort((a, b) => scoreMainDetailText(b) - scoreMainDetailText(a));

  if (candidates[0]) {
    return candidates[0];
  }

  return cleanText($("body").text());
}

function scoreMainDetailText(text: string): number {
  let score = 0;
  if (/编号\s*\d+/.test(text)) score += 8;
  if (/价格\s*[:：]?\s*\$?\s*[\d,]+/.test(text)) score += 8;
  if (/联系\s*[:：]?/.test(text)) score += 6;
  if (/地铁\s*[:：]?/.test(text)) score += 4;
  if (/主人房|普通房|小普通房|隔间|整套|出租/.test(text)) score += 6;
  if (isNoisyContainer(text)) score -= 12;
  score -= Math.min(30, Math.floor(text.length / 2000));
  return score;
}

function isNoisyContainer(text: string): boolean {
  return /相关广告|相关推荐|相关房源|类似房源|热门房源|最新房源|推荐房源|猜你喜欢|更多房源|附近房源|评论|我要评论|登录|注册|收藏|分享|App\s*下载|Copyright|免责声明/i.test(text.slice(0, 100));
}

function countRelatedListingLinks($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): number {
  const links = node.find("a[href]").toArray();
  return links.filter((link) => {
    const href = $(link).attr("href") ?? "";
    const text = cleanText($(link).text());
    return /\/\d+(?:\/)?$|\/posts\/|\/ad\//.test(href) && /\$\s*\d+|普通房|主人房|出租|租房|房间|隔间|床位/.test(text);
  }).length;
}
