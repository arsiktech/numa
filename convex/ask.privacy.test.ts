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
afterEach(() => { vi.unstubAllEnvs(); send.mockReset(); });

describe("registered Ask action durable sharing boundary", () => {
  function fixture() {
    const f = privacyFixture();
    const runQuery = vi.fn(async (ref: Parameters<typeof getFunctionName>[0]) => {
      expect(getFunctionName(ref)).toBe("privacy:status");
      return f.call(status);
    });
    const runMutation = vi.fn(async (ref: Parameters<typeof getFunctionName>[0], args: object) => {
      expect(getFunctionName(ref)).toBe("ask:takeAskQuota");
      return f.call(takeAskQuota, args);
    });
    const ctx = { auth: { getUserIdentity: async () => ({ subject: "user" }) }, runQuery, runMutation };
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
