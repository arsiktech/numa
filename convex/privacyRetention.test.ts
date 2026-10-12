import { afterEach, describe, expect, it, vi } from "vitest";
import { consume } from "./rateLimits";
import { consume as consumeEmail } from "./authEmailRateLimits";
import { expireRateLimitBuckets } from "./privacyRetention";
import { RATE_LIMIT_RETENTION_MS } from "./lib/privacyRetention";
import { privacyFixture } from "../src/test/privacyFixture";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("bounded new-counter retention", () => {
  it("keeps enforcement intact until window end plus retention; expires only stamped rows", async () => {
    vi.stubEnv("NUMA_RATE_LIMIT_INTERNAL_SECRET", "synthetic-secret");
    const now = 1800000000000; vi.spyOn(Date, "now").mockReturnValue(now);
    const f = privacyFixture(); const args = { serverSecret: "synthetic-secret", route: "/api/chat", identityHash: "a".repeat(64), windowMs: 60000, limit: 1 };
    expect(await f.call(consume, args)).toMatchObject({ allowed: true });
    expect(await f.call(consume, args)).toMatchObject({ allowed: false });
    const counter = f.all("rateLimitBuckets")[0]; expect(counter.expiresAt).toBe(now + 60000 + RATE_LIMIT_RETENTION_MS);
    f.seed("rateLimitBuckets", "legacy", { windowStart: 0, windowMs: 1000, identityHash: "legacy", count: 999 });
    f.seed("authRateLimits", "sdk", { identifier: "unknown@example.invalid", lastAttemptTime: 0, attemptsLeft: 0 });
    vi.spyOn(Date, "now").mockReturnValue(counter.expiresAt - 1);
    expect(await f.call(expireRateLimitBuckets)).toEqual({ deleted: 0 });
    vi.spyOn(Date, "now").mockReturnValue(counter.expiresAt);
    expect(await f.call(expireRateLimitBuckets)).toEqual({ deleted: 1 });
    expect(f.rows.has("legacy")).toBe(true); expect(f.rows.has("sdk")).toBe(true);
  });
  it("stamps email identity/global counters, enforces limits and bounds cleanup to100 rows per job", async () => {
    const f = privacyFixture(); vi.spyOn(Date, "now").mockReturnValue(1800000000000);
    for (let i = 0; i < 3; i++) await f.call(consumeEmail, { kind: "verification", identityHash: "b".repeat(64) });
    await expect(f.call(consumeEmail, { kind: "verification", identityHash: "b".repeat(64) })).rejects.toThrow(/Too many email/);
    expect(f.all("rateLimitBuckets")).toHaveLength(2);
    for (const counter of f.all("rateLimitBuckets")) expect(counter.expiresAt).toBeGreaterThan(1800000000000 + RATE_LIMIT_RETENTION_MS);
    for (let i = 0; i < 105; i++) f.seed("rateLimitBuckets", `expired-${i}`, { expiresAt: 1 });
    expect(await f.call(expireRateLimitBuckets)).toEqual({ deleted: 100 }); expect(f.jobs).toHaveLength(1);
    expect(await f.call(expireRateLimitBuckets)).toEqual({ deleted: 5 });
    expect(f.all("rateLimitBuckets")).toHaveLength(2);
  });
});

it("extends stamped expiry when a window grows without opting legacy rows into cleanup", async () => {
  vi.stubEnv("NUMA_RATE_LIMIT_INTERNAL_SECRET", "synthetic-secret"); vi.spyOn(Date, "now").mockReturnValue(86400000);
  const f = privacyFixture();
  const args = { serverSecret: "synthetic-secret", route: "/api/chat", identityHash: "a".repeat(64), windowMs: 3600000, limit: 3 };
  await f.call(consume, args); const row = f.all("rateLimitBuckets")[0];
  await f.call(consume, { ...args, windowMs: 7200000 });
  expect(f.rows.get(row._id).expiresAt).toBe(86400000 + 7200000 + RATE_LIMIT_RETENTION_MS);
  delete f.rows.get(row._id).expiresAt;
  await f.call(consume, { ...args, limit: 4, windowMs: 7200000 });
  expect(f.rows.get(row._id).expiresAt).toBeUndefined();
});
