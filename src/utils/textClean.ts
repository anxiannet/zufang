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

export function extractPrice(text: string): number | null {
  const match = text.match(/\$\s*([\d,]+)/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1].replace(/,/g, ""), 10);
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
