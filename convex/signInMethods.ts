import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { assertExistingAccount } from "./lib/access";
import { sha256Hex } from "./lib/appleIdentity";
import { allowedRedirect } from "./lib/authRedirect";
import { LINK_FRESH_MS, LINK_TTL_MS, randomToken, type LinkResult } from "./lib/googleLink";
import { validatePasswordPolicy } from "./lib/passwordPolicy";

declare const process: { env: Record<string, string | undefined> };

export type SignInMethod = { id: Id<"authAccounts">; kind: "apple" | "google" | "password"; label: string | null; removable: boolean };

/** Every way into this account, one entry per identity. Apple's two provider ids for one Apple ID count once. */
async function methodsFor(ctx: QueryCtx, userId: Id<"users">): Promise<SignInMethod[]> {
  const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).take(50);
  const out: SignInMethod[] = [];
  const appleSubjects = new Set<string>();
  // The native provider first, so its row represents the Apple ID.
  const order = (a: Doc<"authAccounts">) => (a.provider === "apple-native" ? 0 : 1);
  for (const account of [...accounts].sort((a, b) => order(a) - order(b))) {
    const label = typeof account.emailVerified === "string" ? account.emailVerified : null;
    if (account.provider === "apple-native" || account.provider === "apple") {
      if (appleSubjects.has(account.providerAccountId)) continue;
      appleSubjects.add(account.providerAccountId);
      out.push({ id: account._id, kind: "apple", label, removable: false });
    } else if (account.provider === "google") {
      out.push({ id: account._id, kind: "google", label, removable: false });
    } else if (account.provider === "password") {
      out.push({ id: account._id, kind: "password", label: account.providerAccountId, removable: false });
    }
  }
  // First version: only Google can be removed, and never the last way in.
  return out.map((m) => ({ ...m, removable: m.kind === "google" && out.length > 1 }));
}

/**
 * How the signed-in person can sign in: which of Apple, Google and email-and-password are linked to
 * their account, and the email a password would use. Only labels the person already knows leave
 * here (their own addresses), never tokens or provider IDs.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const methods = await methodsFor(ctx, userId);
    const email = typeof user?.email === "string" ? user.email : null;
    return {
      email,
      privateRelay: email?.endsWith("@privaterelay.appleid.com") ?? false,
      apple: methods.some((m) => m.kind === "apple"),
      google: methods.some((m) => m.kind === "google"),
      password: methods.some((m) => m.kind === "password"),
      methods,
      canAddGoogle: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    };
  }
});

/**
 * Step 1 of "Add Google": the signed-in person asks to attach a Google account. Only a session made
 * in the last few minutes may start it, so a stolen or forgotten-open session cannot quietly add an
 * attacker's Google. Returns the page to open; it is single-use and lasts 10 minutes.
 */
export const startGoogleLink = mutation({
  args: { returnTo: v.string() },
  handler: async (ctx, { returnTo }): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    await assertExistingAccount(ctx, userId);
    if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET || !process.env.CONVEX_SITE_URL) {
      throw new ConvexError({ code: "GOOGLE_UNAVAILABLE", message: "Google sign-in isn’t available right now." });
    }
    const session = await ctx.db.get(sessionId);
    const now = Date.now();
    if (!session || session.userId !== userId || session.expirationTime <= now) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    if (now - session._creationTime > LINK_FRESH_MS) {
      throw new ConvexError({ code: "REAUTH_REQUIRED", message: "Confirm it’s you first, then add Google." });
    }
    let target: string;
    try { target = allowedRedirect(returnTo, process.env.SITE_URL ?? ""); }
    catch { throw new ConvexError({ code: "INVALID_ARGUMENT", message: "That return address isn’t allowed." }); }
    // One attempt at a time per person; an older unfinished one stops working.
    for (const old of await ctx.db.query("signInLinks").withIndex("by_user", (q) => q.eq("userId", userId)).take(20)) {
      await ctx.db.delete(old._id);
    }
    const token = randomToken();
    await ctx.db.insert("signInLinks", { userId, sessionId, provider: "google", startHash: await sha256Hex(token), returnTo: target, expiresAt: now + LINK_TTL_MS });
    return { url: `${process.env.CONVEX_SITE_URL}/link/google/start?t=${encodeURIComponent(token)}` };
  }
});

/** Removes one linked Google account. Signing in with it afterwards starts a separate new account. */
export const unlink = mutation({
  args: { accountId: v.id("authAccounts") },
  handler: async (ctx, { accountId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    await assertExistingAccount(ctx, userId);
    const methods = await methodsFor(ctx, userId);
    const method = methods.find((m) => m.id === accountId);
    if (!method) throw new ConvexError({ code: "NOT_FOUND", message: "That sign-in method isn’t on this account." });
    if (methods.length <= 1) throw new ConvexError({ code: "LAST_METHOD", message: "This is your only way to sign in, so it can’t be removed." });
    if (!method.removable) throw new ConvexError({ code: "NOT_REMOVABLE", message: "Only a Google account can be removed here for now." });
    for (const code of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", accountId)).take(20)) {
      await ctx.db.delete(code._id);
    }
    await ctx.db.delete(accountId);
    return { ok: true as const };
  }
});

async function liveLinkSession(ctx: QueryCtx, row: Doc<"signInLinks">, now: number): Promise<boolean> {
  if (row.expiresAt <= now) return false;
  const session = await ctx.db.get(row.sessionId);
  return Boolean(session && session.userId === row.userId && session.expirationTime > now);
}

/** Step 2, from the start page: bind this attempt to the browser (cookie) and to Google's state and PKCE. Single use. */
export const beginLink = internalMutation({
  args: { startHash: v.string(), stateHash: v.string(), binderHash: v.string(), codeVerifier: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; returnTo: string | null }> => {
    const row = await ctx.db.query("signInLinks").withIndex("by_start", (q) => q.eq("startHash", args.startHash)).unique();
    if (!row) return { ok: false, returnTo: null };
    if (row.stateHash || !(await liveLinkSession(ctx, row, Date.now()))) {
      await ctx.db.delete(row._id);
      return { ok: false, returnTo: row.returnTo };
    }
    await ctx.db.patch(row._id, { stateHash: args.stateHash, binderHash: args.binderHash, codeVerifier: args.codeVerifier });
    return { ok: true };
  }
});

/** What the callback needs before it talks to Google. */
export const linkForState = internalQuery({
  args: { stateHash: v.string() },
  handler: async (ctx, { stateHash }) => {
    const row = await ctx.db.query("signInLinks").withIndex("by_state", (q) => q.eq("stateHash", stateHash)).unique();
    if (!row || !row.codeVerifier || !row.binderHash) return null;
    return { binderHash: row.binderHash, codeVerifier: row.codeVerifier, returnTo: row.returnTo, expiresAt: row.expiresAt };
  }
});

/**
 * Step 3: Google answered. Attach its stable subject to the account that started the attempt, or
 * refuse. The attempt is always used up. A Google identity that already opens another Numa Pro
 * account is refused without saying anything about that account.
 */
export const finishLink = internalMutation({
  args: {
    stateHash: v.string(), binderHash: v.string(),
    identity: v.optional(v.object({ subject: v.string(), email: v.union(v.string(), v.null()), emailVerified: v.boolean() })),
    outcome: v.optional(v.union(v.literal("cancelled"), v.literal("failed"))),
  },
  handler: async (ctx, args): Promise<{ result: LinkResult; returnTo: string | null }> => {
    const row = await ctx.db.query("signInLinks").withIndex("by_state", (q) => q.eq("stateHash", args.stateHash)).unique();
    if (!row) return { result: "expired", returnTo: null };
    await ctx.db.delete(row._id);
    const done = (result: LinkResult) => ({ result, returnTo: row.returnTo });
    if (!row.binderHash || row.binderHash !== args.binderHash) return done("failed");
    if (args.outcome) return done(args.outcome);
    if (!args.identity) return done("failed");
    if (!(await liveLinkSession(ctx, row, Date.now()))) return done("expired");
    try { await assertExistingAccount(ctx, row.userId); } catch { return done("failed"); }
    const existing = await ctx.db.query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "google").eq("providerAccountId", args.identity!.subject)).unique();
    if (existing) return done(existing.userId === row.userId ? "already" : "taken");
    const { email, emailVerified } = args.identity;
    await ctx.db.insert("authAccounts", {
      userId: row.userId, provider: "google", providerAccountId: args.identity.subject,
      ...(email && emailVerified ? { emailVerified: email } : {}),
    });
    return done("linked");
  }
});

/**
 * Lets someone who signed up with Apple or Google also sign in with their email and a password,
 * on any device. The password is hashed here, the same way the password provider hashes it.
 */
export const setPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<{ email: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    if (password.length > 200) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "That password is too long." });
    const email: string = await ctx.runQuery(internal.signInMethods.emailFor, { userId });
    const policy = validatePasswordPolicy(password, { email });
    if (!policy.ok) throw new ConvexError({ code: "WEAK_PASSWORD", message: policy.issues[0]?.message ?? "Password is too weak." });
    const secret = await new Scrypt().hash(password);
    await ctx.runMutation(internal.signInMethods.attachPassword, { userId, secret });
    return { email };
  }
});

export const emailFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string> => {
    const user = await ctx.db.get(userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email) throw new ConvexError({ code: "NO_EMAIL", message: "This account has no email to sign in with." });
    return email;
  }
});

export const attachPassword = internalMutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, { userId, secret }) => {
    const user = await ctx.db.get(userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email) throw new ConvexError({ code: "NO_EMAIL", message: "This account has no email to sign in with." });
    const existing = await ctx.db.query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email)).first();
    if (existing && existing.userId === userId) throw new ConvexError({ code: "ALREADY_SET", message: "This account already has a password. Use “Forgot password?” on the sign-in page to change it." });
    if (existing) throw new ConvexError({ code: "EMAIL_TAKEN", message: "Another Numa Pro account already uses this email with a password." });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: email,
      secret,
      // An email Apple or Google already verified needs no emailed code at sign-in.
      ...(user?.emailVerificationTime ? { emailVerified: email } : {})
    });
  }
});
