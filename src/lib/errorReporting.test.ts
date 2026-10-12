import { describe, expect, it } from "vitest";
import {
  createReporterState,
  describeUnknownError,
  errorFingerprint,
  normalizeMessage,
  shouldReport
} from "./errorReporting";

describe("normalizeMessage", () => {
  it("collapses urls, hex ids, and long numbers so variants group together", () => {
    const a = normalizeMessage("Failed to fetch https://x.convex.cloud/api/1234567 after 30000ms");
    const b = normalizeMessage("Failed to fetch https://y.convex.cloud/api/7654321 after 45000ms");
    expect(a).toBe(b);
    expect(a).toContain("<url>");
    expect(a).toContain("<n>");
  });
});

describe("errorFingerprint", () => {
  it("is stable for the same input and distinct across sources", () => {
    expect(errorFingerprint("boom", "window")).toBe(errorFingerprint("boom", "window"));
    expect(errorFingerprint("boom", "window")).not.toBe(errorFingerprint("boom", "boundary"));
  });

  it("groups messages that differ only in volatile parts", () => {
    expect(errorFingerprint("load chunk 4821 failed", "window")).toBe(
      errorFingerprint("load chunk 9173 failed", "window")
    );
  });
});

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
