import { cleanText } from "../utils/textClean";

export type ListingIntentAssessment = {
  intent: "rental_offer" | "uncertain" | "non_listing";
  reason?: string;
};

const hard_non_listing_title_patterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^(?:送人|赠送)(?:\s*[:：\-—]|\s|$)/i,
    reason: "送人或赠送信息"
  },
  {
    pattern: /^(?:房屋求租|租房求租|求租|找房|求房|租客求房|我要租房|寻找房间)(?:\s*[:：\-—]|\s|$)/i,
    reason: "租客求租信息"
  },
  {
    pattern: /^(?:招聘|求职|征婚|交友|出售|转让|二手)(?:\s*[:：\-—]|\s|$)/i,
    reason: "非租房广告"
  }
];

const non_rental_content_pattern = /招聘|求职|征婚|交友|二手交易|出售手机|贷款|博彩|赌博|刷单|代购/i;
const rental_offer_pattern = /出租|招租|房间出租|主人房|普通房|整租|转租|room\s+(?:for\s+)?rent|for\s+rent/i;
const uncertain_title_pattern = /^(?:找室友|寻室友|求室友|合租伙伴)(?:\s*[:：\-—]|\s|$)/i;

export function assess_listing_intent(input: {
  title: string | null | undefined;
  description: string | null | undefined;
}): ListingIntentAssessment {
  const normalized_title = cleanText(input.title ?? "");
  const normalized_description = cleanText(input.description ?? "");
  const combined_text = `${normalized_title}\n${normalized_description}`;

  for (const entry of hard_non_listing_title_patterns) {
    if (entry.pattern.test(normalized_title)) {
      return { intent: "non_listing", reason: entry.reason };
    }
  }

  if (non_rental_content_pattern.test(combined_text) && !rental_offer_pattern.test(combined_text)) {
    return { intent: "non_listing", reason: "疑似非租房广告" };
  }

  if (rental_offer_pattern.test(normalized_title)) {
    return { intent: "rental_offer" };
  }

  if (uncertain_title_pattern.test(normalized_title)) {
    return { intent: "uncertain", reason: "室友招募信息需要人工确认" };
  }

  return { intent: "rental_offer" };
}
