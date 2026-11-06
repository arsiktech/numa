import { describe, expect, it } from "vitest";
import { activeDayReport, utcDate } from "./activeDays";

describe("active-day retention, four completed UTC weeks", () => {
  it("uses UTC calendar dates, including year and timezone boundaries", () => {
    expect(utcDate(Date.parse("2026-12-31T23:30:00-02:00"))).toBe("2027-01-01");
    expect(() => utcDate(NaN)).toThrow();
  });
  it("counts people, not opens, and requires three different weeks outside the household", () => {
    const rows = ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-19"].map(day => ({ userId: "outside", utcDate: day }));
    rows.push({ userId: "outside", utcDate: "2026-10-05" }, { userId: "household", utcDate: "2026-10-19" }, { userId: "outside", utcDate: "2026-10-28" });
    const report = activeDayReport(rows, "2026-10-28", ["outside", "outside"]);
    expect(report.window).toEqual({ from: "2026-09-28", through: "2026-10-25" });
    expect(report.weeks.map(w => w.activeUsers)).toEqual([0, 1, 1, 2]);
    expect(report.weeks.map(w => w.outsideHouseholdActiveUsers)).toEqual([0, 1, 1, 1]);
    expect(report.retainedOutsideHousehold).toBe(1);
    expect(report.gateMet).toBe(false);
  });
  it("does not silently classify every user as an outside tester", () => {
    const report = activeDayReport([{ userId: "unknown", utcDate: "2026-10-19" }], "2026-10-28", null);
    expect(report.retainedOutsideHousehold).toBeNull();
    expect(report.gateMet).toBeNull();
  });
  it("uses only valid dates in the window and handles a year-crossing Monday", () => {
    const report = activeDayReport([{ userId: "u", utcDate: "2026-02-30" }, { userId: "u", utcDate: "2027-01-04" }], "2027-01-04", ["u"]);
    expect(report.window).toEqual({ from: "2026-12-07", through: "2027-01-03" });
    expect(report.weeks.every(w => w.activeUsers === 0)).toBe(true);
  });
});

it("meets the ten-person gate only with verified people present in three separate completed weeks", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `outside-${i}`);
  const rows = ids.flatMap(userId => ["2026-10-05", "2026-10-12", "2026-10-19"].map(utcDate => ({ userId, utcDate })));
  const yes = activeDayReport(rows, "2026-10-28", ids);
  expect(yes.retainedOutsideHousehold).toBe(10); expect(yes.gateMet).toBe(true);
  const no = activeDayReport(rows.filter(row => row.userId !== ids[0] || row.utcDate !== "2026-10-19"), "2026-10-28", ids);
  expect(no.retainedOutsideHousehold).toBe(9); expect(no.gateMet).toBe(false);
});
