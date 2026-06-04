import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { ListListing } from "../models/listing";
import { extractPhone, extractWechat } from "./contactParser";
import { cleanText, extractPrice } from "../utils/textClean";
import { config } from "../utils/config";
import { parsePostedAt, parsePostedText } from "./timeParser";

const tagWords = new Set([
  "近地铁",
  "包水电",
  "可煮",
  "无中介费",
  "可报地址",
  "马上入住",
  "限女生",
  "限男生",
  "可短租",
  "可养宠物",
  "空调房",
  "带家具"
]);

const mrtNames = [
  "巴西立",
  "淡滨尼",
  "四美",
  "樟宜",
  "博览",
  "丹那美拉",
  "勿洛",
  "景万岸",
  "友诺士",
  "巴耶利峇",
  "阿裕尼",
  "加冷",
  "劳明达",
  "武吉士",
  "政府大厦",
  "莱佛士坊",
  "丹戎巴葛",
  "欧南园",
  "中峇鲁",
  "红山",
  "女皇镇",
  "联邦",
  "波那维斯达",
  "杜弗",
  "金文泰",
  "裕廊东",
  "文礼",
  "武吉巴督",
  "蔡厝港",
  "兀兰",
  "义顺",
  "宏茂桥",
  "碧山",
  "大巴窑",
  "诺维娜",
  "纽顿",
  "乌节",
  "多美歌",
  "滨海湾",
  "港湾",
  "牛车水",
  "小印度",
  "花拉公园",
  "文庆",
  "实龙岗",
  "后港",
  "盛港",
  "榜鹅",
  "美世界",
  "大世界",
  "麦波申",
  "乌美"
];

export interface ParsedListPage {
  listings: ListListing[];
  nextPageUrl: string | null;
}

export function parseListPage(html: string, pageUrl: string): ParsedListPage {
  const $ = cheerio.load(html);
  const candidates = findListingNodes($);
  const listings = candidates
    .map((node) => parseListingNode($, node))
    .filter((listing): listing is ListListing => listing !== null);

  return {
    listings,
    nextPageUrl: findNextPageUrl($, pageUrl)
  };
}

function findListingNodes($: cheerio.CheerioAPI): Cheerio<AnyNode>[] {
  const knownSelectors = [
    ".node-card",
    ".post-list .post-item",
    ".list .item",
    ".item-list .item",
    "article",
    "li"
  ];

  for (const selector of knownSelectors) {
    const nodes = $(selector)
      .toArray()
      .map((node) => $(node))
      .filter((node) => isListingLike($, node));

    if (nodes.length > 0) {
      return dedupeNodes(nodes);
    }
  }

  return $("a[href]")
    .toArray()
    .map((anchor) => $(anchor).closest("div,li,article,section"))
    .filter((node) => node.length > 0 && isListingLike($, node))
    .filter((node, index, nodes) => nodes.findIndex((item) => item.get(0) === node.get(0)) === index);
}

function dedupeNodes(nodes: Cheerio<AnyNode>[]): Cheerio<AnyNode>[] {
  return nodes.filter((node, index) => nodes.findIndex((item) => item.get(0) === node.get(0)) === index);
}

function isListingLike($: cheerio.CheerioAPI, node: Cheerio<AnyNode>): boolean {
  const text = cleanText(node.text());
  const href = findListingAnchor($, node).attr("href") ?? "";
  return /\/posts\/|\/ad\/|\/\d+/.test(href) && /小时前|分钟前|天前|昨天|置顶|\$\s*[\d,]+/.test(text);
}

function parseListingNode($: cheerio.CheerioAPI, node: Cheerio<AnyNode>): ListListing | null {
  const anchor = findListingAnchor($, node);
  const href = anchor.attr("href");
  const title = cleanText(anchor.text());

  if (!href || !title || /^收藏$|^发布$|^登录$|^注册$/.test(title)) {
    return null;
  }

  const detailUrl = new URL(href, config.baseUrl).toString();
  const sourceId = extractSourceId(detailUrl);
  const rawHtml = $.html(node);
  const rawText = cleanText(node.text());
  const tags = extractTags($, node);
  const postedText = parsePostedText(rawText);
  const postedAt = parsePostedAt(postedText ?? rawText);
  const contacts = extractContacts($, node, rawText);

  return {
    source: config.source,
    sourceId,
    detailUrl,
    listTitle: title,
    listPostedText: postedText,
    listPrice: extractPrice(rawText),
    listContact: contacts.contactText,
    listRawText: rawText,
    listRawHtml: rawHtml,
    listPhone: contacts.phone,
    listWechat: contacts.wechat,
    listPostedAt: postedAt,
    listTags: tags,
    listMrtArea: extractMrtArea(`${title} ${rawText}`),
    isTop: /置顶/.test(rawText)
  };
}

function findListingAnchor($: cheerio.CheerioAPI, node: Cheerio<AnyNode>): Cheerio<AnyNode> {
  const titleAnchor = node.find(".node-card-title a[href]").first();
  if (titleAnchor.length > 0) {
    return titleAnchor;
  }

  const anchors = node.find("a[href]").toArray();
  const scored = anchors
    .map((anchor) => {
      const item = $(anchor);
      const text = cleanText(item.text());
      const href = item.attr("href") ?? "";
      const score = text.length + (/wa\.me|收藏|发布|登录/.test(href + text) ? -100 : 0);
      return { item, score };
    })
    .filter(({ score }) => score > 4)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.item ?? node.find("a[href]").first();
}

function extractContacts(
  $: cheerio.CheerioAPI,
  node: Cheerio<AnyNode>,
  rawText: string
): { phone: string | null; wechat: string | null; contactText: string | null } {
  const phoneText = cleanText(
    node.find(".node-list-contact--phone, .node-list-contact--whatsapp").first().text()
  );
  const wechatNode = node.find(".node-list-contact--wechat").first();
  const wechatText = cleanText(String(wechatNode.attr("data-clipboard-text") ?? wechatNode.text()));

  const phone = extractPhone(phoneText) ?? (isUsefulContactText(wechatText) ? null : extractPhone(rawText));
  const wechat = isUsefulContactText(wechatText) ? wechatText : extractWechat(rawText);
  const contactText = isUsefulContactText(phoneText) ? phoneText : isUsefulContactText(wechatText) ? wechatText : null;

  return { phone, wechat, contactText };
}

function isUsefulContactText(text: string): boolean {
  return text.length >= 5 && !/^\d{1,4}$/.test(text);
}

function extractSourceId(url: string): string {
  const parsed = new URL(url);
  const pathId = parsed.pathname.match(/(\d+)(?:\/)?$/)?.[1];
  return pathId ?? parsed.pathname.replace(/\W+/g, "_");
}

function extractTags($: cheerio.CheerioAPI, node: Cheerio<AnyNode>): string[] {
  const tags = node
    .find("a,span")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter((text) => tagWords.has(text));

  return Array.from(new Set(tags));
}

function extractMrtArea(text: string): string | null {
  return mrtNames.find((name) => text.includes(name)) ?? null;
}

function findNextPageUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const nextAnchor = $("a")
    .toArray()
    .map((node) => $(node))
    .find((node) => /Next|下一页|»/.test(cleanText(node.text())));

  const href = nextAnchor?.attr("href");
  if (href) {
    return new URL(href, pageUrl).toString();
  }

  const currentPage = Number(new URL(pageUrl).searchParams.get("page") ?? "1");
  const nextPage = currentPage + 1;
  const inferred = new URL(pageUrl);
  inferred.searchParams.set("page", String(nextPage));
  return nextPage === 2 ? inferred.toString() : null;
}
