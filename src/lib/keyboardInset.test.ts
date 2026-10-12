import { describe, expect, it } from "vitest";
import { keyboardInsetFrom } from "./keyboardInset";

describe("keyboardInsetFrom", () => {
  it("reports the covered strip when the keyboard is up (iOS numbers)", () => {
    // iPhone 15: 852pt layout, keyboard ≈ 336pt, no pan.
    expect(keyboardInsetFrom(852, 516, 0)).toBe(336);
  });

  it("subtracts Safari's pan offset so the strip is never double-counted", () => {
    // Safari panned the layout viewport 60px up to reveal the input.
    expect(keyboardInsetFrom(852, 456, 60)).toBe(336);
  });

  it("ignores browser-chrome jitter smaller than a keyboard", () => {
    expect(keyboardInsetFrom(812, 780, 0)).toBe(0);
  });

  it("never returns a negative inset", () => {
    // Android resize-mode: layout viewport already shrank below the visual.
    expect(keyboardInsetFrom(500, 852, 0)).toBe(0);
  });

  it("treats non-finite viewport values as no keyboard", () => {
    expect(keyboardInsetFrom(Number.NaN, 516, 0)).toBe(0);
    expect(keyboardInsetFrom(852, Number.POSITIVE_INFINITY, 0)).toBe(0);
  });
});
