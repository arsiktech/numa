import { format } from "date-fns";
import { afterEach, describe, expect, it } from "vitest";
import {
  parsePeriodFromSearch,
  periodToSearchParams,
  rangeForSelection
} from "./period";

const NOW = new Date(2026, 4, 15, 12, 0, 0); // local time, May 15 2026

function isoLocal(d: Date) {
  return format(d, "yyyy-MM-dd");
}

describe("rangeForSelection", () => {
  it("returns the current month when no preset is set", () => {
    const range = rangeForSelection({}, NOW);
    expect(isoLocal(range.start)).toBe("2026-05-01");
    expect(isoLocal(range.end)).toBe("2026-05-31");
    expect(range.label).toBe("May 2026");
  });

  it("returns the prior calendar month for last-month", () => {
    const range = rangeForSelection({ preset: "last-month" }, NOW);
    expect(isoLocal(range.start)).toBe("2026-04-01");
    expect(isoLocal(range.end)).toBe("2026-04-30");
    expect(range.label).toBe("April 2026");
  });

  it("supports specific calendar month via ym", () => {
    const range = rangeForSelection({ ym: { year: 2025, month: 2 } }, NOW);
    expect(isoLocal(range.start)).toBe("2025-02-01");
    expect(isoLocal(range.end)).toBe("2025-02-28");
    expect(range.label).toBe("February 2025");
  });

  it("supports an arbitrary custom range", () => {
    const start = new Date(2026, 0, 15).getTime();
    const end = new Date(2026, 2, 20, 23, 59, 59).getTime();
    const range = rangeForSelection({ custom: { startMs: start, endMs: end } }, NOW);
    expect(range.start.getTime()).toBe(start);
    expect(range.end.getTime()).toBe(end);
    expect(range.label).toBe("15 Jan 2026 → 20 Mar 2026");
  });
});

describe("URL serialization", () => {
  it("round-trips presets, ym and custom selections through search params", () => {
    const cases = [
      { preset: "30d" as const },
      { preset: "year" as const },
      { ym: { year: 2024, month: 8 } },
      { custom: { startMs: new Date(2025, 8, 10).getTime(), endMs: new Date(2025, 11, 31).getTime() } }
    ];
    for (const selection of cases) {
      const params = periodToSearchParams(selection);
      const parsed = parsePeriodFromSearch(params);
      if (selection.custom) {
        expect(parsed.custom?.startMs).toBeDefined();
        expect(parsed.custom?.endMs).toBeGreaterThan(parsed.custom!.startMs);
      } else {
        expect(parsed).toEqual(selection);
      }
    }
  });

  it("falls back to the default selection when the URL is malformed", () => {
    expect(parsePeriodFromSearch(new URLSearchParams("period=ym-bogus"))).toEqual({ preset: "month" });
    expect(parsePeriodFromSearch(new URLSearchParams("period=custom"))).toEqual({ preset: "month" });
    expect(parsePeriodFromSearch(new URLSearchParams("period=garbage"))).toEqual({ preset: "month" });
  });
});

describe("week-start preference", () => {
  afterEach(() => window.localStorage.removeItem("numa:weekStartsOn"));

  it("the week preset starts on Monday by default", () => {
    const range = rangeForSelection({ preset: "week" }, NOW);
    expect(range.start.getDay()).toBe(1); // Monday
    expect(range.end.getDay()).toBe(0); // Sunday
  });

  it("the week preset honours a stored Sunday preference", () => {
    window.localStorage.setItem("numa:weekStartsOn", "0");
    const range = rangeForSelection({ preset: "week" }, NOW);
    expect(range.start.getDay()).toBe(0); // Sunday
    expect(range.end.getDay()).toBe(6); // Saturday
  });
});
