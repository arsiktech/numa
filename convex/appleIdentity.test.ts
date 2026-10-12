import { describe, expect, it } from "vitest";
import { sha256Hex, verifyAppleIdentityToken, type AppleJwk } from "./lib/appleIdentity";
import { allowedRedirect } from "./lib/authRedirect";

const AUD = "com.arsiktech.numa";
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const sec = Math.floor(NOW / 1000);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function keypair(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { privateKey: pair.privateKey, jwk: { kty: "RSA", kid, alg: "RS256", use: "sig", n: pub.n!, e: pub.e! } as AppleJwk };
}

async function sign(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>) {
  const head = text({ alg: "RS256", kid });
  const body = text(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

describe("verifyAppleIdentityToken", async () => {
  const apple = await keypair("A1");
  const other = await keypair("A1");
  const nonce = "one-time-value";
  const claims = async (extra: Record<string, unknown> = {}) => ({
    iss: "https://appleid.apple.com", aud: AUD, sub: "001234.abc", iat: sec - 30, exp: sec + 600,
    nonce: await sha256Hex(nonce), email: "Person@Example.com", email_verified: "true", ...extra,
  });
  const check = (token: string, opts: Partial<{ nonce: string; keys: AppleJwk[]; now: number }> = {}) =>
    verifyAppleIdentityToken(token, { audience: AUD, nonce, keys: [apple.jwk], now: NOW, ...opts });

  it("accepts a fresh token for this app and reads the verified email", async () => {
    const token = await sign(apple.privateKey, "A1", await claims());
    await expect(check(token)).resolves.toEqual({ sub: "001234.abc", email: "person@example.com", emailVerified: true, privateEmail: false });
  });

  it("marks a hidden relay address so it never links to another account", async () => {
    const token = await sign(apple.privateKey, "A1", await claims({ email: "x@privaterelay.appleid.com", is_private_email: true, email_verified: true }));
    await expect(check(token)).resolves.toMatchObject({ privateEmail: true, emailVerified: true });
  });

  it("refuses a token signed by anyone but Apple", async () => {
    const token = await sign(other.privateKey, "A1", await claims());
    await expect(check(token)).rejects.toThrow("bad signature");
  });

  it("refuses a token with a key it doesn't know, so the caller can refresh Apple's keys", async () => {
    const token = await sign(apple.privateKey, "B2", await claims());
    await expect(check(token)).rejects.toThrow("unknown key");
  });

  it("refuses another app's token, another issuer, an old token and a changed claim", async () => {
    await expect(check(await sign(apple.privateKey, "A1", await claims({ aud: "com.example.other" })))).rejects.toThrow("wrong audience");
    await expect(check(await sign(apple.privateKey, "A1", await claims({ iss: "https://example.com" })))).rejects.toThrow("wrong issuer");
    await expect(check(await sign(apple.privateKey, "A1", await claims({ exp: sec - 120 })))).rejects.toThrow("expired");
    await expect(check(await sign(apple.privateKey, "A1", await claims({ iat: sec - 3600 })))).rejects.toThrow("stale");
    const [h, , s] = (await sign(apple.privateKey, "A1", await claims())).split(".");
    await expect(check(`${h}.${text(await claims({ sub: "someone-else" }))}.${s}`)).rejects.toThrow("bad signature");
  });

  it("refuses a token whose nonce wasn't made for this sign-in", async () => {
    const token = await sign(apple.privateKey, "A1", await claims());
    await expect(check(token, { nonce: "another-value" })).rejects.toThrow("wrong nonce");
    await expect(check(token, { nonce: "" })).rejects.toThrow("wrong nonce");
    const raw = await sign(apple.privateKey, "A1", await claims({ nonce }));
    await expect(check(raw)).rejects.toThrow("wrong nonce");
  });

  it("refuses garbage", async () => {
    await expect(check("not-a-token")).rejects.toThrow();
    await expect(check("a.b.c")).rejects.toThrow("bad token");
  });
});

describe("allowedRedirect", () => {
  const site = "https://numa.example";
  it("lets the phone apps and the site finish signing in", () => {
    expect(allowedRedirect("numanext://auth", site)).toBe("numanext://auth");
    expect(allowedRedirect("numa://auth", site)).toBe("numa://auth");
    expect(allowedRedirect("/settings", site)).toBe("https://numa.example/settings");
    expect(allowedRedirect("https://numa.example/?x=1", site)).toBe("https://numa.example/?x=1");
    expect(allowedRedirect("https://numaworth.com/", site)).toBe("https://numaworth.com/");
    expect(allowedRedirect("https://numa-pro.pages.dev", site)).toBe("https://numa-pro.pages.dev");
    expect(allowedRedirect("https://claude-branch.numa-pro.pages.dev/", site)).toBe("https://claude-branch.numa-pro.pages.dev/");
  });
  it("refuses anywhere else", () => {
    for (const bad of [
      "https://evil.example", "https://numa.example.evil.example", "//evil.example", "numanext://elsewhere",
      "otherapp://auth", "https://numa-pro.pages.dev.evil.example", "http://numa-pro.pages.dev", "https://evil.pages.dev", "javascript:alert(1)", "https://numaworth.com.evil.example", "http://numaworth.com",
    ]) expect(() => allowedRedirect(bad, site), bad).toThrow("Invalid redirectTo");
  });
  it("works without a site URL", () => {
    expect(allowedRedirect("numanext://auth", "")).toBe("numanext://auth");
    expect(() => allowedRedirect("https://numa.example", "")).toThrow();
  });
});
