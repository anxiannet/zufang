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

const bodyStopPatterns = [
  /相关广告/,
  /相关推荐/,
  /评论/,
  /我要评论/,
  /登录/,
  /注册/,
  /收藏/,
  /App\s*下载/i,
  /Copyright/i,
  /免责声明/
];

export function parseDetailPage(html: string, detailUrl: string): DetailListing {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form").remove();

  const rawDetailText = cleanMultilineText($.root().text());
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
    mrtArea: extractLabeledValue(rawDetailText, "地铁") ?? extractMrtArea(rawDetailText),
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

function extractSourceId(detailUrl: string, text: string): string {
  const urlId = new URL(detailUrl).pathname.match(/(\d+)(?:\/)?$/)?.[1];
  const textId = text.match(/编号\s*(\d+)/)?.[1];
  return urlId ?? textId ?? new URL(detailUrl).pathname.replace(/\W+/g, "_");
}

function extractTitle($: cheerio.CheerioAPI, text: string): string | null {
  const selectors = ["h1", ".title", ".node-title", ".page-title", "article h2"];
  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value && !/登录|注册|租房网/.test(value)) {
      return value;
    }
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /编号\s*\d+/.test(line) || /单间租房\s*\//.test(line));
  const candidate = lines.slice(Math.max(0, index + 1)).find((line) => !isStructureLine(line) && line.length >= 6);
  return candidate ?? null;
}

function extractCategory(text: string): string | null {
  const labeled = extractLabeledValue(text, "分类");
  if (labeled) {
    return labeled;
  }

  const match = text.match(/(单间租房|整套租房|床位出租|房屋求租)/);
  return match?.[1] ?? null;
}

function extractTags($: cheerio.CheerioAPI, text: string): string[] {
  const domTags = $("a, span, em, i")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .filter((value) => knownTags.includes(value));
  const textTags = knownTags.filter((tag) => text.includes(tag));
  return Array.from(new Set([...domTags, ...textTags]));
}

function extractLabeledValue(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n|\\s)${escaped}\\s*[:：]?\\s*([^\\n]+)`);
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const value = cleanText(match[1]).replace(/^(分类|标签|地铁|价格|联系|电话)\s*/, "").trim();
  return value || null;
}

function extractLabeledPrice(text: string): number | null {
  const match = text.match(/价格\s*[:：]?\s*\$?\s*([\d,]+)/);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function extractMrtArea(text: string): string | null {
  const match = text.match(/([A-Z][A-Za-z ]{2,30},\s*[\u4e00-\u9fa5]{1,8})/);
  if (match) {
    return cleanText(match[1]);
  }

  const cnMatch = text.match(/地铁\s*[:：]?\s*([^\n]+)/);
  return cnMatch ? cleanText(cnMatch[1]) : null;
}

function extractCeaRegNo(text: string): string | null {
  const match = text.match(/CEA\s*(?:REG(?:ISTRATION)?\s*)?NO\.?\s*[:：]?\s*([A-Z]\d{6}[A-Z]?)/i);
  return match?.[1] ?? null;
}

function extractBodyText($: cheerio.CheerioAPI, rawText: string): string | null {
  const selectors = [
    ".field-name-body",
    ".node-content",
    ".content .body",
    ".post-content",
    "article",
    "main"
  ];

  const candidate = selectors
    .map((selector) => cleanMultilineText($(selector).first().text()))
    .find((value) => value.length > 30) ?? rawText;

  const lines = candidate
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  const bodyLines: string[] = [];
  let seenLikelyBody = false;

  for (const line of lines) {
    if (bodyStopPatterns.some((pattern) => pattern.test(line))) {
      break;
    }

    if (isStructureLine(line)) {
      continue;
    }

    if (!seenLikelyBody && line.length < 5) {
      continue;
    }

    seenLikelyBody = true;
    bodyLines.push(line);
  }

  const body = cleanMultilineText(bodyLines.join("\n"));
  return body || null;
}

function isStructureLine(line: string): boolean {
  return [
    /^首页$/,
    /^租房$/,
    /^单间租房\s*\/\s*编号/,
    /^编号\s*\d+$/,
    /^日期\s*[:：]?/,
    /^分类\s*[:：]?/,
    /^标签\s*[:：]?/,
    /^地铁\s*[:：]?/,
    /^价格\s*[:：]?/,
    /^联系\s*[:：]?/,
    /^电话\s*[:：]?/,
    /^发布$/,
    /^返回/
  ].some((pattern) => pattern.test(line));
}

export const detailParserInternals = {
  extractCeaRegNo,
  extractBodyText
};
