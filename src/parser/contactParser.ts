export function extractPhone(text: string): string | null {
  const candidates = Array.from(text.matchAll(/(?:\+?65[\s-]?)?[3689](?:[\s-]?\d){7}/g))
    .map((match) => match[0].replace(/\D/g, ""))
    .map((value) => (value.startsWith("65") && value.length > 8 ? value.slice(2) : value))
    .filter((value) => /^[3689]\d{7}$/.test(value));

  return candidates[0] ?? null;
}

export function extractWechat(text: string): string | null {
  const candidates = Array.from(
    text.matchAll(/(?:微信(?:号)?|微\s*信(?:号)?|wechat|weixin|wx|WX|WeChat)\s*[:：号\-]?\s*([a-zA-Z0-9][a-zA-Z0-9_-]{4,30})/g)
  )
    .map((match) => normalizeWechatId(match[1]))
    .filter((value): value is string => Boolean(value));

  return candidates[0] ?? null;
}

export function extractWhatsappUrl(htmlOrText: string): string | null {
  const match = htmlOrText.match(/https?:\/\/(?:api\.)?wa\.me\/[^\s"'<>]+|https?:\/\/wa\.me\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

export function extractContactText(text: string): string | null {
  const line = text
    .split(/\n+/)
    .map((item) => item.trim())
    .find((item) => /^(联系|电话|手机|Whatsapp|WhatsApp|微信)/i.test(item));

  return line ?? extractPhone(text);
}

function normalizeWechatId(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[，。,.;；、)）】\]]+$/, "");
  if (cleaned.length < 5 || cleaned.length > 30) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]+$/.test(cleaned)) return null;
  if (/^[3689]\d{7}$/.test(cleaned)) return null;
  return cleaned;
}
