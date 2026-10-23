import { afterEach, describe, expect, it, vi } from "vitest";
import { privacyFixture } from "../src/test/privacyFixture";
import { registerDevice, unregisterDevice, targets, sendDue, deviceRegistered } from "./pushAlerts";
import { getFunctionName } from "convex/server";
import { store } from "./auth";

const token = "ExponentPushToken[synthetic_device]";
afterEach(() => vi.unstubAllGlobals());
describe("Expo push session withdrawal", () => {
  function fixture() {
    const f = privacyFixture();
    f.seed("authSessions", "session", { userId: "user", expirationTime: Date.now() + 60_000 });
    f.signIn("user|session");
    return f;
  }
  it("binds registration to the current live auth session and stops routing after logout/account change", async () => {
    const f = fixture();
    await f.call(registerDevice, { token, platform: "ios", timeZone: "UTC" });
    expect(f.all("expoPushTokens")[0]).toMatchObject({ userId: "user", sessionId: "session" });
    expect(await f.call(targets)).toEqual([{ userId: "user", tokens: [token], timeZone: "UTC" }]);
    // Convex Auth 0.0.94 deletes the previous session on sign-out/new sign-in.
    await f.call(store, { args: { type: "signOut" } });
    expect(f.rows.has("session")).toBe(false);
    f.signIn(null);
    expect(await f.call(targets)).toEqual([]);
    f.seed("users", "other", {}); f.signIn("other|other-session");
    expect(await f.call(deviceRegistered, { token })).toBe(false);
    expect(await f.call(targets)).toEqual([]);
  });
  it("rejects stale session enrollment and ignores legacy, expired or mismatched bindings", async () => {
    const f = fixture(); f.rows.get("session").expirationTime = 1;
    await expect(f.call(registerDevice, { token, platform: "ios", timeZone: "UTC" })).rejects.toThrow(/session|sign in/i);
    for (const sessionId of [undefined, "session", "missing"]) {
      f.seed("expoPushTokens", "token", { userId: "user", token, timeZone: "UTC", ...(sessionId ? { sessionId } : {}) });
      expect(await f.call(targets)).toEqual([]);
    }
    f.rows.get("session").expirationTime = Date.now() + 60_000;
    f.rows.get("session").userId = "other";
    f.rows.get("token").sessionId = "session";
    expect(await f.call(targets)).toEqual([]);
  });
  it("explicit opt-out removes only this user's binding", async () => {
    const f = fixture();
    await f.call(registerDevice, { token, platform: "ios", timeZone: "UTC" });
    f.signIn("other|other-session"); await f.call(unregisterDevice, { token });
    expect(f.all("expoPushTokens")).toHaveLength(1);
    f.signIn("user|session"); await f.call(unregisterDevice, { token });
    expect(await f.call(targets)).toEqual([]);
  });
  it("never includes private previews even if a send was already planned before withdrawal", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) });
    vi.stubGlobal("fetch", fetch);
    const ctx = {
      runQuery: async (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "pushAlerts:targets"
        ? [{ userId: "user", tokens: [token], timeZone: "UTC" }]
        : { alerts: [{ key: "synthetic", title: "Private debt name", body: "Private amount 999 EUR", url: "/item/debt/private" }], sentKeys: [], sentToday: 0, hour: 12 },
      runMutation: vi.fn(),
    };
    await (sendDue as unknown as { _handler: (ctx: unknown, args: object) => Promise<unknown> })._handler(ctx, {});
    expect(fetch).toHaveBeenCalledTimes(1);
    const messages = JSON.parse(fetch.mock.calls[0][1].body);
    expect(messages).toEqual([{ to: token, title: "Numa Pro", body: "Open Numa Pro to review your alerts.", sound: "default", data: { url: "/" } }]);
    expect(JSON.stringify(messages)).not.toMatch(/Private|999|debt/);
  });
});
