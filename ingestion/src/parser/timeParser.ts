import dayjs from "dayjs";

export function parsePostedAt(input: string, now = dayjs()): Date | null {
  const text = input.replace(/\s+/g, " ").trim();

  const minuteMatch = text.match(/(\d+)\s*分钟前/);
  if (minuteMatch) {
    return now.subtract(Number(minuteMatch[1]), "minute").toDate();
  }

  const hourMatch = text.match(/(\d+)\s*小时前/);
  if (hourMatch) {
    return now.subtract(Number(hourMatch[1]), "hour").toDate();
  }

  if (/昨天/.test(text)) {
    return now.subtract(1, "day").startOf("day").toDate();
  }

  const dayMatch = text.match(/(\d+)\s*天前/);
  if (dayMatch) {
    return now.subtract(Number(dayMatch[1]), "day").toDate();
  }

  const dateTimeMatch = text.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (dateTimeMatch) {
    const normalized = `${dateTimeMatch[1].replace(/[/.]/g, "-")}${dateTimeMatch[2] ? ` ${dateTimeMatch[2]}` : ""}`;
    const parsed = dayjs(normalized);
    return parsed.isValid() ? parsed.toDate() : null;
  }

  return null;
}

export function parsePostedText(input: string): string | null {
  const text = input.replace(/\s+/g, " ").trim();
  const match = text.match(/(\d+\s*分钟前|\d+\s*小时前|昨天|\d+\s*天前|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/);
  return match?.[1]?.replace(/\s+/g, "") ?? null;
}

export function isOlderThanDays(date: Date | null, days: number, now = dayjs()): boolean {
  if (!date) {
    return false;
  }

  return dayjs(date).isBefore(now.subtract(days, "day"));
}
