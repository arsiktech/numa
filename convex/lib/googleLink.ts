/**
 * Pure pieces of "add Google to the signed-in account". The flow itself is in
 * convex/googleLink.ts (HTTP) and convex/signInMethods.ts (database).
 *
 * Why a separate flow: during Google's callback the pinned Convex Auth SDK does not tell
 * createOrUpdateUser which signed-in session started the sign-in, so a normal "Continue with
 * Google" can only find or create an account, never attach to the current one. Linking runs
 * its own authorization-code + PKCE round trip on the same registered redirect URI, told
 * apart by its `state` prefix, and keys the link on Google's stable `sub`, never on email.
 */

/** A link must start within this long of signing in. Owner decision: "a few minutes". */
export const LINK_FRESH_MS = 5 * 60 * 1000;
/** A started link must come back from Google within this long. */
export const LINK_TTL_MS = 10 * 60 * 1000;
/** Every Convex Auth state is a bare random string; ours always starts with this. */
export const LINK_STATE_PREFIX = "numalink1.";
export const LINK_COOKIE = "__Host-numa-google-link";
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type LinkResult = "linked" | "already" | "taken" | "cancelled" | "expired" | "failed";

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** The redirect URI Google already knows: Convex Auth's own callback for the `google` provider. */
export function googleRedirectUri(env: Record<string, string | undefined>): string {
  const site = env.CUSTOM_AUTH_SITE_URL ?? env.CONVEX_SITE_URL;
  if (!site) throw new Error("CONVEX_SITE_URL is not set");
  return `${site}/api/auth/callback/google`;
}

export function googleAuthorizeUrl(args: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Always let the person pick which Google account to add, even if one is signed in already.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type GoogleIdentity = { subject: string; email: string | null; emailVerified: boolean };

/**
 * Reads the ID token Google returned straight from its token endpoint over TLS to our
 * confidential client. OpenID Connect Core 3.1.3.7 allows trusting that channel instead of a
 * signature check; issuer, audience, expiry and subject are still checked here.
 */
export function readGoogleIdToken(idToken: unknown, clientId: string, now: number): GoogleIdentity {
  if (typeof idToken !== "string" || idToken.length > 8000) throw new Error("Google returned no identity");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Google returned no identity");
  let claims: Record<string, unknown>;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  } catch {
    throw new Error("Google returned no identity");
  }
  if (!GOOGLE_ISSUERS.has(String(claims.iss))) throw new Error("Unexpected Google issuer");
  const aud = claims.aud;
  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId)))) throw new Error("Google identity is for another app");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now - 60_000) throw new Error("Google identity expired");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new Error("Google returned no identity");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  return { subject: claims.sub, email, emailVerified: claims.email_verified === true || claims.email_verified === "true" };
}

/** Where the person lands afterwards, carrying only the outcome word. */
export function returnWithResult(returnTo: string, result: LinkResult): string {
  const sep = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${sep}googleLink=${result}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
