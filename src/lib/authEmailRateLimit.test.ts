import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTH_EMAIL_GLOBAL_RATE_LIMIT,
  AUTH_EMAIL_RATE_LIMIT,
  authEmailLimitExceeded,
  hashAuthEmail,
  normalizeAuthEmail
} from "../../convex/lib/authEmailRateLimit";

describe("auth email rate-limit identity", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeAuthEmail("  Person@Example.com ")).toBe("person@example.com");
  });

  it("denies the next send when either persistent bucket reaches its limit", () => {
    expect(authEmailLimitExceeded(AUTH_EMAIL_RATE_LIMIT - 1, AUTH_EMAIL_RATE_LIMIT)).toBe(false);
    expect(authEmailLimitExceeded(AUTH_EMAIL_RATE_LIMIT, AUTH_EMAIL_RATE_LIMIT)).toBe(true);
    expect(
      authEmailLimitExceeded(AUTH_EMAIL_GLOBAL_RATE_LIMIT, AUTH_EMAIL_GLOBAL_RATE_LIMIT)
    ).toBe(true);
  });

  it("uses a stable opaque bucket identity", async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    try {
      const first = await hashAuthEmail("Person@Example.com");
      expect(await hashAuthEmail(" person@example.com ")).toBe(first);
      expect(await hashAuthEmail("other@example.com")).not.toBe(first);
      expect(first).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
    }
  });
});
