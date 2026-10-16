/**
 * Checks an identity token from the native Sign in with Apple sheet. Apple signs it with one of
 * its published keys; we accept it only for this app's bundle ID, while fresh, and when its nonce
 * is the hash of the one-time value the app created for this sign-in.
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
/** A token older than this is refused even if Apple says it is still valid. */
const MAX_AGE_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 60;

export type AppleJwk = { kty: string; kid: string; alg?: string; n: string; e: string; use?: string };
export type AppleIdentity = { sub: string; email: string | null; emailVerified: boolean; privateEmail: boolean };

const decoder = new TextDecoder();

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new Error("bad token");
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("bad token"); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(part: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(decoder.decode(base64UrlBytes(part))); } catch { throw new Error("bad token"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad token");
  return value as Record<string, unknown>;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Apple sends booleans as booleans or as the strings "true" and "false". */
const truthy = (value: unknown) => value === true || value === "true";

export async function verifyAppleIdentityToken(
  token: string,
  opts: { audience: string | string[]; nonce: string; keys: AppleJwk[]; now: number },
): Promise<AppleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const [headPart, bodyPart, signaturePart] = parts;
  const head = json(headPart);
  if (head.alg !== "RS256" || typeof head.kid !== "string") throw new Error("bad token");
  const jwk = opts.keys.find((k) => k.kid === head.kid && k.kty === "RSA");
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${headPart}.${bodyPart}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(signaturePart), signed);
  if (!ok) throw new Error("bad signature");

  const claims = json(bodyPart);
  const now = Math.floor(opts.now / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== APPLE_ISSUER) throw new Error("wrong issuer");
  const accepted = Array.isArray(opts.audience) ? opts.audience : [opts.audience];
  if (!audiences.some((a: unknown) => accepted.includes(a as string))) throw new Error("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) throw new Error("expired");
  if (typeof claims.iat !== "number" || claims.iat - CLOCK_SKEW_SECONDS > now || now - claims.iat > MAX_AGE_SECONDS) throw new Error("stale");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("bad token");
  if (!opts.nonce || claims.nonce !== (await sha256Hex(opts.nonce))) throw new Error("wrong nonce");

  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.trim().toLowerCase() : null;
  return { sub: claims.sub, email, emailVerified: email !== null && truthy(claims.email_verified), privateEmail: truthy(claims.is_private_email) };
}
