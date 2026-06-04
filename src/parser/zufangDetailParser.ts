import * as cheerio from "cheerio";
import { DetailListing } from "../models/listing";
import { config } from "../utils/config";
import { cleanMultilineText, cleanText, extractPrice } from "../utils/textClean";
import { extractContactText, extractPhone, extractWhatsappUrl, extractWechat } from "./contactParser";
import { parsePostedAt, parsePostedText } from "./timeParser";

const knownTags = [
  "无中介费",
  "马上入住",
  "可煮",
  "包水电",
  "近地铁",
  "可报地址",
  "限女生",
  "限男生",
  "可短租",
  "空调房",
  "带家具"
];

const nextLabelPattern = /\s+(?:日期|分类|标签|地铁|价格|联系|微信|电话|私信|给作者发私信)\s*[:：]?\s*/;

const noisyContainerPatterns = [
  /相关广告/,
  /相关推荐/,
  /相关房源/,
  /类似房源/,
  /热门房源/,
  /最新房源/,
  /推荐房源/,
  /猜你喜欢/,
  /更多房源/,
  /附近房源/,
  /评论/,
  /我要评论/,
  /登录/,
  /注册/,
  /收藏/,
  /分享/,
  /App\s*下载/i,
  /Copyright/i,
  /免责声明/
];

const bodyStopPatterns = [
  ...noisyContainerPatterns,
  /^上一篇/,
  /^下一篇/,
  /^上一页/,
  /^下一页/,
  /^返回列表/,
  /^联系发布者/,
  /^举报/,
  /^扫码/,
  /^微信扫一扫/,
  /^WhatsApp$/i
];

export function parseDetailPage(html: string, detailUrl: string): DetailListing {
  const $ = cheerio.load(html);
  pruneNoiseElements($);

  const rawDetailText = extractRelevantDetailText($);
  const sourceId = extractSourceId(detailUrl, rawDetailText);
  const title = extractTitle($, rawDetailText);
  const postedText = extractLabeledValue(rawDetailText, "日期") ?? parsePostedText(rawDetailText);
  const category = extractCategory(rawDetailText);
  const price = extractLabeledPrice(rawDetailText) ?? extractPrice(rawDetailText);
  const contactText = extractLabeledValue(rawDetailText, "联系") ?? extractContactText(rawDetailText);
  const whatsappUrl = extractWhatsappUrl(html);
  const tags = extractTags($, rawDetailText);

  return {
    source: config.source,
    sourceId,
    detailUrl,
    title,
    postedText,
    postedAt: postedText ? parsePostedAt(postedText) : parsePostedAt(rawDetailText),
    category,
    mrtArea: extractMrtLabeledValue(rawDetailText) ?? extractLineLabeledValue(rawDetailText, "地铁") ?? extractLabeledValue(rawDetailText, "地铁") ?? extractMrtArea(rawDetailText),
    price,
    contactText,
    phone: extractPhone(`${contactText ?? ""}\n${rawDetailText}`),
    whatsappUrl,
    wechat: extractWechat(rawDetailText),
    tags,
    bodyText: extractBodyText($, rawDetailText),
    ceaRegNo: extractCeaRegNo(rawDetailText),
    rawDetailHtml: html,
    rawDetailText,
    scrapedAt: new Date()
  };
}

function pruneNoiseElements($: cheerio.CheerioAPI): void {
  $("script, style, noscript, svg, nav, footer, header, form, aside, iframe").remove();

  $("section, aside, div, ul, ol").each((_, element) => {
    const node = $(element);
    const text = cleanText(node.text());
    if (!text) return;

    const hasNoiseHeading = noisyContainerPatterns.some((pattern) => pattern.test(text.slice(0, 80)));
    const looksLikeListingCluster = countListingLinks($, node) >= 2;

    if (hasNoiseHeading || looksLikeListingCluster) {
      node.remove();
    }
  });
}

function countListingLinks($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): number {
  const links = node.find("a[href]").toArray();
  return links.filter((link) => {
    const href = $(link).attr("href") ?? "";
    const text = cleanText($(link).text());
    return /\/\d+(?:\/)?$|\/posts\/|\/ad\//.test(href) && /\$\s*\d+|普通房|主人房|出租|租房|房间|隔间/.test(text);
  }).length;
}

function extractRelevantDetailText($: cheerio.CheerioAPI): string {
  const selectors = ["article", ".node-content", ".post-content", ".field-name-body", ".content .body", "main", "body"];

  const candidate = selectors
    .map((selector) => cleanMultilineText($(selector).first().text()))
    .filter((value) => value.length > 20)
    .sort((a, b) => scoreDetailText(b) - scoreDetailText(a))[0] ?? cleanMultilineText($.root().text());

  return cleanDetailLines(candidate, { keepStructure: true });
}

function scoreDetailText(text: string): number {
  let score = 0;
  if (/编号\s*\d+/.test(text)) score += 8;
  if (/价格\s*[:：]?\s*\$?\s*[\d,]+/.test(text)) score += 8;
  if (/联系\s*[:：]?/.test(text)) score += 6;
  if (/地铁\s*[:：]?/.test(text)) score += 4;
  if (/主人房|普通房|小普通房|隔间|床位|整套|出租/.test(text)) score += 6;
  if (noisyContainerPatterns.some((pattern) => pattern.test(text))) score -= 8;
  score -= Math.min(30, Math.floor(text.length / 2000));
  return score;
}

function extractSourceId(detailUrl: string, text: string): string {
  const urlId = new URL(detailUrl).pathname.match(/(\d+)(?:\/)?$/)?.[1];
  const textId = text.match(/编号\s*(\d+)/)?.[1];
  return urlId ?? textId ?? new URL(detailUrl).pathname.replace(/\W+/g, "_");
}

function extractTitle($: cheerio.CheerioAPI, text: string): string | null {
  const documentTitle = cleanText($("title").first().text()).split(/\s+-\s+/)[0];
  if (documentTitle && !/登录|注册|租房网|狮城BBS|相关广告|相关推荐/.test(documentTitle)) {
    return documentTitle;
  }

  const selectors = ["h1", ".title", ".node-title", ".page-title", "article h2"];
  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value && !/登录|注册|租房网|相关广告|相关推荐/.test(value)) {
      return value;
    }
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /编号\s*\d+/.test(line) || /单间租房\s*\//.test(line));
  const candidate = lines.slice(Math.max(0, index + 1)).find((line) => !isStructureLine(line) && !isNoiseLine(line) && line.length >= 6);
  return candidate ?? null;
}

function extractCategory(text: string): string | null {
  const labeled = extractLabeledValue(text, "分类");
  if (labeled) return labeled;

  const match = text.match(/(单间租房|整套租房|床位出租|房屋求租)/);
  return match?.[1] ?? null;
}

function extractTags($: cheerio.CheerioAPI, text: string): string[] {
  const domTags = $("a, span, em, i")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .filter((value) => knownTags.includes(value));
  const textTags = knownTags.filter((tag) => text.includes(tag));
  return [...new Set([...domTags, ...textTags])];
}

function extractLabeledValue(text: string, label: string): string | null {
  const regex = new RegExp(`${label}\\s*[:：]?\\s*([^\\n]+)`);
  const match = text.match(regex);
  if (!match?.[1]) return null;
  const value = match[1].split(nextLabelPattern)[0]?.trim();
  return value ? cleanText(value) : null;
}

function extractLineLabeledValue(text: string, label: string): string | null {
  const line = text
    .split(/\n+/)
    .map((value) => cleanText(value))
    .find((value) => value.startsWith(label));

  if (!line) return null;
  const value = cleanText(line.replace(new RegExp(`^${label}\\s*[:：]?\\s*`), ""));
  return value || null;
}

function extractLabeledPrice(text: string): number | null {
  const value = extractLabeledValue(text, "价格");
  return value ? extractPrice(value) : null;
}

function extractMrtLabeledValue(text: string): string | null {
  const match = text.match(/(?:^|\s)地铁\s+([A-Za-z][A-Za-z\s]+,\s*[\u4e00-\u9fa5]{1,8})/);
  return match?.[1] ? cleanText(match[1]) : null;
}

function extractMrtArea(text: string): string | null {
  const match = text.match(/([A-Za-z][A-Za-z\s]+,\s*[\u4e00-\u9fa5]{1,6})/);
  return match?.[1] ? cleanText(match[1]) : null;
}

function extractBodyText($: cheerio.CheerioAPI, rawText: string): string | null {
  const contentSelectors = ["article", ".node-content", ".post-content", ".field-name-body", ".content .body", "main"];
  const bodyCandidate = contentSelectors
    .map((selector) => cleanMultilineText($(selector).first().text()))
    .filter((value) => value.length > 30)
    .sort((a, b) => b.length - a.length)[0] ?? rawText;

  const lines = cleanDetailLines(bodyCandidate, { keepStructure: false })
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isStructureLine(line))
    .filter((line) => !isNoiseLine(line));

  const value = lines.join("\n").trim();
  return value || null;
}

function cleanDetailLines(text: string, options: { keepStructure: boolean }): string {
  const lines = cleanMultilineText(text)
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  const result: string[] = [];
  for (const line of lines) {
    if (isNoiseLine(line)) continue;
    if (!options.keepStructure && isStructureLine(line)) continue;
    result.push(line);
  }
  return result.join("\n");
}

function isStructureLine(line: string): boolean {
  return /^(编号|日期|分类|标签|地铁|价格|联系|微信|电话|私信)\s*[:：]?/.test(line) || /^给作者发私信$/.test(line);
}

function isNoiseLine(line: string): boolean {
  return bodyStopPatterns.some((pattern) => pattern.test(line));
}

function extractCeaRegNo(text: string): string | null {
  const match = text.match(/\b[RS]\d{6,7}[A-Z]\b/i);
  return match?.[0] ?? null;
}
