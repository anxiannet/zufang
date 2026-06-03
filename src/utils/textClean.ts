export function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanMultilineText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MIN_MONTHLY_RENT = 300;
const MAX_MONTHLY_RENT = 20_000;

export function extractPrice(text: string): number | null {
  const normalized = cleanText(text);
  const candidates = [
    ...extractPriceCandidates(normalized, /(?:价格|租金|月租|房租|租)\s*[:：]?\s*(?:s\$|sgd|\$)?\s*([\d,]{3,6})/gi),
    ...extractPriceCandidates(normalized, /(?:s\$|sgd|\$)\s*([\d,]{3,6})(?!\s*(?:人|pax|person|persons))/gi),
    ...extractPriceCandidates(normalized, /([\d,]{3,6})\s*(?:s\$|sgd|\$)(?!\s*(?:\d|人|pax|person|persons))/gi),
    ...extractPriceCandidates(normalized, /([\d,]{3,6})\s*(?:新币|新元|月|每月|\/月)/gi)
  ];

  const valid = candidates.filter(isValidMonthlyRent);
  if (valid.length === 0) {
    return null;
  }

  return valid[0];
}

function extractPriceCandidates(text: string, pattern: RegExp): number[] {
  return Array.from(text.matchAll(pattern))
    .map((match) => Number.parseInt(match[1].replace(/,/g, ""), 10))
    .filter((value) => Number.isFinite(value));
}

function isValidMonthlyRent(value: number): boolean {
  return value >= MIN_MONTHLY_RENT && value <= MAX_MONTHLY_RENT;
}

export function cleanPhone(text: string): string | null {
  const candidates = Array.from(text.matchAll(/(?:\+?65[\s-]?)?(?:\d[\s-]?){8,}/g))
    .map((match) => match[0].replace(/\D/g, ""))
    .map((value) => (value.startsWith("65") && value.length > 8 ? value.slice(2) : value))
    .filter((value) => value.length >= 8 && value.length <= 10);

  return candidates[0] ?? null;
}

export function extractWechat(text: string): string | null {
  const match = text.match(/(?:微信|wechat|WeChat|WX|wx)[:：\s]*([a-zA-Z][a-zA-Z0-9_-]{4,30})/);
  return match?.[1] ?? null;
}
