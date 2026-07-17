import * as cheerio from "cheerio";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parse_source_posted_at(
  source_text: string | null | undefined,
  observed_at: string | null | undefined
): string | null {
  if (!source_text || !observed_at) return null;
  const observed_date = new Date(observed_at);
  if (Number.isNaN(observed_date.getTime())) return null;

  const days_match = source_text.match(/(?<!\d)(\d{1,3})\s*天前/);
  if (days_match) {
    return new Date(observed_date.getTime() - Number(days_match[1]) * DAY_MS).toISOString();
  }
  if (/前天/.test(source_text)) return new Date(observed_date.getTime() - 2 * DAY_MS).toISOString();
  if (/昨天/.test(source_text)) return new Date(observed_date.getTime() - DAY_MS).toISOString();
  if (/(?:今天|刚刚|\d+\s*(?:分钟|小时)前)/.test(source_text)) return observed_date.toISOString();
  return null;
}

export function parse_candidate_source_posted_at(
  list_text: string | null | undefined,
  detail_html: string | null | undefined,
  observed_at: string | null | undefined
): string | null {
  const detail_text = detail_html ? cheerio.load(detail_html).root().text() : null;
  return parse_source_posted_at([detail_text, list_text].filter(Boolean).join(" "), observed_at);
}
