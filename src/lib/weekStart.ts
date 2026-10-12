import { useEffect, useState } from "react";

/**
 * Which day the weekly period starts on: 1 = Monday (ISO, the default) or
 * 0 = Sunday. Stored locally as a UI preference. `period.ts` reads this for the
 * "week" preset (the Home "Spent this week" hero), so the boundary follows the
 * user's expectation instead of being hard-coded to Monday.
 */
export type WeekStartsOn = 0 | 1;

const KEY = "numa:weekStartsOn";
const CHANGE_EVENT = "numa:weekStartsOn";
const DEFAULT: WeekStartsOn = 1;

export function getWeekStartsOn(): WeekStartsOn {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return window.localStorage.getItem(KEY) === "0" ? 0 : 1;
  } catch {
    return DEFAULT;
  }
}

export function setWeekStartsOn(value: WeekStartsOn): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    /* private mode etc. */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  } catch {
    /* ignore */
  }
}

/** Reactive hook for the settings toggle + any surface that wants live updates. */
export function useWeekStartsOn(): [WeekStartsOn, (value: WeekStartsOn) => void] {
  const [value, setValue] = useState<WeekStartsOn>(() => getWeekStartsOn());
  useEffect(() => {
    const handler = () => setValue(getWeekStartsOn());
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);
  return [value, (next) => { setWeekStartsOn(next); setValue(next); }];
}
