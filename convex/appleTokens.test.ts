// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appleConfig, validatedAppleConfig, b64, clientSecret, exchangeAppleCode, openAppleToken, revokeAppleToken, sealAppleToken, type AppleConfig } from "./lib/appleTokens";
import { verifyAppleRevocationEvent } from "./lib/appleNotifications";
import { sha256Hex, verifyAppleIdentityToken, type AppleJwk } from "./lib/appleIdentity";
const NOW = Date.UTC(2026, 9, 21, 10);
const AUD = "com.arsiktech.numa";
const nonce = "dummy-one-time-nonce";
const u = (b: Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text = (v: unknown) => u(new TextEncoder().encode(JSON.stringify(v)));
let config: AppleConfig, privateKey: CryptoKey, jwk: AppleJwk;
async function token(extra: Record<string, unknown> = {}) {
  const h = text({ alg: "RS256", kid: "dummy-rsa" });
  const b = text({ iss: "https://appleid.apple.com", aud: AUD, sub: "dummy-apple-subject", iat: NOW / 1000, exp: NOW / 1000 + 600, nonce: await sha256Hex(nonce), ...extra });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${b}`));
  return `${h}.${b}.${u(new Uint8Array(sig))}`;
}
beforeAll(async () => {
  const rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = rsa.privateKey;
  const pub = await crypto.subtle.exportKey("jwk", rsa.publicKey);
  jwk = { kty: "RSA", kid: "dummy-rsa", n: pub.n!, e: pub.e! };
  const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pem = b64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", ec.privateKey)));
  config = { team: "DUMMYTEAM1", kid: "DUMMYKEY01", privateKey: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`, encryptionKey: b64(crypto.getRandomValues(new Uint8Array(32))) };
});
afterEach(() => vi.unstubAllGlobals());
describe("Apple token lifecycle, generated dummy keys and mocked fetch only", () => {
  it("validates configuration without invoking action-only signing randomness", async () => {
    const signing = vi.spyOn(crypto.subtle, "sign").mockRejectedValue(new Error("Signing randomness is unavailable in a query"));
    try {
      const result = await validatedAppleConfig({ APPLE_TEAM_ID: config.team, APPLE_KEY_ID: config.kid, APPLE_PRIVATE_KEY: config.privateKey, APPLE_TOKEN_ENCRYPTION_KEY: config.encryptionKey });
      expect(result).not.toBeNull(); expect(signing).not.toHaveBeenCalled();
    } finally { signing.mockRestore(); }
  });

  it("rejects missing/invalid config without module-load failures", async () => {
    expect(appleConfig({})).toBeNull();
    expect(appleConfig({ APPLE_TEAM_ID: "bad" })).toBeNull();
    expect(await validatedAppleConfig({ APPLE_TEAM_ID: config.team, APPLE_KEY_ID: config.kid, APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----broken", APPLE_TOKEN_ENCRYPTION_KEY: config.encryptionKey })).toBeNull();
    expect((await clientSecret(config, AUD, NOW)).split('.')).toHaveLength(3);
    await expect(clientSecret(config, "other-app", NOW)).rejects.toThrow();
  });
  it("encrypts with random IV and rejects tampering, audience and identity substitution", async () => {
    const first = await sealAppleToken("dummy-refresh-secret", "subject-hash", AUD, config);
    const second = await sealAppleToken("dummy-refresh-secret", "subject-hash", AUD, config);
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain("dummy-refresh-secret");
    expect(await openAppleToken(first, "subject-hash", AUD, config)).toBe("dummy-refresh-secret");
    await expect(openAppleToken(first, "other-subject", AUD, config)).rejects.toThrow();
    await expect(openAppleToken(first, "subject-hash", "other-app", config)).rejects.toThrow();
    await expect(openAppleToken({ ...first, ciphertext: (first.ciphertext[0] === 'A' ? 'B' : 'A') + first.ciphertext.slice(1) }, "subject-hash", AUD, config)).rejects.toThrow();
  });
  it("exchanges at the fixed endpoint with audience-scoped credentials and bound identity", async () => {
    const signed = await token();
    const identity = await verifyAppleIdentityToken(signed, { audience: AUD, nonce, keys: [jwk], now: NOW });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id_token: signed, refresh_token: "dummy-refresh" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await exchangeAppleCode("dummy-code", identity, nonce, config, [jwk], NOW)).toBe("dummy-refresh");
    expect(fetcher.mock.calls[0][0]).toBe("https://appleid.apple.com/auth/token");
    const body = new URLSearchParams((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.get("code")).toBe("dummy-code"); expect(body.get("client_id")).toBe(AUD);
    const secret = body.get("client_secret")!;
    expect(JSON.parse(atob(secret.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub).toBe(AUD);
    for (const extra of [{ sub: "other" }, { aud: "com.arsiktech.numa.web" }, { nonce: "wrong" }]) {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ id_token: await token(extra), refresh_token: "dummy" })));
      await expect(exchangeAppleCode("dummy-code", identity, nonce, config, [jwk], NOW)).rejects.toThrow();
    }
    await expect(exchangeAppleCode("", identity, nonce, config, [jwk], NOW)).rejects.toThrow(/code required/);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchangeAppleCode("bad-code", identity, nonce, config, [jwk], NOW)).rejects.toThrow(/exchange failed/);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ id_token: signed })));
    await expect(exchangeAppleCode("dummy-code", identity, nonce, config, [jwk], NOW)).rejects.toThrow(/refresh token/);
  });
  it("treats revoked tokens idempotently and retries transient provider failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })).mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await revokeAppleToken("dummy", AUD, config, NOW)).toBe(true);
    expect(await revokeAppleToken("dummy", AUD, config, NOW)).toBe(true);
    expect(await revokeAppleToken("dummy", AUD, config, NOW)).toBe(false);
    expect(fetcher.mock.calls.every(c => c[0] === "https://appleid.apple.com/auth/revoke")).toBe(true);
  });
  it("verifies signed revocation notifications and rejects forged, stale or unrelated events", async () => {
    const event = { type: "consent-revoked", sub: "dummy-apple-subject", event_time: NOW / 1000 };
    expect(await verifyAppleRevocationEvent(await token({ jti: "dummy-event", events: event }), [jwk], NOW)).toEqual({ subject: "dummy-apple-subject", audience: AUD, at: NOW, eventId: "dummy-event" });
    expect(await verifyAppleRevocationEvent(await token({ jti: "dummy-event", events: { ...event, type: "email-enabled" } }), [jwk], NOW)).toBeNull();
    for (const extra of [{ aud: "other-app" }, { iss: "https://evil.invalid" }, { iat: NOW / 1000 - 86401 }, { events: { ...event, event_time: NOW / 1000 - 86401 } }, { jti: "" }]) {
      await expect(verifyAppleRevocationEvent(await token({ jti: "dummy-event", events: event, ...extra }), [jwk], NOW)).rejects.toThrow();
    }
    const signed = await token({ jti: "dummy-event", events: event });
    const parts = signed.split('.');
    await expect(verifyAppleRevocationEvent(`${parts[0]}.${text({ aud: AUD, events: event })}.${parts[2]}`, [jwk], NOW)).rejects.toThrow(/signature/);
  });

});
