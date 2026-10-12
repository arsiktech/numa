export type DateLocale = "en" | "ru" | "es";

function monthName(date: Date, style: "short" | "long", locale: DateLocale = "en") {
  return new Intl.DateTimeFormat(locale, { month: style }).format(date);
}

export function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatYear(date: Date) {
  return String(date.getFullYear());
}

export function formatMonth(date: Date, style: "short" | "long", locale: DateLocale = "en") {
  return monthName(date, style, locale);
}

export function formatMonthYear(date: Date, style: "short" | "long", locale: DateLocale = "en") {
  return `${monthName(date, style, locale)} ${date.getFullYear()}`;
}

export function formatDayMonth(date: Date, locale: DateLocale = "en") {
  return `${date.getDate()} ${monthName(date, "short", locale)}`;
}

export function formatDayMonthYear(date: Date, locale: DateLocale = "en") {
  return `${formatDayMonth(date, locale)} ${date.getFullYear()}`;
}

export function parseLocalDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}
