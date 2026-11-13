import { describe, expect, it } from "vitest";
import { nextRunAfter, type RecurringCadence } from "./recurringSchedule";

const utc = (y: number, m: number, d: number, h = 9, min = 30) => Date.UTC(y, m - 1, d, h, min);
const iso = (ts: number) => new Date(ts).toISOString();

function runs(start: number, cadence: RecurringCadence, count: number, anchorAt?: number) {
  const out = [start];
  for (let i = 1; i < count; i++) out.push(nextRunAfter(out[i - 1]!, cadence, anchorAt));
  return out.map(iso);
}

describe("nextRunAfter", () => {
  it("adds seven days for weekly rules and keeps the time of day", () => {
    expect(iso(nextRunAfter(utc(2027, 3, 27), "weekly"))).toBe(iso(utc(2027, 4, 3)));
  });

  it("returns to the anchor day after a short month", () => {
    const anchor = utc(2027, 1, 31);
    expect(runs(anchor, "monthly", 4, anchor)).toEqual([utc(2027, 1, 31), utc(2027, 2, 28), utc(2027, 3, 31), utc(2027, 4, 30)].map(iso));
    const leapAnchor = utc(2028, 1, 31);
    expect(runs(leapAnchor, "monthly", 3, leapAnchor)).toEqual([utc(2028, 1, 31), utc(2028, 2, 29), utc(2028, 3, 31)].map(iso));
  });

  it("keeps a day the user moved away from the anchor", () => {
    expect(runs(utc(2027, 1, 15), "monthly", 3, utc(2027, 1, 1))).toEqual([utc(2027, 1, 15), utc(2027, 2, 15), utc(2027, 3, 15)].map(iso));
  });

  it("clamps without an anchor and never skips a month", () => {
    expect(runs(utc(2027, 1, 31), "monthly", 3)).toEqual([utc(2027, 1, 31), utc(2027, 2, 28), utc(2027, 3, 28)].map(iso));
  });

  it("keeps an already drifted rule on its current day", () => {
    expect(runs(utc(2027, 3, 3), "monthly", 3, utc(2027, 1, 31))).toEqual([utc(2027, 3, 3), utc(2027, 4, 3), utc(2027, 5, 3)].map(iso));
  });

  it("steps quarterly and yearly from 29 February", () => {
    const anchor = utc(2028, 2, 29);
    expect(runs(anchor, "quarterly", 5, anchor)).toEqual([utc(2028, 2, 29), utc(2028, 5, 29), utc(2028, 8, 29), utc(2028, 11, 29), utc(2029, 2, 28)].map(iso));
    expect(runs(anchor, "yearly", 5, anchor)).toEqual([utc(2028, 2, 29), utc(2029, 2, 28), utc(2030, 2, 28), utc(2031, 2, 28), utc(2032, 2, 29)].map(iso));
    expect(runs(anchor, "yearly", 3)).toEqual([utc(2028, 2, 29), utc(2029, 2, 28), utc(2030, 2, 28)].map(iso));
  });
  it("steps in local time for the web client, whatever the device time zone", () => {
    // Built and read with local getters, so the assertions hold in any time zone.
    const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0).getTime();
    const day = (ts: number) => { const d = new Date(ts); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]; };
    const first = local(2027, 5, 1);
    expect(day(nextRunAfter(first, "monthly", first, "local"))).toEqual([2027, 6, 1, 0]);
    const last = local(2027, 1, 31);
    const feb = nextRunAfter(last, "monthly", last, "local");
    expect(day(feb)).toEqual([2027, 2, 28, 0]);
    expect(day(nextRunAfter(feb, "monthly", last, "local"))).toEqual([2027, 3, 31, 0]);
    expect(day(nextRunAfter(local(2027, 3, 27), "weekly", undefined, "local"))).toEqual([2027, 4, 3, 0]);
    expect(day(nextRunAfter(local(2027, 11, 15), "quarterly", undefined, "local"))).toEqual([2028, 2, 15, 0]);
  });
});
