import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { privacyFixture } from "../src/test/privacyFixture";
import { AI_SHARING_VERSION } from "./lib/privacyPolicy";
import { reply, takeAskQuota } from "./ask";

const provider = vi.hoisted(() => ({ send: vi.fn(), constructed: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    static APIError = class extends Error { status = 500; };
    beta = { messages: { create: provider.send } };
    constructor() { provider.constructed(); }
  },
}));

const legacyRequest = { message: "Explain this fictional budget", context: "Synthetic balances only", history: [] };
const boundRequest = { ...legacyRequest, expectedUserId: "user" };
const response = { stop_reason: "end_turn", content: [{ type: "text", text: "Synthetic provider reply" }] };

async function fixture() {
  const f = privacyFixture();
  let dbContext: any;
  await f.call({ _handler: (ctx: any) => { dbContext = ctx; } });
  let quotaCalls = 0;
  let beforeQuota: (() => void) | undefined;
  const ctx = {
    auth: dbContext.auth,
    runMutation: async (ref: any, args: any) => {
      expect(getFunctionName(ref)).toBe("ask:takeAskQuota");
      quotaCalls++; beforeQuota?.();
      return f.call(takeAskQuota, args);
    },
    runQuery: async () => { throw new Error("Unexpected action query: permission belongs in the quota transaction"); },
  };
  return {
    ...f,
    request: (args: object = boundRequest) => (reply as any)._handler(ctx, args),
    grant: (version = AI_SHARING_VERSION) => f.seed("privacyChoices", "choice", { userId: "user", allowed: true, version, recordedAt: 1 }),
    beforeQuota: (fn: () => void) => { beforeQuota = fn; },
    quotaCalls: () => quotaCalls,
  };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-key-not-a-live-credential");
  vi.stubEnv("NUMA_ASK_MODEL", "synthetic-model");
  provider.send.mockReset().mockResolvedValue(response);
  provider.constructed.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function noProviderOrQuotaRows(f: Awaited<ReturnType<typeof fixture>>) {
  expect(provider.send).not.toHaveBeenCalled();
  expect(provider.constructed).not.toHaveBeenCalled();
  expect(f.all("rateLimitBuckets")).toHaveLength(0);
}

describe("direct Ask authorization boundary", () => {
  it("rejects a legacy-shaped request without explicit permission before any provider work", async () => {
    const f = await fixture();
    expect(await f.request(legacyRequest)).toMatchObject({ status: "declined" });
    noProviderOrQuotaRows(f);
  });

  it("allows exactly one bound request with a current explicit grant", async () => {
    const f = await fixture(); f.grant();
    expect(await f.request()).toEqual({ status: "ok", text: "Synthetic provider reply", proposals: [] });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.constructed).toHaveBeenCalledTimes(1);
    expect(f.all("rateLimitBuckets")).toHaveLength(2);
    expect(f.all("rateLimitBuckets").every(row => row.count === 1)).toBe(true);
  });

  it.each(["missing", "withdrawn", "stale"])("denies a bound request when the choice is %s", async state => {
    const f = await fixture();
    if (state !== "missing") f.grant(state === "stale" ? "previous-policy" : AI_SHARING_VERSION);
    if (state === "withdrawn") f.rows.get("choice").allowed = false;
    expect(await f.request()).toMatchObject({ status: "declined", reason: "permission-required" });
    noProviderOrQuotaRows(f);
  });

  it.each(["scheduled", "started"])("denies a granted request during %s deletion", async state => {
    const f = await fixture(); f.grant();
    f.seed("profiles", "profile", { userId: "user", deletionScheduledAt: Date.now() + 10000, ...(state === "started" ? { deletionStartedAt: Date.now() } : {}) });
    expect(await f.request()).toMatchObject({ status: "declined", reason: "deletion-pending" });
    noProviderOrQuotaRows(f);
  });

  it("rejects a stale authenticated subject after its user row is erased", async () => {
    const f = await fixture(); f.grant(); f.rows.delete("user");
    expect(await f.request()).toMatchObject({ status: "declined", reason: "account-unavailable" });
    noProviderOrQuotaRows(f);
  });

  it("rejects a missing or switched snapshot identity even with permission", async () => {
    const f = await fixture(); f.grant();
    expect(await f.request(legacyRequest)).toMatchObject({ status: "declined", reason: "account-unavailable" });
    expect(await f.request({ ...boundRequest, expectedUserId: "other" })).toMatchObject({ status: "declined", reason: "account-unavailable" });
    noProviderOrQuotaRows(f); expect(f.quotaCalls()).toBe(0);
  });

  it("checks withdrawal inside the final quota authorization, not a stale client snapshot", async () => {
    const f = await fixture(); f.grant();
    f.beforeQuota(() => { f.rows.get("choice").allowed = false; });
    expect(await f.request()).toMatchObject({ status: "declined", reason: "permission-required" });
    noProviderOrQuotaRows(f);
  });

  it("never trusts another user ID supplied to the internal quota handler", async () => {
    const f = await fixture(); f.seed("users", "other", {});
    f.seed("privacyChoices", "other-choice", { userId: "other", allowed: true, version: AI_SHARING_VERSION, recordedAt: 1 });
    expect(await f.call(takeAskQuota, { userId: "other", now: Date.now() })).toMatchObject({ status: "denied", reason: "account-unavailable" });
    noProviderOrQuotaRows(f);
  });

  it("permits an already-authorized in-flight reply but blocks the next request after withdrawal", async () => {
    const f = await fixture(); f.grant();
    let finish!: (value: typeof response) => void;
    provider.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.request();
    await vi.waitFor(() => expect(provider.send).toHaveBeenCalledTimes(1));
    f.rows.get("choice").allowed = false; finish(response);
    expect(await pending).toMatchObject({ status: "ok" });
    expect(await f.request()).toMatchObject({ status: "declined", reason: "permission-required" });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(f.all("rateLimitBuckets").every(row => row.count === 1)).toBe(true);
  });

  it("preserves signed-out rejection and does not forward provider errors or question text to logs", async () => {
    const f = await fixture(); f.signIn(null);
    await expect(f.request()).rejects.toThrow(/Sign in/);
    noProviderOrQuotaRows(f);
    f.signIn("user"); f.grant();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    provider.send.mockRejectedValueOnce(new Error("sensitive synthetic question and token"));
    expect(await f.request()).toEqual({ status: "unavailable" });
    expect(warn).toHaveBeenCalledWith("ask.reply provider error", "network");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive synthetic");
  });
});
