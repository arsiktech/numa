/**
 * Recurring-rule schedule, shared by the Convex backend (`convex/recurring.ts`)
 * and the legacy web reducer (`src/services/storeReducer.ts`). Pure, and the
 * time of day is preserved. The backend has no time zone for a rule, so it
 * steps in UTC; the web client steps in the device's local time, as it always
 * has, so the date a person picked stays the date they see.
 */
export type RecurringCadence = "weekly" | "monthly" | "quarterly" | "yearly";
export type ScheduleZone = "utc" | "local";

const DAY_MS = 86_400_000;
const MONTHS_PER_STEP: Record<Exclude<RecurringCadence, "weekly">, number> = { monthly: 1, quarterly: 3, yearly: 12 };

type Parts = { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; ms: number };

function read(ts: number, zone: ScheduleZone): Parts {
  const d = new Date(ts);
  return zone === "utc"
    ? { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(), ms: d.getUTCMilliseconds() }
    : { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), ms: d.getMilliseconds() };
}

function build(p: Parts, zone: ScheduleZone): number {
  return zone === "utc"
    ? Date.UTC(p.year, p.month, p.day, p.hours, p.minutes, p.seconds, p.ms)
    : new Date(p.year, p.month, p.day, p.hours, p.minutes, p.seconds, p.ms).getTime();
}

/** A calendar fact, the same in every zone. `month` may run past 11. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Advance `ts` by one cadence step. Month-based steps clamp the day to the
 * target month's last day, so a rule never skips a month. When `anchorAt` (the
 * rule's start) is given and `ts` is still on the anchor's schedule, the
 * anchor's day is restored after a short month (31 Jan → 28 Feb → 31 Mar).
 * A rule that was moved off its anchor day keeps its current day.
 */
export function nextRunAfter(ts: number, cadence: RecurringCadence, anchorAt?: number, zone: ScheduleZone = "utc"): number {
  const now = read(ts, zone);
  if (cadence === "weekly") {
    // Local weeks keep the wall-clock time across a daylight-saving change.
    return zone === "utc" ? ts + 7 * DAY_MS : build({ ...now, day: now.day + 7 }, zone);
  }
  const monthIndex = now.month + MONTHS_PER_STEP[cadence];
  const targetYear = now.year + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  let wantedDay = now.day;
  if (anchorAt !== undefined) {
    const anchorDay = read(anchorAt, zone).day;
    if (now.day === Math.min(anchorDay, lastDayOfMonth(now.year, now.month))) wantedDay = anchorDay;
  }
  const day = Math.min(wantedDay, lastDayOfMonth(targetYear, targetMonth));
  return build({ ...now, year: targetYear, month: targetMonth, day }, zone);
}
