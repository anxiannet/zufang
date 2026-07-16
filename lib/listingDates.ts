export function parseListingAvailability(
  value: string | null | undefined,
  referenceDate = new Date()
): { date: string | null; note: string | null } {
  const text = normalizeText(value ?? "");
  if (!text) return { date: null, note: null };
  if (/马上入住|立即入住|即刻入住|随时入住/.test(text)) return { date: null, note: "马上入住" };

  const fullDate = text.match(/(?:入住|available\s*from|可入住|起租)?\s*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|号)?/i);
  if (fullDate) {
    return { date: formatDate(Number(fullDate[1]), Number(fullDate[2]), Number(fullDate[3])), note: null };
  }

  const yearMonthApprox = text.match(/(?:入住|available\s*from|可入住|起租|入住时间)?\s*[:：]?\s*(20\d{2})[-/.年](\d{1,2})\s*月?\s*(初|中|底|末)/i);
  if (yearMonthApprox) {
    const year = Number(yearMonthApprox[1]);
    const month = Number(yearMonthApprox[2]);
    const day = approximateDay(yearMonthApprox[3]);
    return {
      date: formatDate(year, month, day),
      note: `${year}年${month}月${yearMonthApprox[3]}`
    };
  }

  const chineseMonthDay = text.match(/(?:入住|可入住|起租)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?\s*(?:入住|可入住|起租|available)?/i);
  if (chineseMonthDay) {
    return {
      date: inferYearDate(Number(chineseMonthDay[1]), Number(chineseMonthDay[2]), referenceDate),
      note: null
    };
  }

  const slashMonthDay = text.match(/(?:入住|可入住|起租|available\s*from)?\s*(\d{1,2})[/-](\d{1,2})\s*(?:入住|可入住|起租|available)?/i);
  if (slashMonthDay) {
    return {
      date: inferYearDate(Number(slashMonthDay[1]), Number(slashMonthDay[2]), referenceDate),
      note: null
    };
  }

  return { date: null, note: null };
}

function approximateDay(value: string) {
  if (value === "中") return 15;
  if (value === "底" || value === "末") return 25;
  return 1;
}

function inferYearDate(month: number, day: number, referenceDate: Date) {
  const year = referenceDate.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const referenceDay = new Date(year, referenceDate.getMonth(), referenceDate.getDate());
  if (candidate.getTime() < referenceDay.getTime()) {
    return formatDate(year + 1, month, day);
  }
  return formatDate(year, month, day);
}

function formatDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
