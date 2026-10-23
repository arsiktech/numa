import { verifyAppleIdentityToken, type AppleIdentity, type AppleJwk } from "./appleIdentity";

export const APPLE_CLIENTS = ["com.arsiktech.numa", "com.arsiktech.numa.web"] as const;
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
export const APPLE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const APPLE_REPLAY_MS = 11 * 60 * 1000;
export type AppleConfig = { team: string; kid: string; privateKey: string; encryptionKey: string };
export type AppleEnvelope = { iv: string; ciphertext: string };
const enc = new TextEncoder();
export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Parse lazily. Invalid Apple configuration must not break email or Google. */
export function appleConfig(env: Record<string, string | undefined>): AppleConfig | null {
  const { APPLE_TEAM_ID: team, APPLE_KEY_ID: kid, APPLE_PRIVATE_KEY: privateKey, APPLE_TOKEN_ENCRYPTION_KEY: encryptionKey } = env;
  if (!team || !kid || !privateKey || !encryptionKey) return null;
  try {
    if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Z0-9]{10}$/.test(kid) || bytes(encryptionKey).length !== 32 || !privateKey.includes("BEGIN PRIVATE KEY")) return null;
    return { team, kid, privateKey, encryptionKey };
  } catch { return null; }
}
export async function validatedAppleConfig(env: Record<string, string | undefined>): Promise<AppleConfig | null> {
  const config = appleConfig(env);
  if (!config) return null;
  try { await signingKey(config); return config; }
  catch { return null; }
}
/** Import validates PKCS8/P-256 without random signing, so readiness is query-safe. */
async function signingKey(config: AppleConfig) {
  const raw = config.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return crypto.subtle.importKey("pkcs8", bytes(raw), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
export async function clientSecret(config: AppleConfig, audience: string, now: number): Promise<string> {
  if (!(APPLE_CLIENTS as readonly string[]).includes(audience)) throw new Error("Unsupported Apple audience");
  const key = await signingKey(config);
  const iat = Math.floor(now / 1000);
  const head = url(enc.encode(JSON.stringify({ alg: "ES256", kid: config.kid })));
  const body = url(enc.encode(JSON.stringify({ iss: config.team, sub: audience, aud: "https://appleid.apple.com", iat, exp: iat + 300 })));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${url(new Uint8Array(signature))}`;
}
const aad = (subjectHash: string, audience: string) => enc.encode(JSON.stringify([1, subjectHash, audience]));
async function encryptionKey(config: AppleConfig) {
  return crypto.subtle.importKey("raw", bytes(config.encryptionKey), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealAppleToken(token: string, subjectHash: string, audience: string, config: AppleConfig): Promise<AppleEnvelope> {
  if (!token || token.length > 8000) throw new Error("Invalid Apple refresh token");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(subjectHash, audience) }, await encryptionKey(config), enc.encode(token));
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) };
}
export async function openAppleToken(envelope: AppleEnvelope, subjectHash: string, audience: string, config: AppleConfig): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv), additionalData: aad(subjectHash, audience) }, await encryptionKey(config), bytes(envelope.ciphertext));
  return new TextDecoder().decode(decrypted);
}
export async function exchangeAppleCode(code: string, identity: AppleIdentity, nonce: string, config: AppleConfig, keys: AppleJwk[], now: number, redirectURI?: string): Promise<string> {
  if (!code || code.length > 2000) throw new Error("Apple authorization code required");
  const params = new URLSearchParams({ client_id: identity.audience, client_secret: await clientSecret(config, identity.audience, now), code, grant_type: "authorization_code" });
  if (identity.audience === APPLE_CLIENTS[1]) {
    if (!["https://numaworth.com", "https://www.numaworth.com", "https://numa-pro.pages.dev"].includes(redirectURI ?? "")) throw new Error("Invalid Apple redirect");
    params.set("redirect_uri", redirectURI!);
  } else if (redirectURI) throw new Error("Unexpected Apple redirect");
  const response = await fetch(APPLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Apple authorization exchange failed");
  const body = await response.json() as { id_token?: string; refresh_token?: string };
  if (typeof body.id_token !== "string" || body.id_token.length > 8000) throw new Error("Missing Apple exchange identity");
  const returned = await verifyAppleIdentityToken(body.id_token, { audience: identity.audience, nonce, keys, now });
  if (returned.sub !== identity.sub || returned.audience !== identity.audience) throw new Error("Apple exchange identity mismatch");
  if (typeof body.refresh_token !== "string" || !body.refresh_token || body.refresh_token.length > 8000) throw new Error("Missing Apple refresh token");
  return body.refresh_token;
}
/** Apple invalid_token is terminal and idempotent. Other failures remain retryable. */
export async function revokeAppleToken(token: string, audience: string, config: AppleConfig, now: number): Promise<boolean> {
  const params = new URLSearchParams({ client_id: audience, client_secret: await clientSecret(config, audience, now), token, token_type_hint: "refresh_token" });
  const response = await fetch(APPLE_REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(), signal: AbortSignal.timeout(10000) });
  if (response.ok) return true;
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error === "invalid_token";
}
