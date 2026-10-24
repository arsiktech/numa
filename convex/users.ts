import { makeFunctionReference } from "convex/server";
import { sha256Hex } from "./lib/appleIdentity";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/access";
import { beginAppleDeletion, guardAppleSubject } from "./appleLifecycle";

/** Grace window between requesting deletion and the cascade actually running. */
const DELETION_GRACE_MS = 7 * 24 * 3600 * 1000;

/**
 * Max documents a single cascade run may delete. A 10k-row account used to
 * blow Convex's per-transaction limits in one unbounded mutation — the
 * scheduled deletion then failed forever while the UI promised erasure.
 * Each run now deletes at most this many rows and, when it hits the cap,
 * chains a follow-up run via `ctx.scheduler.runAfter(0, ...)`. 800 is only the document ceiling; every fetch also checks remaining
 * transaction-wide byte/query headroom before reading any documents.
 */
const DELETION_CHUNK_BUDGET = 800;

/** Mutable down-counter threaded through one cascade run. */
type DeletionBudget = { remaining: number };

export type DeletionCancellationDecision =
  | "cancelable"
  | "already-started"
  | "already-deleted";

export function deletionCancellationDecision(
  profile: { deletionStartedAt?: number } | null
): DeletionCancellationDecision {
  if (!profile) return "already-deleted";
  if (profile.deletionStartedAt !== undefined) return "already-started";
  return "cancelable";
}

/**
 * Request deletion of the authed user's account.
 *
 * Real accounts get a 7-day grace window: we schedule
 * `executeScheduledDeletion` and stamp the profile with
 * `deletionScheduledAt`/`deletionJobId` so the client can show a cancel
 * banner (see `cancelMyDeletion`). Nothing is erased until the window ends.
 *
 * Disposable test accounts (*@example.com — E2E/QA fixtures) are cascaded
 * IMMEDIATELY: they must not linger for a week or surface grace banners in
 * automated runs. The immediate path runs one budgeted pass inline (small
 * accounts finish synchronously) and chains the chunked runner for anything
 * bigger — see `eraseNow`.
 *
 * Idempotent: calling again while a deletion is already scheduled is a no-op
 * (never double-schedules).
 *
 * The cascade itself (`deleteUserCascade`) is CHUNKED — at most
 * `DELETION_CHUNK_BUDGET` deletes per transaction, self-rescheduling via
 * `executeScheduledDeletion` until drained. It removes, in this order —
 * profile and auth identity go LAST so we keep the grace-window marker and
 * the caller alive mid-sweep:
 *  1. Per-portfolio cascade for every portfolio the user owns:
 *     memberships (of any member on that portfolio), categories,
 *     transactions, holdings, holdingEvents, assets, liabilities,
 *     wealthSnapshots, settlements, ledger rows, goals, recurring,
 *     aiActionDrafts, invites, and finally the portfolio row itself.
 *  2. Memberships the user has on other people's portfolios (shared
 *     finances we don't own — we just unlink the user, the data stays).
 *  3. Money pods the user owns → cascade members/groups/expenses/
 *     settlements/pod rows. For pods the user is only a *member* of, we
 *     anonymize and unlink their membership while retaining settlement references.
 *  4. User-scoped solo tables: webhookTokens, agentConnections, agentActivity, pushSubscriptions, expoPushTokens, pushAlertsSent,
 *     mutationReceipts, aiActionDrafts.
 *  5. Convex Auth identity rows: authSessions, authAccounts,
 *     authRefreshTokens (descended from sessions), authVerificationCodes
 *     (descended from accounts).
 *  6. Profile row (owned avatar document is drained in step 4).
 *  7. The users row itself.
 *
 * Throws ConvexError("UNAUTHENTICATED") if no caller is signed in.
 */
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx, { allowDeletionStarted: true });
    const user = await ctx.db.get(userId);
    if (!user) return;

    // Disposable E2E/QA accounts: erase right away, no grace window.
    if (((user as { email?: string }).email ?? "").endsWith("@example.com")) {
      await eraseNow(ctx, userId);
      return;
    }

    const profile = await ensureDeletionProfile(ctx, userId);

    // Double-delete guard: a deletion is already scheduled — keep the
    // original date and job, don't schedule twice.
    if (profile?.deletionScheduledAt) return;

    const runAt = Date.now() + DELETION_GRACE_MS;
    const jobId = await ctx.scheduler.runAt(
      runAt,
      internal.users.executeScheduledDeletion,
      { userId }
    );
    await ctx.db.patch(profile._id, {
      deletionScheduledAt: runAt,
      deletionStartedAt: undefined,
      deletionJobId: jobId
    });
  }
});

/**
 * Cancel a pending account deletion scheduled by `deleteMyAccount`. Clears
 * the profile markers and best-effort cancels the scheduled job. Cancellation
 * is refused once `deletionStartedAt` is stamped, so the UI never promises
 * recovery after any destructive chunk may have committed.
 *
 * Returns `{ ok: true }` only while the live profile remains cancelable.
 * `already-started` and `already-deleted` are terminal fail-closed responses;
 * clients must remove the cancellation promise and surface support guidance.
 */
export const cancelMyDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx, { allowDeletionStarted: true });
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const decision = deletionCancellationDecision(profile);
    if (decision !== "cancelable") {
      return { ok: false as const, reason: decision };
    }
    if (!profile) {
      return { ok: false as const, reason: "already-deleted" as const };
    }
    if (profile.deletionJobId) {
      try {
        await ctx.scheduler.cancel(profile.deletionJobId);
      } catch {
        // Job may already be running/finished/GC'd — the marker clear below
        // still wins via the stale-job guard.
      }
    }
    await ctx.db.patch(profile._id, {
      deletionScheduledAt: undefined,
      deletionStartedAt: undefined,
      deletionJobId: undefined
    });
    return { ok: true as const };
  }
});

/**
 * Scheduled (grace-window) deletion runner. NEVER auth-gated — at run time
 * there is no caller identity; authorization happened in `deleteMyAccount`
 * when the job was scheduled.
 *
 * Stale-job guard: only cascades when the profile still carries a
 * `deletionScheduledAt` that is actually due. A cancel that raced the
 * scheduler (markers cleared, but `scheduler.cancel` landed too late) leaves
 * no marker → no-op. Any future marker is not due, including a newer schedule.
 * Never subtract scheduler slack from the user-visible grace deadline.
 *
 * Chunked: one run deletes at most `DELETION_CHUNK_BUDGET` documents. When
 * the cap is hit, the run reschedules itself via `runAfter(0)` and the next
 * run resumes where this one left off (the cascade is a pure drain — it just
 * re-walks the same indexes). The guard above re-runs on EVERY chunk because
 * the profile row (which carries the marker) is only deleted in the cascade's
 * final stage, after every other table is drained. Once the first chunk stamps
 * `deletionStartedAt`, cancellation is intentionally no longer allowed.
 */
export const executeScheduledDeletion = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile?.deletionScheduledAt) return;
    if (profile.deletionScheduledAt > Date.now()) return;
    if (profile.deletionStartedAt === undefined) {
      // This marker and the first destructive chunk commit in the same Convex
      // transaction. A concurrent cancel therefore either wins before any
      // deletion, or sees this marker and fails closed after deletion starts.
      await beginAppleDeletion(ctx, args.userId);
      await ctx.db.patch(profile._id, { deletionStartedAt: Date.now() });
    }
    const done = await deleteUserCascade(ctx, args.userId, {
      remaining: DELETION_CHUNK_BUDGET
    });
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.users.executeScheduledDeletion, {
        userId: args.userId
      });
    }
  }
});

/** Profileless accounts can own arbitrarily many records through spaces:create.
 * Establish the durable job marker before any destructive chunk, without
 * provisioning a starter portfolio or changing financial records. */
async function ensureDeletionProfile(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
  if (existing) return existing;
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account no longer exists");
  const id = await ctx.db.insert("profiles", { userId, displayName: user.name ?? "", defaultCurrency: "EUR", theme: "auto", createdAt: Date.now() });
  const profile = await ctx.db.get(id);
  if (!profile) throw new Error("Could not establish account deletion state");
  return profile;
}

/** Immediate reserved-QA path; large accounts continue with the same marker. */
async function eraseNow(ctx: MutationCtx, userId: Id<"users">) {
  const profile = await ensureDeletionProfile(ctx, userId);
  const now = Date.now();
  if (profile.deletionStartedAt === undefined) await beginAppleDeletion(ctx, userId);
  await ctx.db.patch(profile._id, {
    deletionScheduledAt: profile.deletionScheduledAt ?? now,
    deletionStartedAt: profile.deletionStartedAt ?? now
  });
  const done = await deleteUserCascade(ctx, userId, {
    remaining: DELETION_CHUNK_BUDGET
  });
  if (done) return;
  await ctx.scheduler.runAfter(0, internal.users.executeScheduledDeletion, {
    userId
  });
}

/** One unread Convex document can consume1MiB. Reserve4MiB for parent,
 * profile, identity and final scheduling work. Allow two reads per row (fetch
 * plus patch/delete implementation). The live metrics, not average
 * fixture sizes, decide the next batch before any row bytes are fetched. */
async function deletionPageSize(ctx: MutationCtx, budget: DeletionBudget): Promise<number> {
  if (budget.remaining <= 0) return 0;
  const metrics = await ctx.meta.getTransactionMetrics();
  const mib = 1024 * 1024;
  const capacity = Math.min(
    budget.remaining, 32,
    Math.floor((metrics.bytesRead.remaining - 4 * mib) / (2 * mib)),
    Math.floor((metrics.bytesWritten.remaining - 4 * mib) / mib),
    Math.floor((metrics.documentsRead.remaining - 8) / 2),
    metrics.documentsWritten.remaining - 4,
    metrics.databaseQueries.remaining > 32 ? 32 : 0,
    metrics.functionsScheduled.remaining >= 1 && metrics.scheduledFunctionArgsBytes.remaining >= 1024 ? 32 : 0,
  );
  if (!Number.isFinite(capacity)) throw new Error("Deletion transaction capacity unavailable");
  return Math.max(0, Math.floor(capacity));
}

async function mutateDeletionPages<T extends { _id: Id<TableNames> }>(
  ctx: MutationCtx, budget: DeletionBudget,
  fetchPage: (limit: number) => Promise<T[]>,
  apply: (row: T) => Promise<void>,
): Promise<boolean> {
  for (;;) {
    const requested = await deletionPageSize(ctx, budget);
    if (!requested) return false;
    const rows = await fetchPage(requested);
    for (const row of rows) { await apply(row); budget.remaining -= 1; }
    if (rows.length < requested) return true;
    // Small rows can continue within this transaction. Large rows reduce the
    // next batch or yield to the scheduled continuation before hitting limits.
  }
}

async function drainPage(
  ctx: MutationCtx, budget: DeletionBudget,
  fetchPage: (limit: number) => Promise<Array<{ _id: Id<TableNames> }>>,
): Promise<boolean> {
  return mutateDeletionPages(ctx, budget, fetchPage, row => ctx.db.delete(row._id));
}

/**
 * The actual account cascade. NO auth check here — callers are responsible:
 * `deleteMyAccount` proves identity via `requireUser`, and
 * `executeScheduledDeletion` runs with no identity by design.
 *
 * Budgeted drain: deletes at most `budget.remaining` documents and returns
 * `true` only when EVERYTHING (including the users row) is gone. Returning
 * `false` means "cap hit — schedule another run". Every step re-walks the
 * same index from the top, so resuming is just calling this again.
 *
 * Ordering matters for resumability: the profile row is deleted LAST (just
 * before the users row), because it carries the `deletionScheduledAt` marker
 * that `executeScheduledDeletion`'s stale-guard re-checks on every chunk.
 */
async function deleteUserCascade(
  ctx: MutationCtx,
  userId: Id<"users">,
  budget: DeletionBudget
): Promise<boolean> {
  // 1. Portfolios the user OWNS — fully cascade, one portfolio at a time so
  // a partially-drained portfolio is picked up first on the next run.
  for (;;) {
    if (await deletionPageSize(ctx, budget) < 1) return false;
    const portfolio = await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (!portfolio) break;
    if (!(await deletePortfolioCascade(ctx, portfolio._id, budget))) return false;
  }

  // 2. Memberships on OTHER people's portfolios — just unlink the user.
  // (`deletePortfolioCascade` already removed memberships on portfolios the
  // user owned, but we may still be a member on shared portfolios owned
  // by someone else.)
  if (
    !(await drainPage(ctx, budget, (n) =>
      ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(n)
    ))
  ) {
    return false;
  }

  // 3a. Money pods the user OWNS — cascade pod contents.
  for (;;) {
    if (await deletionPageSize(ctx, budget) < 1) return false;
    const pod = await ctx.db
      .query("moneyPods")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .first();
    if (!pod) break;
    if (!(await deleteMoneyPodCascade(ctx, pod._id, budget))) return false;
  }

  // 3b. Retain financial participant IDs/group membership so deleting a user
  // cannot redistribute old expenses or erase amounts owed in someone else's pod.
  // Strip BOTH login associations: inactive alone does not block old email joins.
  const detach = async (member: Doc<"podMembers">) => {
    await ctx.db.patch(member._id, { displayName: "Former member", active: false,
      removedAt: Date.now(), linkedUserId: undefined, invitedEmail: undefined,
      linkedPortfolioId: undefined, cards: undefined, role: "viewer" });
  };
  if (!(await mutateDeletionPages(ctx, budget,
    n => ctx.db.query("podMembers").withIndex("by_user", q => q.eq("linkedUserId", userId)).take(n), detach))) return false;
  if (await deletionPageSize(ctx, budget) < 1) return false;
  const identity = await ctx.db.get(userId);
  // Merely typing someone else's email at sign-up does not establish ownership
  // of their invitation. Never modify a row linked to a different account.
  if (identity?.email && identity.emailVerificationTime !== undefined) {
    const email = identity.email.trim().toLowerCase();
    if (!(await mutateDeletionPages(ctx, budget,
      n => ctx.db.query("podMembers").withIndex("by_email_user", q => q.eq("invitedEmail", email).eq("linkedUserId", undefined)).take(n), detach))) return false;
  }

  // 4. User-scoped solo tables.
  const userScopedPages: Array<
    (n: number) => Promise<Array<{ _id: Id<TableNames> }>>
  > = [
    (n) =>
      ctx.db
        .query("webhookTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(n),
    (n) =>
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(n),
    (n) => ctx.db.query("expoPushTokens").withIndex("by_user", q => q.eq("userId", userId)).take(n),
    (n) => ctx.db.query("pushAlertsSent").withIndex("by_user_sent", q => q.eq("userId", userId)).take(n),
    (n) =>
      ctx.db
        .query("mutationReceipts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(n),
    (n) => ctx.db.query("profileAvatars").withIndex("by_user", q => q.eq("userId", userId)).take(n),
    (n) => ctx.db.query("privacyChoices").withIndex("by_user", q => q.eq("userId", userId)).take(n),
    (n) => ctx.db.query("clientErrors").withIndex("by_user", q => q.eq("userId", userId)).take(n),
    (n) =>
      ctx.db
        .query("aiActionDrafts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(n),
    (n) => ctx.db.query("agentActivity").withIndex("by_user_at", q => q.eq("userId", userId)).take(n),
    (n) => ctx.db.query("agentConnections").withIndex("by_user", q => q.eq("userId", userId)).take(n),
    // Unfinished "Add Google" attempts: gone before the sessions they point at.
    (n) => ctx.db.query("signInLinks").withIndex("by_user", q => q.eq("userId", userId)).take(n)
  ];
  for (const fetchPage of userScopedPages) {
    if (!(await drainPage(ctx, budget, fetchPage))) return false;
  }

  // 5. Convex Auth identity rows.
  // authRefreshTokens hang off authSessions — drain each session's refresh
  // tokens by sessionId index, then delete the session itself.
  for (;;) {
    if (await deletionPageSize(ctx, budget) < 1) return false;
    const session = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!session) break;
    // A pending OAuth challenge must not outlive its deleted session and be
    // reinterpreted as a fresh signup by a delayed provider callback.
    if (!(await drainPage(ctx, budget, n => ctx.db.query("authVerifiers")
      .withIndex("by_session", q => q.eq("sessionId", session._id)).take(n)))) return false;
    if (
      !(await drainPage(ctx, budget, (n) =>
        ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .take(n)
      ))
    ) {
      return false;
    }
    if (await deletionPageSize(ctx, budget) < 1) return false;
    await ctx.db.delete(session._id);
    budget.remaining -= 1;
  }

  // authVerificationCodes hang off authAccounts. Same shape: drain each
  // account's pending codes, then the account itself.
  for (;;) {
    if (await deletionPageSize(ctx, budget) < 1) return false;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    if (!account) break;
    // Password throttles are keyed by the owned authAccount ID in the pinned
    // SDK, unlike OTP email/phone buckets. Remove only this proven-owned key.
    if (!(await drainPage(ctx, budget, n => ctx.db.query("authRateLimits")
      .withIndex("identifier", q => q.eq("identifier", String(account._id))).take(n)))) return false;
    if (
      !(await drainPage(ctx, budget, (n) =>
        ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .take(n)
      ))
    ) {
      return false;
    }
    if (await deletionPageSize(ctx, budget) < 1) return false;
    if (account.provider === "apple-native" || account.provider === "apple") await guardAppleSubject(ctx, account.providerAccountId);
    await ctx.db.delete(account._id);
    budget.remaining -= 1;
  }

  // 6. Profile — LAST before the users row, so the
  // grace-window marker survives until every other table is drained and
  // the scheduled runner can resume every committed chunk. Reserve both final
  // deletions together; removing the marker alone would strand the identity.
  if (await deletionPageSize(ctx, budget) < 2) return false;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (profile) {
    // New avatar bytes were deleted above in the owned-document cascade.
    // Legacy storage pointers never proved upload ownership. Do not delete an
    // arbitrary file here; legacy attachment cleanup requires an ownership audit.
    await ctx.db.delete(profile._id);
    budget.remaining -= 1;
  }

  // 7. Finally, the users row. Tolerate it being gone already (a stray
  // duplicate chain that lost the OCC race) so the run stays idempotent.
  const user = await ctx.db.get(userId);
  if (user) await ctx.db.delete(userId);
  return true;
}

/**
 * Delete every row owned-by or scoped-to `portfolioId`, then the portfolio
 * row itself. Called from the user cascade for each portfolio the user
 * owns — the assumption is the caller has already proven ownership.
 *
 * Budgeted: returns true only when the portfolio row itself was deleted;
 * false means the budget ran out and the caller must stop and reschedule.
 */
async function deletePortfolioCascade(
  ctx: MutationCtx,
  portfolioId: Id<"portfolios">,
  budget: DeletionBudget
): Promise<boolean> {
  const pages: Array<(n: number) => Promise<Array<{ _id: Id<TableNames> }>>> = [
    // Memberships on this portfolio (covers every member, not just the owner).
    (n) =>
      ctx.db
        .query("memberships")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("categories")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("transactions")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("cashTransfers")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("holdingEvents")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("holdings")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("cryptoWallets")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("loanLinks")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("debtEvents")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("liabilitySources")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("defiReadings")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("assets")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("liabilities")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("wealthSnapshots")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("settlements")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("ledgerLines")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("ledgerTransactions")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("ledgerAccounts")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("goals")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("recurring")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("aiActionDrafts")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n),
    (n) =>
      ctx.db
        .query("invites")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
        .take(n)
  ];
  for (const fetchPage of pages) {
    if (!(await drainPage(ctx, budget, fetchPage))) return false;
  }

  if (await deletionPageSize(ctx, budget) < 1) return false;
  await ctx.db.delete(portfolioId);
  budget.remaining -= 1;
  return true;
}

/**
 * Cascade-delete every row scoped to `podId`, then the pod row. Budgeted —
 * same contract as `deletePortfolioCascade`.
 */
async function deleteMoneyPodCascade(
  ctx: MutationCtx,
  podId: Id<"moneyPods">,
  budget: DeletionBudget
): Promise<boolean> {
  const pages: Array<(n: number) => Promise<Array<{ _id: Id<TableNames> }>>> = [
    (n) => ctx.db.query("podInvites").withIndex("by_pod", q => q.eq("podId", podId)).take(n),
    (n) =>
      ctx.db
        .query("podMembers")
        .withIndex("by_pod", (q) => q.eq("podId", podId))
        .take(n),
    (n) =>
      ctx.db
        .query("podGroups")
        .withIndex("by_pod", (q) => q.eq("podId", podId))
        .take(n),
    (n) =>
      ctx.db
        .query("podExpenses")
        .withIndex("by_pod_time", (q) => q.eq("podId", podId))
        .take(n),
    (n) =>
      ctx.db
        .query("podSettlements")
        .withIndex("by_pod_time", (q) => q.eq("podId", podId))
        .take(n)
  ];
  for (const fetchPage of pages) {
    if (!(await drainPage(ctx, budget, fetchPage))) return false;
  }

  if (await deletionPageSize(ctx, budget) < 1) return false;
  await ctx.db.delete(podId);
  budget.remaining -= 1;
  return true;
}

/** Only the verified Apple notification action can invoke this internal entry. */
export const deleteForAppleRevocation = internalMutation({
  args: { subject: v.string(), audience: v.string(), at: v.number(), eventId: v.string() },
  handler: async (ctx, event) => {
    const receiptHash = await sha256Hex(`apple-notification:${event.eventId}`);
    const old = await ctx.db.query("appleDeletionGuards").withIndex("by_subject", q => q.eq("subjectHash", receiptHash)).unique();
    if (old && old.expiresAt > Date.now()) return;
    const expiresAt = Date.now() + 86400000;
    const id = old?._id ?? await ctx.db.insert("appleDeletionGuards", { subjectHash: receiptHash, expiresAt });
    if (old) await ctx.db.patch(id, { expiresAt });
    await ctx.scheduler.runAt(expiresAt, makeFunctionReference<"mutation", { id: Id<"appleDeletionGuards"> }>("appleLifecycle:cleanupGuard"), { id });
    const subjectHash = await sha256Hex(event.subject);
    for (const provider of ["apple-native", "apple"]) {
      const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", provider).eq("providerAccountId", event.subject)).unique();
      if (!account || account._creationTime > event.at || !await ctx.db.get(account.userId)) continue;
      const tokens = await ctx.db.query("appleCredentials").withIndex("by_user", q => q.eq("userId", account.userId)).take(3);
      // A delayed notification cannot delete an account reauthorized after its event.
      if (tokens.some(row => row.subjectHash === subjectHash && row.updatedAt > event.at)) continue;
      // Apple already revoked these tokens; erase them without another provider request.
      for (const row of tokens) await ctx.db.delete(row._id);
      await eraseNow(ctx, account.userId);
    }
  }
});
