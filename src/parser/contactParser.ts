export function extractPhone(text: string): string | null {
  const candidates = Array.from(text.matchAll(/(?:\+?65[\s-]?)?[3689](?:[\s-]?\d){7}/g))
    .map((match) => match[0].replace(/\D/g, ""))
    .map((value) => (value.startsWith("65") && value.length > 8 ? value.slice(2) : value))
    .filter((value) => /^[3689]\d{7}$/.test(value));

  return candidates[0] ?? null;
}

export function extractWechat(text: string): string | null {
  const match = text.match(/(?:微信|微 信|wechat|weixin|wx|WX|WeChat)[:：\s号]*([a-zA-Z][a-zA-Z0-9_-]{4,30})/);
  return match?.[1] ?? null;
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
