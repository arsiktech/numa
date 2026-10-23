import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertExistingAccount } from "./lib/access";
import { getAuthUserId, getAuthSessionId } from "@convex-dev/auth/server";
import { sha256Hex } from "./lib/appleIdentity";
import { validatedAppleConfig, APPLE_REPLAY_MS, APPLE_RETENTION_MS, openAppleToken, revokeAppleToken, type AppleEnvelope } from "./lib/appleTokens";
import { resolveAppleAccountTarget, resolvePinnedAppleAccountTarget } from "./lib/appleAccountTarget";
declare const process: { env: Record<string, string | undefined> };
// Explicit references avoid changing generated files in this offline-only lane.
const revokeRef = makeFunctionReference<"action", { id: Id<"appleCredentials"> }>("appleLifecycle:revoke");
const claimRef = makeFunctionReference<"mutation", { id: Id<"appleCredentials"> }, Doc<"appleCredentials"> | null>("appleLifecycle:claim");
const finishRef = makeFunctionReference<"mutation", { id: Id<"appleCredentials">; attempt: number; ok: boolean }>("appleLifecycle:finish");
const cleanupRef = makeFunctionReference<"mutation", { id: Id<"appleCredentials"> }>("appleLifecycle:cleanup");
const guardCleanupRef = makeFunctionReference<"mutation", { id: Id<"appleDeletionGuards"> }>("appleLifecycle:cleanupGuard");
export type AppleProof = { preExchangeUserId?: Id<"users"> | null; subject?: string; linkEmail?: string; subjectHash: string; audience: string; issuedAt: number; envelope?: AppleEnvelope };

/** Called only inside trusted apple-native createOrUpdateUser callback. */
export async function assertAppleCallback(ctx: Pick<QueryCtx, "db">, proof: AppleProof) {
  if (proof.subject && await sha256Hex(proof.subject) !== proof.subjectHash) throw new Error("Apple identity account mismatch");
  if (!Number.isFinite(proof.issuedAt) || Date.now() - proof.issuedAt >= 600000 || proof.issuedAt > Date.now() + 60000) throw new Error("Apple sign-in expired. Try again.");
  const guard = await ctx.db.query("appleDeletionGuards").withIndex("by_subject", q => q.eq("subjectHash", proof.subjectHash)).unique();
  if (guard && guard.expiresAt > Date.now()) throw new Error("Apple account deletion is finishing. Try again later.");
}
export async function saveAppleCredential(ctx: MutationCtx, userId: Id<"users">, proof: AppleProof) {
  const existing = await ctx.db.query("appleCredentials").withIndex("by_user_audience", q => q.eq("userId", userId).eq("audience", proof.audience)).unique();
  // Identity-only returning sign-in must not replace or downgrade a ready token.
  if (!proof.envelope && existing?.envelope) {
    if (existing.state !== "active" || existing.subjectHash !== proof.subjectHash) {
      throw new Error("A fresh Apple sign-in is required. Update Numa Pro or use the current web client.");
    }
    return;
  }
  const value = { userId, subjectHash: proof.subjectHash, audience: proof.audience, ...((proof.envelope ?? existing?.envelope) ? { envelope: proof.envelope ?? existing?.envelope } : {}), state: "active" as const, attempts: 0, updatedAt: Date.now() };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("appleCredentials", value);
}
/** Stamp every Apple auth row immediately before its bounded cascade deletion.
 * This covers arbitrarily many linked identities without an unbounded initial scan. */
export async function guardAppleSubject(ctx: MutationCtx, subject: string) {
  const subjectHash = await sha256Hex(subject);
  const expiresAt = Date.now() + APPLE_REPLAY_MS;
  const old = await ctx.db.query("appleDeletionGuards").withIndex("by_subject", q => q.eq("subjectHash", subjectHash)).unique();
  const id = old?._id ?? await ctx.db.insert("appleDeletionGuards", { subjectHash, expiresAt });
  if (old) await ctx.db.patch(id, { expiresAt });
  await ctx.scheduler.runAt(expiresAt, guardCleanupRef, { id });
}
/** First destructive chunk only. No external calls and no dependency on provider health. */
export async function beginAppleDeletion(ctx: MutationCtx, userId: Id<"users">) {
  const now = Date.now();
  const credentials = await ctx.db.query("appleCredentials").withIndex("by_user", q => q.eq("userId", userId)).take(3);
  for (const row of credentials) {
    if (!row.envelope) { await ctx.db.delete(row._id); continue; }
    await ctx.db.patch(row._id, { userId: undefined, state: "pending", attempts: 0, leaseUntil: undefined, expiresAt: now + APPLE_RETENTION_MS, updatedAt: now });
    await ctx.scheduler.runAfter(0, revokeRef, { id: row._id });
    await ctx.scheduler.runAfter(APPLE_RETENTION_MS, cleanupRef, { id: row._id });
  }
}
export const claim = internalMutation({
  args: { id: v.id("appleCredentials") },
  handler: async (ctx, { id }): Promise<Doc<"appleCredentials"> | null> => {
    const row = await ctx.db.get(id); const now = Date.now();
    if (!row || row.state !== "pending") return null;
    if ((row.expiresAt ?? 0) <= now) { await ctx.db.delete(id); return null; }
    if ((row.leaseUntil ?? 0) > now) return null;
    const attempts = row.attempts + 1;
    if (attempts > 8) return null;
    await ctx.db.patch(id, { attempts, leaseUntil: now + 60000, updatedAt: now });
    // Recover even if the action process disappears before finish.
    await ctx.scheduler.runAfter(61000, revokeRef, { id });
    return { ...row, attempts };
  }
});
export const finish = internalMutation({
  args: { id: v.id("appleCredentials"), attempt: v.number(), ok: v.boolean() },
  handler: async (ctx, { id, attempt, ok }) => {
    const row = await ctx.db.get(id); const now = Date.now();
    if (!row || row.state !== "pending" || row.attempts !== attempt) return;
    if (ok || attempt >= 8 || (row.expiresAt ?? 0) <= now) {
      await ctx.db.replace(id, { state: ok ? "done" : "expired", attempts: attempt, updatedAt: now, expiresAt: now + APPLE_RETENTION_MS });
      await ctx.scheduler.runAfter(APPLE_RETENTION_MS, cleanupRef, { id });
    } else {
      // Keep the lease through backoff so stale recovery jobs cannot accelerate retries.
      const delay = Math.min(3600000, 60000 * 2 ** attempt);
      await ctx.db.patch(id, { leaseUntil: now + delay, updatedAt: now });
      await ctx.scheduler.runAfter(delay, revokeRef, { id });
    }
  }
});
export const revoke = internalAction({
  args: { id: v.id("appleCredentials") },
  handler: async (ctx, { id }): Promise<void> => {
    const row = await ctx.runMutation(claimRef, { id });
    if (!row) return;
    let ok = false;
    try {
      const config = await validatedAppleConfig(process.env);
      if (config && row.envelope && row.subjectHash && row.audience) {
        const token = await openAppleToken(row.envelope, row.subjectHash, row.audience, config);
        ok = await revokeAppleToken(token, row.audience, config, Date.now());
      }
    } catch { /* No token/provider response in telemetry or client errors. */ }
    await ctx.runMutation(finishRef, { id, attempt: row.attempts, ok });
  }
});
export const cleanup = internalMutation({ args: { id: v.id("appleCredentials") }, handler: async (ctx, { id }) => {
  const row = await ctx.db.get(id);
  if (row && row.expiresAt !== undefined && row.expiresAt <= Date.now()) await ctx.db.delete(id);
} });
export const cleanupGuard = internalMutation({ args: { id: v.id("appleDeletionGuards") }, handler: async (ctx, { id }) => {
  const row = await ctx.db.get(id);
  if (row && row.expiresAt <= Date.now()) await ctx.db.delete(id);
} });

/** Configuration is not a successful provider check. No secret values leave this query. */
export const readiness = query({ args: {}, handler: async () => ({
  configured: (await validatedAppleConfig(process.env)) !== null, liveVerified: false as const
}) });
/** A linked identity is not session provenance. Unknown/legacy sessions never
 * subscribe to native Apple events. General deleted-account handling is separate. */
export const nativeIdentity = query({ args: {}, handler: async (ctx): Promise<{ userId: Id<"users"> | null; sessionId: Id<"authSessions"> | null; exists: boolean; subject: string | null }> => {
  const userId = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx) ?? null;
  if (!userId || !await ctx.db.get(userId)) return { userId, sessionId, exists: false, subject: null };
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  const subject = session?.userId === userId && session.expirationTime > Date.now() ? session.appleSubject ?? null : null;
  return { userId, sessionId, exists: true, subject };
} });

const proofValidator = v.object({ preExchangeUserId: v.optional(v.union(v.id("users"), v.null())), subject: v.optional(v.string()), linkEmail: v.optional(v.string()), subjectHash: v.string(), audience: v.string(), issuedAt: v.number(), envelope: v.optional(v.object({ iv: v.string(), ciphertext: v.string() })) });
/** Reject a switched/deleting account before exchanging any new provider token.
 * Finalization repeats these checks after the asynchronous provider boundary. */
export const checkSignIn = internalQuery({
  args: { subject: v.string(), proof: proofValidator },
  handler: async (ctx, { subject, proof }) => {
    if (await sha256Hex(subject) !== proof.subjectHash) throw new Error("Apple identity account mismatch");
    await assertAppleCallback(ctx, proof);
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "apple-native").eq("providerAccountId", subject)).unique();
    const actor = await getAuthUserId(ctx);
    if (actor && (!account || actor !== account.userId)) throw new Error("This provider is already linked to another Numa Pro account.");
    return await resolveAppleAccountTarget(ctx, subject, proof.linkEmail);
  },
});
/** Convex Auth createAccount bypasses its callback for existing accounts. This
 * second, mandatory transaction covers BOTH paths before authorize returns. */
export const finalizeSignIn = internalMutation({
  args: { userId: v.id("users"), proof: proofValidator },
  handler: async (ctx, { userId, proof }) => {
    await assertAppleCallback(ctx, proof);
    await assertExistingAccount(ctx, userId);
    const actor = await getAuthUserId(ctx);
    if (actor && actor !== userId) throw new Error("This provider is already linked to another Numa Pro account.");
    if (!proof.subject) throw new Error("Missing trusted Apple subject");
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "apple-native").eq("providerAccountId", proof.subject!)).unique();
    if (!account || account.userId !== userId) throw new Error("Apple identity account mismatch");
    if (!proof.subject || await resolvePinnedAppleAccountTarget(ctx, proof.subject, proof.linkEmail, proof.preExchangeUserId) !== userId) throw new Error("Apple identity account mismatch");
    await saveAppleCredential(ctx, userId, proof);
  }
});
/** Internal-only binding after the SDK has created this exact Apple session. */
export const bindSession = internalMutation({
  args: { userId: v.id("users"), sessionId: v.id("authSessions"), proof: proofValidator },
  handler: async (ctx, { userId, sessionId, proof }) => {
    await assertAppleCallback(ctx, proof);
    await assertExistingAccount(ctx, userId);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId || session.expirationTime <= Date.now()) throw new Error("Apple session no longer exists");
    if (!proof.subject || await resolvePinnedAppleAccountTarget(ctx, proof.subject, proof.linkEmail, proof.preExchangeUserId) !== userId) throw new Error("Apple identity account mismatch");
    await ctx.db.patch(sessionId, { appleSubject: proof.subject });
  },
});
/** Any code exchanged by a sign-in that subsequently fails is still revocable.
 * Keep only its ciphertext, with the same independent 24-hour deletion bound. */
export const discardSignIn = internalMutation({
  args: { proof: proofValidator },
  handler: async (ctx, { proof }) => {
    if (!proof.envelope) return;
    const now = Date.now();
    const id = await ctx.db.insert("appleCredentials", { subjectHash: proof.subjectHash, audience: proof.audience, envelope: proof.envelope, state: "pending", attempts: 0, expiresAt: now + APPLE_RETENTION_MS, updatedAt: now });
    await ctx.scheduler.runAfter(0, revokeRef, { id });
    await ctx.scheduler.runAfter(APPLE_RETENTION_MS, cleanupRef, { id });
  }
});
