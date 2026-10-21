// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
let signing: CryptoKeyPair;
let jwk: JsonWebKey;
beforeAll(async () => {
  signing = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  jwk = await crypto.subtle.exportKey("jwk", signing.publicKey);
});
beforeEach(() => { vi.resetModules(); vi.stubEnv("APPLE_NOTIFICATIONS_ENABLED", "true"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function event(extra: Record<string, unknown> = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const head = encode({ alg: "RS256", kid: "synthetic-notification-key" });
  const body = encode({ iss: "https://appleid.apple.com", aud: "com.arsiktech.numa", iat: seconds, exp: seconds + 600, jti: "synthetic-event-id", events: JSON.stringify({ type: "consent-revoked", sub: "synthetic-apple-subject", event_time: seconds }), ...extra });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signing.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
}
async function fixture() {
  const fetcher = vi.fn(async (input: string) => {
    expect(input).toBe("https://appleid.apple.com/auth/keys");
    return new Response(JSON.stringify({ keys: [{ ...jwk, kty: "RSA", kid: "synthetic-notification-key" }] }));
  });
  vi.stubGlobal("fetch", fetcher);
  const { receive } = await import("./appleNotifications");
  const mutation = vi.fn(async () => null);
  return { fetcher, mutation, call: (body: string) => (receive as any)._handler({ runMutation: mutation }, new Request("http://127.0.0.1/apple/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body })) as Promise<Response> };
}
describe("registered Apple notification endpoint", () => {
  it("stays disabled without explicit rollout configuration and performs no provider or account work", async () => {
    vi.stubEnv("APPLE_NOTIFICATIONS_ENABLED", ""); const f = await fixture();
    expect((await f.call(JSON.stringify({ payload: await event() }))).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.mutation).not.toHaveBeenCalled();
  });
  it("accepts a valid signed fixture only when explicitly enabled", async () => {
    const f = await fixture(); expect((await f.call(JSON.stringify({ payload: await event() }))).status).toBe(200);
    expect(f.mutation).toHaveBeenCalledTimes(1);
    const [ref, args] = f.mutation.mock.calls[0] as unknown as [any, any];
    expect(getFunctionName(ref)).toBe("users:deleteForAppleRevocation");
    expect(args).toMatchObject({ subject: "synthetic-apple-subject", audience: "com.arsiktech.numa", eventId: "synthetic-event-id" });
    expect(args.at).toBeGreaterThan(Date.now() - 2000);
    expect(JSON.stringify(args)).not.toContain("payload");
  });
  it.each(["{", JSON.stringify({ payload: 7 })])("rejects malformed input without looking up provider keys", async body => {
    const f = await fixture(); expect((await f.call(body)).status).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.mutation).not.toHaveBeenCalled();
  });
  it("rejects wrong audience and tampered signatures without deleting an account", async () => {
    const f = await fixture();
    expect((await f.call(JSON.stringify({ payload: await event({ aud: "other-app" }) }))).status).toBe(400);
    const parts = (await event()).split(".");
    const signature = Buffer.from(parts[2], "base64url"); signature[0] ^= 1; parts[2] = signature.toString("base64url");
    expect((await f.call(JSON.stringify({ payload: parts.join(".") }))).status).toBe(400);
    expect(f.mutation).not.toHaveBeenCalled();
  });
  it("ignores a verified non-destructive email event", async () => {
    const f = await fixture();
    expect((await f.call(JSON.stringify({ payload: await event({ events: { type: "email-disabled" } }) }))).status).toBe(200);
    expect(f.mutation).not.toHaveBeenCalled();
  });
  it("does not invoke deletion when provider keys are unavailable", async () => {
    const f = await fixture(); f.fetcher.mockRejectedValueOnce(new Error("synthetic offline"));
    expect((await f.call(JSON.stringify({ payload: await event() }))).status).not.toBe(200);
    expect(f.mutation).not.toHaveBeenCalled();
  });
});
