import {
  formatDayMonth,
  formatDayMonthYear,
  formatLocalDateInput,
  formatMonth,
  formatMonthYear,
  formatYear,
  parseLocalDateInput
} from "./dateFormat";
import { getWeekStartsOn } from "./weekStart";

export type PeriodPreset =
  | "week"
  | "month"
  | "30d"
  | "year"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "last-year";

// Legacy alias retained for tests + analytics
export type PeriodKey = "month" | "30d" | "year";

export interface PeriodSelection {
  preset?: PeriodPreset;
  ym?: { year: number; month: number }; // month is 1-12
  custom?: { startMs: number; endMs: number };
}

export interface PeriodRange {
  selection: PeriodSelection;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
}

const DEFAULT_SELECTION: PeriodSelection = { preset: "month" };

function atStartOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function atEndOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return atEndOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return atEndOfDay(new Date(date.getFullYear(), 11, 31));
}

function startOfQuarter(date: Date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function endOfQuarter(date: Date) {
  return endOfMonth(new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + 2, 1));
}

function shiftDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function shiftMonths(date: Date, amount: number) {
  const result = new Date(date);
  const targetMonth = result.getMonth() + amount;
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1) {
  const start = atStartOfDay(date);
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function endOfWeek(date: Date, weekStartsOn: 0 | 1) {
  return atEndOfDay(shiftDays(startOfWeek(date, weekStartsOn), 6));
}

function getISOWeek(date: Date) {
  const target = atStartOfDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}

function rangeForPreset(preset: PeriodPreset, now: Date): { start: Date; end: Date; label: string; shortLabel: string } {
  switch (preset) {
    case "week": {
      // Used by the HomePage hero "Spent this week". Defaults to Monday (ISO)
      // but follows the user's week-start preference (Mon/Sun).
      const weekStartsOn = getWeekStartsOn();
      const start = startOfWeek(now, weekStartsOn);
      const end = endOfWeek(now, weekStartsOn);
      const isoWeek = getISOWeek(now);
      return {
        start,
        end,
        label: `Week ${isoWeek}`,
        shortLabel: `W${isoWeek}`
      };
    }
    case "30d":
      return {
        start: shiftDays(now, -29),
        end: now,
        label: "Last 30 days",
        shortLabel: "30 days"
      };
    case "year":
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        label: formatYear(now),
        shortLabel: formatYear(now)
      };
    case "last-year": {
      const prior = shiftMonths(now, -12);
      return {
        start: startOfYear(prior),
        end: endOfYear(prior),
        label: formatYear(prior),
        shortLabel: formatYear(prior)
      };
    }
    case "this-quarter":
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        label: `Q${Math.floor(now.getMonth() / 3) + 1} ${formatYear(now)}`,
        shortLabel: `Q${Math.floor(now.getMonth() / 3) + 1}`
      };
    case "last-quarter": {
      const prior = shiftMonths(now, -3);
      return {
        start: startOfQuarter(prior),
        end: endOfQuarter(prior),
        label: `Q${Math.floor(prior.getMonth() / 3) + 1} ${formatYear(prior)}`,
        shortLabel: `Q${Math.floor(prior.getMonth() / 3) + 1}`
      };
    }
    case "last-month": {
      const prior = shiftMonths(now, -1);
      return {
        start: startOfMonth(prior),
        end: endOfMonth(prior),
        label: formatMonthYear(prior, "long"),
        shortLabel: formatMonth(prior, "short")
      };
    }
    case "month":
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: formatMonthYear(now, "long"),
        shortLabel: formatMonth(now, "short")
      };
  }
}

export function rangeForSelection(selection: PeriodSelection, now: Date = new Date()): PeriodRange {
  if (selection.custom) {
    const start = new Date(selection.custom.startMs);
    const end = new Date(selection.custom.endMs);
    return {
      selection,
      label: `${formatDayMonthYear(start)} → ${formatDayMonthYear(end)}`,
      shortLabel: `${formatDayMonth(start)} → ${formatDayMonth(end)}`,
      start,
      end
    };
  }
  if (selection.ym) {
    const anchor = new Date(selection.ym.year, selection.ym.month - 1, 1);
    return {
      selection,
      label: formatMonthYear(anchor, "long"),
      shortLabel: formatMonthYear(anchor, "short"),
      start: startOfMonth(anchor),
      end: endOfMonth(anchor)
    };
  }
  const preset = selection.preset ?? "month";
  const { start, end, label, shortLabel } = rangeForPreset(preset, now);
  return { selection: { preset }, label, shortLabel, start, end };
}

// Legacy helper retained for analytics tests and chart axis labels
export function getPeriodRange(key: PeriodKey, now: Date = new Date()): PeriodRange {
  return rangeForSelection({ preset: key }, now);
}

export function isWithin(range: PeriodRange, occurredAt: number) {
  return occurredAt >= range.start.getTime() && occurredAt <= range.end.getTime();
}

const VALID_PRESETS: PeriodPreset[] = [
  "week",
  "month",
  "30d",
  "year",
  "last-month",
  "this-quarter",
  "last-quarter",
  "last-year"
];

export function parsePeriodFromSearch(params: URLSearchParams): PeriodSelection {
  const period = params.get("period");
  if (!period) return DEFAULT_SELECTION;
  if (period === "custom") {
    const start = params.get("start");
    const end = params.get("end");
    if (!start || !end) return DEFAULT_SELECTION;
    const s = parseLocalDateInput(start);
    const e = parseLocalDateInput(end);
    if (!s || !e || s.getTime() > e.getTime()) return DEFAULT_SELECTION;
    return { custom: { startMs: s.getTime(), endMs: e.getTime() } };
  }
  if (period.startsWith("ym-")) {
    const parts = period.slice(3).split("-");
    if (parts.length !== 2) return DEFAULT_SELECTION;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return DEFAULT_SELECTION;
    }
    return { ym: { year, month } };
  }
  if ((VALID_PRESETS as string[]).includes(period)) {
    return { preset: period as PeriodPreset };
  }
  return DEFAULT_SELECTION;
}

export function periodToSearchParams(
  selection: PeriodSelection,
  base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const next = new URLSearchParams(base);
  next.delete("period");
  next.delete("start");
  next.delete("end");
  if (selection.custom) {
    next.set("period", "custom");
    next.set("start", formatLocalDateInput(new Date(selection.custom.startMs)));
    next.set("end", formatLocalDateInput(new Date(selection.custom.endMs)));
  } else if (selection.ym) {
    const monthStr = String(selection.ym.month).padStart(2, "0");
    next.set("period", `ym-${selection.ym.year}-${monthStr}`);
  } else if (selection.preset && selection.preset !== "month") {
    next.set("period", selection.preset);
  }
  return next;
}

