import { describe, expect, it, vi } from "vitest";
import {
  passwordResetDelayMs,
  runEnumerationSafeReset
} from "./NumaPassword";

describe("enumeration-safe password reset initiation", () => {
  it("consumes the limiter before lookup and returns the same result for known and unknown", async () => {
    const knownOrder: string[] = [];
    const known = await runEnumerationSafeReset({
      consume: async () => { knownOrder.push("limit"); },
      lookup: async () => { knownOrder.push("lookup"); return { id: "account" }; },
      send: async () => { knownOrder.push("send"); },
      finish: async () => { knownOrder.push("finish"); }
    });
    const unknownOrder: string[] = [];
    const unknown = await runEnumerationSafeReset({
      consume: async () => { unknownOrder.push("limit"); },
      lookup: async () => { unknownOrder.push("lookup"); return null; },
      send: vi.fn(),
      finish: async () => { unknownOrder.push("finish"); }
    });

    expect(known).toBeNull();
    expect(unknown).toBeNull();
    expect(knownOrder).toEqual(["limit", "lookup", "send", "finish"]);
    expect(unknownOrder).toEqual(["limit", "lookup", "finish"]);
  });

  it("normalizes limiter and delivery failures to the accepted response", async () => {
    const finish = vi.fn().mockResolvedValue(undefined);
    await expect(runEnumerationSafeReset({
      consume: vi.fn().mockRejectedValue(new Error("limited")),
      lookup: vi.fn(),
      send: vi.fn(),
      finish
    })).resolves.toBeNull();
    await expect(runEnumerationSafeReset({
      consume: vi.fn().mockResolvedValue(undefined),
      lookup: vi.fn().mockResolvedValue({ id: "account" }),
      send: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      finish
    })).resolves.toBeNull();
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("uses one response-time floor for every identity", () => {
    expect(passwordResetDelayMs(1_000, 1_500, 2_000)).toBe(1_500);
    expect(passwordResetDelayMs(1_000, 4_000, 2_000)).toBe(0);
  });
});
