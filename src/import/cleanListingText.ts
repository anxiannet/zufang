import * as cheerio from "cheerio";

const noise_patterns = [
  /^(登录|注册|收藏|分享|举报|返回列表|上一篇|下一篇|广告|相关房源|相关推荐)$/i,
  /copyright|免责声明|app下载|扫码关注/i
];

export function cleanListingText(input: {
  list_title?: string | null;
  list_raw_text?: string | null;
  raw_detail_html?: string | null;
}): {
  title: string | null;
  rawText: string;
  cleanText: string;
} {
  const html_result = extractHtmlText(input.raw_detail_html ?? "");
  const title = normalizeLine(input.list_title) ?? html_result.title ?? firstUsefulLine(html_result.text);
  const rawText = [input.list_title, input.list_raw_text, html_result.text]
    .filter(Boolean)
    .join("\n");
  const cleanText = uniqueLines(rawText)
    .filter((line) => !noise_patterns.some((pattern) => pattern.test(line)))
    .join("\n");

  return {
    title,
    rawText: normalizeMultiline(rawText),
    cleanText: normalizeMultiline(cleanText)
  };
}

function extractHtmlText(html: string): { title: string | null; text: string } {
  if (!html.trim()) return { title: null, text: "" };

  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, aside, form, iframe").remove();
  $("[class*='advert'], [class*='banner'], [class*='login'], [class*='register']").remove();

  const document_title = normalizeLine($("title").first().text())?.split(/\s+[-|]\s+/)[0] ?? null;
  const body = $("article, main, .post-content, .node-content, .field-name-body, body")
    .toArray()
    .map((node) => normalizeMultiline($(node).text()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";

  return { title: document_title, text: body };
}

function uniqueLines(text: string): string[] {
  const seen = new Set<string>();
  return normalizeMultiline(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

function firstUsefulLine(text: string): string | null {
  return uniqueLines(text).find((line) => line.length >= 4 && !noise_patterns.some((pattern) => pattern.test(line))) ?? null;
}

function normalizeLine(value?: string | null): string | null {
  const normalized = value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() ?? "";
  return normalized || null;
}

function normalizeMultiline(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+|[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
