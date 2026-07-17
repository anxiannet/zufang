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
  hasDetailContent: boolean;
  postal_code: string | null;
} {
  const html_result = extractHtmlText(input.raw_detail_html ?? "");
  const hasDetailContent = Boolean(html_result.text);
  // The detail page is the canonical source. List cards can be stale or, in rare
  // cases, point to a post whose title/price has since changed.
  const title = hasDetailContent
    ? html_result.title ?? firstUsefulLine(html_result.text)
    : normalizeLine(input.list_title) ?? firstUsefulLine(input.list_raw_text ?? "");
  const rawText = hasDetailContent
    ? html_result.text
    : [input.list_title, input.list_raw_text].filter(Boolean).join("\n");
  const cleanText = uniqueLines(rawText)
    .filter((line) => !noise_patterns.some((pattern) => pattern.test(line)))
    .join("\n");

  return {
    title,
    rawText: normalizeMultiline(rawText),
    cleanText: normalizeMultiline(cleanText),
    hasDetailContent,
    postal_code: html_result.postal_code
  };
}

function extractHtmlText(html: string): { title: string | null; text: string; postal_code: string | null } {
  if (!html.trim()) return { title: null, text: "", postal_code: null };

  const $ = cheerio.load(html);
  const map_postal_code = extract_map_postal_code($);
  $("script, style, noscript, svg, nav, header, footer, aside, form, iframe").remove();
  $("[class*='advert'], [class*='banner'], [class*='login'], [class*='register']").remove();

  const document_title = normalizeLine($("title").first().text())?.split(/\s+[-|]\s+/)[0] ?? null;
  const body = $("article, main, .post-content, .node-content, .field-name-body, body")
    .toArray()
    .map((node) => normalizeMultiline($(node).text()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
  const postal_code = reconcile_map_postal_code(
    map_postal_code,
    [document_title, body].filter(Boolean).join("\n")
  );

  return { title: document_title, text: body, postal_code };
}

function extract_map_postal_code($: cheerio.CheerioAPI): string | null {
  for (const iframe of $("iframe[src]").toArray()) {
    const src = $(iframe).attr("src");
    if (!src) continue;

    try {
      const url = new URL(src, "https://www.google.com");
      if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname) || !url.pathname.includes("/maps/")) continue;

      const query = url.searchParams.get("q") ?? "";
      const postal_code = query.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1] ?? null;
      if (postal_code) return postal_code;
    } catch {
      continue;
    }
  }

  return null;
}

function reconcile_map_postal_code(map_postal_code: string | null, text: string): string | null {
  if (!map_postal_code) return null;
  const block_suffix = extract_unique_block_suffix(text);
  if (!block_suffix || map_postal_code.endsWith(block_suffix)) return map_postal_code;
  return `${map_postal_code.slice(0, 3)}${block_suffix}`;
}

function extract_unique_block_suffix(text: string): string | null {
  const block_pattern = /(?:\b(?:blk|block)(?![A-Za-z])|大牌)\s*(?:no\.?\s*)?[-#:]?\s*(\d{1,3})(?:[A-Za-z])?(?!\d)/gi;
  const block_suffixes = new Set(
    Array.from(text.matchAll(block_pattern))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((value) => value >= 1 && value <= 999)
      .map((value) => String(value).padStart(3, "0"))
  );
  return block_suffixes.size === 1 ? [...block_suffixes][0] : null;
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
  const normalized = (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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
