export const singaporeTimeZone = "Asia/Singapore";

export function formatSingaporeDateTime(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-SG", {
    timeZone: singaporeTimeZone,
    ...options
  });
}

export function formatSingaporeDate(value: string | Date | null | undefined) {
  return formatSingaporeDateTime(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function formatSingaporeShortDateTime(value: string | Date | null | undefined) {
  return formatSingaporeDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatSingaporeMediumDateTime(value: string | Date | null | undefined) {
  return formatSingaporeDateTime(value, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function getSingaporeDateInputValue(value: string | Date | null | undefined = new Date()) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: singaporeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}
