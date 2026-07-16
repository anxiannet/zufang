export type NtuSuitability =
  | { suitable: true; reason: string }
  | { suitable: false; reason: string }
  | { suitable: null; reason: string };

const explicit_ntu_pattern = /\bNTU\b|南洋理工|Nanyang\s+Technological\s+University/i;

const target_area_pattern = [
  /\bPioneer\b|先驱/i,
  /\bBoon\s*Lay\b|文礼/i,
  /\bJurong\s*West\b|裕廊西/i,
  /\bJurong\s*East\b|裕廊东/i,
  /\bLakeside\b|湖畔/i,
  /\bChinese\s*Garden\b|裕华园/i,
  /\bClementi\b|金文泰/i
];

const far_area_pattern = [
  /\bChangi\b|樟宜|机场/i,
  /\bPasir\s*Ris\b|巴西立/i,
  /\bTampines\b|淡滨尼/i,
  /\bSimei\b|四美/i,
  /\bBedok\b|勿洛/i,
  /\bEunos\b|友诺士/i,
  /\bPaya\s*Lebar\b|巴耶利峇/i,
  /\bKallang\b|加冷/i,
  /\bGeylang\b|芽笼/i,
  /\bSerangoon\b|实龙岗/i,
  /\bHougang\b|后港/i,
  /\bSengkang\b|盛港/i,
  /\bPunggol\b|榜鹅/i,
  /\bYishun\b|义顺/i,
  /\bWoodlands\b|兀兰/i,
  /\bOrchard\b|乌节/i,
  /\bNovena\b|诺维娜/i,
  /\bToa\s*Payoh\b|大巴窑/i,
  /\bCity\s*Hall\b|政府大厦/i,
  /\bMarina\b|滨海/i,
  /\bCBD\b|市中心/i
];

const ntu_target_postal_prefixes = [
  "12",
  "13",
  "59",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68"
];

export function assessNtuSuitability(input: {
  title?: string | null;
  description?: string | null;
  postalCode?: string | null;
  area?: string | null;
  mrt?: string | null;
}): NtuSuitability {
  const text = [input.title, input.description, input.area, input.mrt].filter(Boolean).join("\n");
  const postal_code = input.postalCode?.trim() ?? "";

  if (explicit_ntu_pattern.test(text)) {
    return { suitable: true, reason: "明确提到 NTU / 南洋理工" };
  }

  if (target_area_pattern.some((pattern) => pattern.test(text))) {
    return { suitable: true, reason: "位于 NTU 优先区域" };
  }

  if (postal_code && isTargetPostalCode(postal_code)) {
    return { suitable: true, reason: "邮编位于 NTU 优先区域" };
  }

  if (far_area_pattern.some((pattern) => pattern.test(text))) {
    return { suitable: false, reason: "明显远离 NTU 目标区域" };
  }

  if (postal_code && !isTargetPostalCode(postal_code)) {
    return { suitable: false, reason: `邮编 ${postal_code} 不在 NTU 优先区域` };
  }

  return { suitable: null, reason: "缺少足够位置信息判断是否适合 NTU 学生" };
}

function isTargetPostalCode(postal_code: string) {
  return ntu_target_postal_prefixes.some((prefix) => postal_code.startsWith(prefix));
}
