import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import { sha256Hex } from "./lib/appleIdentity";
import {
  GOOGLE_TOKEN_URL, LINK_COOKIE, LINK_STATE_PREFIX, LINK_TTL_MS, googleAuthorizeUrl, googleRedirectUri,
  pkceChallenge, randomToken, readCookie, readGoogleIdToken, returnWithResult, type LinkResult,
} from "./lib/googleLink";

declare const process: { env: Record<string, string | undefined> };

/**
 * "Add Google" over HTTP. The signed-in app gets a single-use start link from
 * signInMethods:startGoogleLink and opens it in the browser (or the phone's sign-in sheet):
 *
 *   /link/google/start?t=…  -> binds a cookie, state and PKCE, then sends the browser to Google
 *   /api/auth/callback/google?state=numalink1.…  -> finishes here; every other state goes to Convex Auth
 *
 * The callback path is the redirect URI already registered for Google sign-in, so no provider
 * settings change. Nothing here creates a session: the person stays signed in as they were.
 */

const cookie = (value: string, maxAgeSeconds: number) =>
  `${LINK_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

function page(status: number, message: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Numa Pro</title>` +
    `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5"><h1 style="font-size:1.25rem">Numa Pro</h1><p>${message}</p></body>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": cookie("", 0) } });
}

function back(returnTo: string, result: LinkResult): Response {
  return new Response(null, { status: 302, headers: { Location: returnWithResult(returnTo, result), "Cache-Control": "no-store", "Set-Cookie": cookie("", 0) } });
}

export const start = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("t");
  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!token || token.length > 200 || !clientId) return page(400, "This link has expired. Go back to Numa Pro and try Add Google again.");
  const state = `${LINK_STATE_PREFIX}${randomToken()}`;
  const binder = randomToken();
  const codeVerifier = randomToken(48);
  const begun = await ctx.runMutation(internal.signInMethods.beginLink, {
    startHash: await sha256Hex(token), stateHash: await sha256Hex(state), binderHash: await sha256Hex(binder), codeVerifier,
  });
  if (!begun.ok) return begun.returnTo ? back(begun.returnTo, "expired") : page(400, "This link has expired. Go back to Numa Pro and try Add Google again.");
  const location = googleAuthorizeUrl({ clientId, redirectUri: googleRedirectUri(process.env), state, challenge: await pkceChallenge(codeVerifier) });
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Set-Cookie": cookie(binder, Math.floor(LINK_TTL_MS / 1000)) } });
});

/** Ours when the state carries the link prefix; Convex Auth's own sign-in callback otherwise. */
export function googleCallback(authCallback: PublicHttpAction) {
  const delegate = (authCallback as unknown as { _handler: (ctx: unknown, request: Request) => Promise<Response> })._handler;
  return httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    if (!state || !state.startsWith(LINK_STATE_PREFIX)) return delegate(ctx, request);
    const stateHash = await sha256Hex(state);
    const binder = readCookie(request.headers.get("Cookie"), LINK_COOKIE) ?? "";
    const binderHash = await sha256Hex(binder);
    const finish = async (args: { identity?: { subject: string; email: string | null; emailVerified: boolean }; outcome?: "cancelled" | "failed" }) => {
      const { result, returnTo } = await ctx.runMutation(internal.signInMethods.finishLink, { stateHash, binderHash, ...args });
      return returnTo ? back(returnTo, result) : page(400, "This link has expired. Go back to Numa Pro and try Add Google again.");
    };
    const pending = await ctx.runQuery(internal.signInMethods.linkForState, { stateHash });
    if (!pending) return page(400, "This link has expired. Go back to Numa Pro and try Add Google again.");
    // A different browser than the one that started cannot finish, even with the right state.
    if (!binder || pending.binderHash !== binderHash) return finish({ outcome: "failed" });
    if (params.get("error")) return finish({ outcome: params.get("error") === "access_denied" ? "cancelled" : "failed" });
    const code = params.get("code");
    const clientId = process.env.AUTH_GOOGLE_ID, clientSecret = process.env.AUTH_GOOGLE_SECRET;
    if (!code || code.length > 2000 || !clientId || !clientSecret || pending.expiresAt <= Date.now()) return finish({ outcome: "failed" });
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, redirect_uri: googleRedirectUri(process.env),
          client_id: clientId, client_secret: clientSecret, code_verifier: pending.codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return finish({ outcome: "failed" });
      const body = (await res.json()) as { id_token?: unknown };
      return finish({ identity: readGoogleIdToken(body.id_token, clientId, Date.now()) });
    } catch {
      return finish({ outcome: "failed" });
    }
  });
}
