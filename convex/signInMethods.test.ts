// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { attachPassword, beginLink, finishLink, linkForState, mine, startGoogleLink, unlink } from "./signInMethods";
import { googleCallback, start } from "./googleLink";
import { privacyFixture } from "../src/test/privacyFixture";
import { LINK_FRESH_MS, LINK_STATE_PREFIX, readGoogleIdToken } from "./lib/googleLink";

const NOW = 1_800_000_000_000;
const CLIENT = "google-client.apps.googleusercontent.com";
type Fixture = ReturnType<typeof privacyFixture>;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.stubEnv("AUTH_GOOGLE_ID", CLIENT);
  vi.stubEnv("AUTH_GOOGLE_SECRET", "dummy-google-secret");
  vi.stubEnv("CONVEX_SITE_URL", "https://numa-test.convex.site");
  vi.stubEnv("SITE_URL", "https://numaworth.com");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** One account ("user") with Apple, signed in through a session made `age` ms ago. */
function account(age = 60_000) {
  const f = privacyFixture();
  f.seed("authSessions", "session", { userId: "user", expirationTime: NOW + 86_400_000 });
  f.rows.get("session")._creationTime = NOW - age;
  f.signIn("user|session");
  f.seed("authAccounts", "apple-1", { userId: "user", provider: "apple-native", providerAccountId: "apple-sub", emailVerified: "me@privaterelay.appleid.com" });
  return f;
}
const links = (f: Fixture) => f.all("signInLinks");
const googleRows = (f: Fixture) => f.all("authAccounts").filter((a) => a.provider === "google");

function idToken(claims: Record<string, unknown>) {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ iss: "https://accounts.google.com", aud: CLIENT, exp: NOW / 1000 + 600, sub: "google-sub", email: "Me@Example.org", email_verified: true, ...claims })}.sig`;
}

/** Runs the HTTP flow against the fixture: the app's start link, the browser at Google, Google's callback. */
function http(f: Fixture) {
  const handlers: Record<string, any> = { "signInMethods:beginLink": beginLink, "signInMethods:finishLink": finishLink, "signInMethods:linkForState": linkForState };
  const ctx = {
    runMutation: (ref: any, args: any) => f.call(handlers[getFunctionName(ref)], args),
    runQuery: (ref: any, args: any) => f.call(handlers[getFunctionName(ref)], args),
  };
  const authCallback = { _handler: vi.fn(async () => new Response("convex-auth", { status: 302 })) };
  const callback = googleCallback(authCallback as any);
  const get = (handler: any, url: string, cookie?: string): Promise<Response> =>
    handler._handler(ctx, new Request(url, { headers: cookie ? { Cookie: cookie } : {} }));
  return {
    authCallback,
    open: (url: string) => get(start, url),
    async begin(returnTo = "https://numaworth.com/settings") {
      const { url } = await f.call(startGoogleLink, { returnTo });
      const res = await get(start, url);
      const google = new URL(res.headers.get("Location")!);
      const cookie = res.headers.get("Set-Cookie")!.split(";")[0]!;
      return { res, google, cookie, state: google.searchParams.get("state")! };
    },
    callback: (query: string, cookie?: string) => get(callback, `https://numa-test.convex.site/api/auth/callback/google?${query}`, cookie),
  };
}

function googleTokenEndpoint(body: object, ok = true) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 400 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("sign-in methods list", () => {
  it("shows each way in with its own address, Apple once, and nothing secret", async () => {
    const f = account();
    f.seed("authAccounts", "apple-legacy", { userId: "user", provider: "apple", providerAccountId: "apple-sub" });
    f.seed("authAccounts", "google-1", { userId: "user", provider: "google", providerAccountId: "google-sub", emailVerified: "me@example.org" });
    f.seed("authAccounts", "other", { userId: "someone-else", provider: "google", providerAccountId: "x" });
    const result = await f.call(mine);
    expect(result.methods).toEqual([
      { id: "apple-1", kind: "apple", label: "me@privaterelay.appleid.com", removable: false },
      { id: "google-1", kind: "google", label: "me@example.org", removable: true },
    ]);
    expect(result).toMatchObject({ apple: true, google: true, password: false, canAddGoogle: true });
    expect(JSON.stringify(result)).not.toMatch(/google-sub|apple-sub|secret/);
    f.signIn(null);
    expect(await f.call(mine)).toBeNull();
  });

  it("never offers to remove the last way in", async () => {
    const f = privacyFixture();
    f.seed("authAccounts", "google-1", { userId: "user", provider: "google", providerAccountId: "google-sub" });
    expect((await f.call(mine)).methods).toEqual([{ id: "google-1", kind: "google", label: null, removable: false }]);
    await expect(f.call(unlink, { accountId: "google-1" })).rejects.toThrow(/only way to sign in/);
    expect(googleRows(f)).toHaveLength(1);
  });
});

describe("Add Google", () => {
  it("asks for a fresh sign-in when the session is older than the limit", async () => {
    const f = account(LINK_FRESH_MS + 1);
    await expect(f.call(startGoogleLink, { returnTo: "numa://auth" })).rejects.toThrow(/Confirm it’s you/);
    expect(links(f)).toHaveLength(0);
  });

  it("refuses return addresses outside the app and Numa's sites", async () => {
    const f = account();
    await expect(f.call(startGoogleLink, { returnTo: "https://evil.example/settings" })).rejects.toThrow(/isn’t allowed/);
  });

  it("links a Google account with a different email to the signed-in account, keyed on Google's subject", async () => {
    const f = account();
    const h = http(f);
    const { google, cookie, state } = await h.begin();
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("redirect_uri")).toBe("https://numa-test.convex.site/api/auth/callback/google");
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state.startsWith(LINK_STATE_PREFIX)).toBe(true);
    expect(cookie).toMatch(/^__Host-numa-google-link=./);
    // Stored hashed: the row never holds the state or the browser binder.
    expect(JSON.stringify(links(f))).not.toContain(state.slice(LINK_STATE_PREFIX.length));
    expect(JSON.stringify(links(f))).not.toContain(cookie.split("=")[1]);

    const fetch = googleTokenEndpoint({ id_token: idToken({}) });
    const res = await h.callback(`state=${encodeURIComponent(state)}&code=auth-code`, cookie);
    expect(res.headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=linked");
    const sent = new URLSearchParams(String(fetch.mock.calls[0]![1].body));
    expect(sent.get("code_verifier")).toBeTruthy();
    expect(sent.get("redirect_uri")).toBe("https://numa-test.convex.site/api/auth/callback/google");
    expect(googleRows(f)).toEqual([expect.objectContaining({ userId: "user", provider: "google", providerAccountId: "google-sub", emailVerified: "me@example.org" })]);
    expect(links(f)).toHaveLength(0);
    // The account keeps its own email, and the person stays signed in on the same session.
    expect(f.rows.get("user").email).toBe("qa@example.com");
    expect(f.all("authSessions")).toHaveLength(1);
    expect(h.authCallback._handler).not.toHaveBeenCalled();
  });

  it("refuses a Google account that already opens another Numa Pro account, and reveals nothing about it", async () => {
    const f = account();
    f.seed("authAccounts", "theirs", { userId: "other-user", provider: "google", providerAccountId: "google-sub" });
    const h = http(f);
    const { cookie, state } = await h.begin();
    googleTokenEndpoint({ id_token: idToken({}) });
    const res = await h.callback(`state=${encodeURIComponent(state)}&code=c`, cookie);
    expect(res.headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=taken");
    expect(googleRows(f)).toEqual([expect.objectContaining({ userId: "other-user" })]);
  });

  it("says so when that Google account is already linked here", async () => {
    const f = account();
    f.seed("authAccounts", "mine", { userId: "user", provider: "google", providerAccountId: "google-sub" });
    const h = http(f);
    const { cookie, state } = await h.begin("numa://auth");
    googleTokenEndpoint({ id_token: idToken({}) });
    expect((await h.callback(`state=${encodeURIComponent(state)}&code=c`, cookie)).headers.get("Location")).toBe("numa://auth?googleLink=already");
    expect(googleRows(f)).toHaveLength(1);
  });

  it("does nothing when the person cancels at Google", async () => {
    const f = account();
    const h = http(f);
    const { cookie, state } = await h.begin();
    const fetch = googleTokenEndpoint({});
    const res = await h.callback(`state=${encodeURIComponent(state)}&error=access_denied`, cookie);
    expect(res.headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=cancelled");
    expect(fetch).not.toHaveBeenCalled();
    expect(googleRows(f)).toHaveLength(0);
  });

  it("fails closed when Google's token endpoint errors or returns another app's identity", async () => {
    const cases: Array<[object, boolean]> = [
      [{ error: "invalid_grant" }, false],
      [{ id_token: idToken({ aud: "someone-else" }) }, true],
      [{ id_token: idToken({ iss: "https://evil.example" }) }, true],
    ];
    for (const [body, ok] of cases) {
      const f = account();
      const h = http(f);
      const { cookie, state } = await h.begin();
      googleTokenEndpoint(body, ok);
      expect((await h.callback(`state=${encodeURIComponent(state)}&code=c`, cookie)).headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=failed");
      expect(googleRows(f)).toHaveLength(0);
    }
  });

  it("cannot be finished from another browser, even with the right state", async () => {
    const f = account();
    const h = http(f);
    const { state } = await h.begin();
    const fetch = googleTokenEndpoint({ id_token: idToken({}) });
    const res = await h.callback(`state=${encodeURIComponent(state)}&code=c`, "__Host-numa-google-link=attacker");
    expect(res.headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=failed");
    expect(fetch).not.toHaveBeenCalled();
    expect(googleRows(f)).toHaveLength(0);
    // The attempt is used up: a replay finds nothing.
    expect((await h.callback(`state=${encodeURIComponent(state)}&code=c`)).status).toBe(400);
  });

  it("start links work once, and a session that ended meanwhile cannot complete", async () => {
    const f = account();
    const { url } = await f.call(startGoogleLink, { returnTo: "numa://auth" });
    const h = http(f);
    expect((await h.open(url)).status).toBe(302);
    expect((await h.open(url)).headers.get("Location")).toBe("numa://auth?googleLink=expired");

    const g = account();
    const hg = http(g);
    const { cookie, state } = await hg.begin();
    await g.call({ _handler: async (ctx: any) => ctx.db.delete("session") });
    googleTokenEndpoint({ id_token: idToken({}) });
    expect((await hg.callback(`state=${encodeURIComponent(state)}&code=c`, cookie)).headers.get("Location")).toBe("https://numaworth.com/settings?googleLink=expired");
    expect(googleRows(g)).toHaveLength(0);
  });

  it("starting again replaces an unfinished attempt", async () => {
    const f = account();
    const first = await f.call(startGoogleLink, { returnTo: "numa://auth" });
    await f.call(startGoogleLink, { returnTo: "numa://auth" });
    expect(links(f)).toHaveLength(1);
    expect((await http(f).open(first.url)).status).toBe(400);
  });

  it("hands every ordinary Google sign-in callback to Convex Auth untouched", async () => {
    const h = http(account());
    const res = await h.callback("state=plain-convex-auth-state&code=c");
    expect(await res.text()).toBe("convex-auth");
    expect(h.authCallback._handler).toHaveBeenCalledTimes(1);
  });
});

describe("removing Google", () => {
  it("removes a linked Google account while another way in remains", async () => {
    const f = account();
    f.seed("authAccounts", "google-1", { userId: "user", provider: "google", providerAccountId: "google-sub" });
    f.seed("authVerificationCodes", "code-1", { accountId: "google-1", provider: "google", code: "h", expirationTime: NOW + 1 });
    await f.call(unlink, { accountId: "google-1" });
    expect(googleRows(f)).toHaveLength(0);
    expect(f.all("authVerificationCodes")).toHaveLength(0);
    expect(f.all("authAccounts")).toHaveLength(1);
  });

  it("cannot remove someone else's method or Apple", async () => {
    const f = account();
    f.seed("authAccounts", "google-1", { userId: "user", provider: "google", providerAccountId: "google-sub" });
    f.seed("authAccounts", "theirs", { userId: "other-user", provider: "google", providerAccountId: "g2" });
    await expect(f.call(unlink, { accountId: "theirs" })).rejects.toThrow(/isn’t on this account/);
    await expect(f.call(unlink, { accountId: "apple-1" })).rejects.toThrow(/Only a Google account/);
    expect(f.all("authAccounts")).toHaveLength(3);
  });
});

describe("Google ID token checks", () => {
  it("accepts Google's issuer and this app's audience only", () => {
    expect(readGoogleIdToken(idToken({}), CLIENT, NOW)).toEqual({ subject: "google-sub", email: "me@example.org", emailVerified: true });
    expect(() => readGoogleIdToken(idToken({ exp: NOW / 1000 - 3600 }), CLIENT, NOW)).toThrow(/expired/);
    expect(() => readGoogleIdToken(idToken({ sub: "" }), CLIENT, NOW)).toThrow(/no identity/);
    expect(() => readGoogleIdToken("nope", CLIENT, NOW)).toThrow(/no identity/);
  });
});

describe("password", () => {
  it("adds a password to the signed-in account's own email, already verified when its email is", async () => {
    const f = privacyFixture();
    f.rows.get("user").email = "Me@Example.com";
    f.rows.get("user").emailVerificationTime = 1;
    await f.call(attachPassword, { userId: "user", secret: "hash" });
    expect(f.all("authAccounts")).toEqual([expect.objectContaining({ userId: "user", provider: "password", providerAccountId: "me@example.com", secret: "hash", emailVerified: "me@example.com" })]);
  });

  it("refuses a second password, an email another account uses, and an account without email", async () => {
    const a = privacyFixture();
    a.seed("authAccounts", "p", { userId: "user", provider: "password", providerAccountId: "qa@example.com" });
    await expect(a.call(attachPassword, { userId: "user", secret: "h" })).rejects.toThrow(/already has a password/);
    const b = privacyFixture();
    b.seed("authAccounts", "p", { userId: "u2", provider: "password", providerAccountId: "qa@example.com" });
    await expect(b.call(attachPassword, { userId: "user", secret: "h" })).rejects.toThrow(/Another Numa Pro account/);
    const c = privacyFixture();
    delete c.rows.get("user").email;
    await expect(c.call(attachPassword, { userId: "user", secret: "h" })).rejects.toThrow(/no email/);
  });
});
