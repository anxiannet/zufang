const source_metadata_labels = [
  "编号",
  "日期",
  "分类",
  "标签",
  "地铁",
  "价格",
  "联系",
  "微信",
  "电话",
  "私信"
];

const source_noise_patterns = [
  /^(登录|注册|收藏|分享|举报|返回列表|上一篇|下一篇|上一页|下一页)$/i,
  /^(广告|相关广告|相关房源|相关推荐|类似房源|热门房源|最新房源|推荐房源|猜你喜欢|更多房源|附近房源)$/i,
  /^给作者发私信$/,
  /^联系发布者$/,
  /^本作者共发布了?\d+个广告/,
  /^评论$/,
  /^\d+\s*条评论$/,
  /^还没有评论$/,
  /^有疑问可以先留言/,
  /^我要评论$/,
  /^扫码/,
  /^微信扫一扫/,
  /^WhatsApp$/i,
  /copyright|免责声明|app下载|扫码关注/i
];

const contact_patterns = [
  /(?:联系|电话|手机|微信|wechat|whatsapp|telegram|私信)\s*[:：]?\s*[\w+\-\s]{5,}/i,
  /(?:\+?65\s*)?[689]\d{3}\s*\d{4}/,
  /(?:微信|wechat)\s*[:：]?\s*[a-z0-9_-]{4,}/i
];

export function cleanPublicListingDescription(value: string | null | undefined, title?: string | null): string | null {
  const lines = splitDescriptionLines(value);
  const title_text = normalizeText(title ?? "");
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized) continue;
    if (title_text && normalized === title_text) continue;
    if (shouldStopAtLine(normalized)) break;
    if (isSourceMetadataLine(normalized)) continue;
    if (isStructuredFactLine(normalized)) continue;
    if (isContactOnlyLine(normalized)) continue;
    const withoutAvailability = removeAvailabilityFragments(normalized);
    if (!withoutAvailability) continue;
    if (seen.has(withoutAvailability)) continue;

    seen.add(withoutAvailability);
    result.push(withoutAvailability);
  }

  const cleaned = result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || null;
}

function splitDescriptionLines(value: string | null | undefined) {
  return normalizeMultiline(stripHtml(value ?? ""))
    .replace(new RegExp(`\\s+(?=(${source_metadata_labels.join("|")})\\s*[:：]?)`, "g"), "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function isSourceMetadataLine(line: string) {
  if (source_noise_patterns.some((pattern) => pattern.test(line))) return true;

  const label_pattern = new RegExp(`^(${source_metadata_labels.join("|")})\\s*[:：]?\\s*`, "i");
  if (label_pattern.test(line)) return true;

  const label_count = source_metadata_labels.filter((label) => new RegExp(`${label}\\s*[:：]?`).test(line)).length;
  if (label_count >= 2 && line.length <= 140) return true;

  if (/^价格\s*(?:S\$|SGD|\$)?\s*[\d,]+/i.test(line)) return true;
  if (/^日期\s*(?:\d+\s*(?:分钟前|小时前|天前)|刚刚|昨天|今天)/.test(line)) return true;
  if (/^分类\s*(?:普通房|主人房|单间租房|整套租房|床位出租|房屋求租)/.test(line)) return true;
  if (/^标签\s*/.test(line)) return true;

  return false;
}

function isStructuredFactLine(line: string) {
  return /^(房间|入住时间|入住日期|可入住|条件|性别|要求|租期|最短租期)\s*[:：]/.test(line);
}

function isContactOnlyLine(line: string) {
  const compact = line.replace(/\s+/g, "");
  if (/^(?:\+?65)?[689]\d{7}$/.test(compact)) return true;
  return contact_patterns.some((pattern) => pattern.test(line)) && line.length <= 120;
}

function shouldStopAtLine(line: string) {
  return /^本作者共发布了?\d+个广告/.test(line)
    || /^评论$/.test(line)
    || /^\d+\s*条评论$/.test(line)
    || /^还没有评论$/.test(line)
    || /^有疑问可以先留言/.test(line);
}

function removeAvailabilityFragments(line: string) {
  return line
    .replace(/(?:^|[，,；;。.\s])(?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日|号)?\s*(?:入住|可入住|起租|available)(?=$|[，,；;。.\s])/gi, "")
    .replace(/(?:^|[，,；;。.\s])(?:入住|可入住|起租|available\s*from)\s*(?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日|号)?(?=$|[，,；;。.\s])/gi, "")
    .replace(/\s*([，,；;。])\s*/g, "$1")
    .replace(/^[，,；;。.\s]+|[，,；;。.\s]+$/g, "")
    .trim();
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeMultiline(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+|[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
