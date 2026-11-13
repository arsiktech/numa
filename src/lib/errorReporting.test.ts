import { describe, expect, it } from "vitest";
import {
  createReporterState,
  describeUnknownError,
  shouldReport
} from "./errorReporting";

describe("describeUnknownError", () => {
  it("handles Error, string, object, and circular values", () => {
    const err = new TypeError("nope");
    expect(describeUnknownError(err).message).toBe("TypeError: nope");
    expect(describeUnknownError(err).stack).toBeTruthy();
    expect(describeUnknownError("plain").message).toBe("plain");
    expect(describeUnknownError({ a: 1 }).message).toBe('{"a":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeUnknownError(circular).message).toContain("object");
  });
});

describe("shouldReport", () => {
  it("ignores known noise", () => {
    const state = createReporterState();
    expect(shouldReport(state, "f1", "ResizeObserver loop limit exceeded", 0)).toBe(false);
    expect(shouldReport(state, "f2", "Script error.", 0)).toBe(false);
  });

  it("applies a per-fingerprint cooldown but allows different errors", () => {
    const state = createReporterState();
    expect(shouldReport(state, "fa", "boom", 0)).toBe(true);
    state.sentTotal += 1;
    state.lastSentByFingerprint.set("fa", 0);
    expect(shouldReport(state, "fa", "boom", 5_000)).toBe(false);
    expect(shouldReport(state, "fb", "other boom", 5_000)).toBe(true);
    expect(shouldReport(state, "fa", "boom", 60_000)).toBe(true);
  });

  it("caps total reports per session", () => {
    const state = createReporterState();
    state.sentTotal = 25;
    expect(shouldReport(state, "fz", "boom", 0)).toBe(false);
  });
});
