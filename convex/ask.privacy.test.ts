import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { privacyFixture } from "../src/test/privacyFixture";
import { status, setAISharing } from "./privacy";
import { AI_SHARING_VERSION } from "./lib/privacyPolicy";
import { reply, takeAskQuota } from "./ask";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    static APIError = class extends Error {};
    beta = { messages: { create: send } };
  }
  return { default: Anthropic };
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); send.mockReset(); });

describe("registered Ask action durable sharing boundary", () => {
  function fixture(actor: string | null = 'user') {
    const f = privacyFixture();
    f.signIn(actor);
    const runQuery = vi.fn(async (ref: Parameters<typeof getFunctionName>[0]) => {
      expect(getFunctionName(ref)).toBe("privacy:status");
      return f.call(status);
    });
    const runMutation = vi.fn(async (ref: Parameters<typeof getFunctionName>[0], args: object) => {
      expect(getFunctionName(ref)).toBe("ask:takeAskQuota");
      return f.call(takeAskQuota, args);
    });
    const ctx = { auth: { getUserIdentity: async () => actor ? { subject: actor } : null }, runQuery, runMutation };
    const call = () => (reply as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(ctx, { message: "Synthetic question", context: "Synthetic savings: 9 EUR", history: [] });
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-not-a-provider-key");
    send.mockResolvedValue({ content: [{ type: "text", text: "A proposal, not a write" }], stop_reason: "end_turn" });
    return { f, call, runQuery, runMutation };
  }
  for (const state of ["absent", "withdrawn", "stale", "scheduled deletion", "started deletion", "deleted account"]) {
    it(`blocks ${state} before provider submission or quota consumption`, async () => {
      const { f, call, runMutation } = fixture();
      if (state !== "absent") f.seed("privacyChoices", "choice", { userId: "user", allowed: state !== "withdrawn", version: state === "stale" ? "old" : AI_SHARING_VERSION, recordedAt: 1 });
      if (state === "scheduled deletion") f.seed("profiles", "profile", { userId: "user", deletionScheduledAt: Date.now() + 60_000 });
      if (state === "started deletion") f.seed("profiles", "profile", { userId: "user", deletionStartedAt: 1 });
      if (state === "deleted account") f.rows.delete("user");
      await expect(call()).rejects.toThrow(/sharing|permission|sign in/i);
      expect(send).not.toHaveBeenCalled(); expect(runMutation).not.toHaveBeenCalled();
    });
  }
  it('rejects a signed-out caller before the privacy query or provider', async () => {
    const { call, runQuery, runMutation } = fixture(null);
    await expect(call()).rejects.toThrow(/sign in/i);
    expect(runQuery).not.toHaveBeenCalled(); expect(runMutation).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('keeps unavailable-provider handling reachable after an explicit current grant', async () => {
    const { f, call, runMutation } = fixture();
    f.seed('privacyChoices', 'choice', { userId: 'user', allowed: true, version: AI_SHARING_VERSION, recordedAt: 1 });
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await call()).toEqual({ status: 'unavailable' });
    expect(runMutation).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('still rejects exhausted quota after an explicit current grant', async () => {
    const { f, call } = fixture();
    f.seed('privacyChoices', 'choice', { userId: 'user', allowed: true, version: AI_SHARING_VERSION, recordedAt: 1 });
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const windowStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    f.seed('rateLimitBuckets', 'full', { key: `ask:hour:user:${windowStart}`, count: 30 });
    expect(await call()).toEqual({ status: 'limited' }); expect(send).not.toHaveBeenCalled();
  });
  it("reads the current decision on every request and stops a new request after withdrawal", async () => {
    const { f, call, runQuery } = fixture();
    const grant = { expectedUserId: "user", allowed: true, version: AI_SHARING_VERSION, clientMutationId: "grant" };
    await f.call(setAISharing, grant);
    expect(await call()).toMatchObject({ status: "ok", proposals: [] });
    expect(send).toHaveBeenCalledTimes(1);
    await f.call(setAISharing, { ...grant, allowed: false, clientMutationId: "withdraw" });
    await expect(call()).rejects.toThrow(/sharing|permission/i);
    expect(send).toHaveBeenCalledTimes(1); expect(runQuery).toHaveBeenCalledTimes(2);
    expect(f.all("transactions")).toEqual([]);
  });
});
