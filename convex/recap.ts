import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Convex's bundled type lib doesn't include the Node `process` global by
// default — declare the minimal shape we need so this file compiles cleanly
// under both the Convex toolchain and the app's `tsc -b` pass.
declare const process: {
  env: Record<string, string | undefined>;
};

type RecapLocale = "en" | "ru" | "es";

/**
 * Weekly recap fanout (see convex/crons.ts for the schedule).
 *
 * Flow: cron → sendWeeklyRecaps (action) → per user: weeklyActivity (query)
 * → POST {SITE_URL}/api/push-send with the shared internal secret. The push
 * deep-links to "/?recap=week", which the Simple home surface uses to scroll
 * the Week-in-review card into view.
 */

/**
 * Everyone who could receive a recap push: distinct owners of push
 * subscriptions, joined with their profile so the copy can be localized AND
 * so non-Light users are excluded — the push deep-links to "/?recap=week",
 * a Simple-home (Light mode) surface that Advanced/Shared users don't have.
 * `appMode` is stored server-side on profiles; a missing value means a row
 * written before the mode shipped, which the app surfaces as "advanced"
 * (see profiles.me), so those are skipped too. Full table scan is fine at
 * current scale — subscriptions are one row per device and the cron runs
 * once a week.
 */
export const listRecapTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const subscriptions = await ctx.db.query("pushSubscriptions").collect();
    const seen = new Set<string>();
    const targets: Array<{ userId: Id<"users">; locale: RecapLocale }> = [];
    for (const subscription of subscriptions) {
      const key = String(subscription.userId);
      if (seen.has(key)) continue;
      seen.add(key);
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", subscription.userId))
        .unique();
      if (profile?.appMode !== "light") continue;
      targets.push({ userId: subscription.userId, locale: profile.locale ?? "en" });
    }
    return targets;
  }
});

/**
 * Start of the current calendar week — Monday 00:00 UTC. The in-app
 * Week-in-review card aligns to the user's local Monday (weekStartsOn: 1);
 * the server has no per-user timezone, so UTC Monday is the closest
 * server-side equivalent. The cron fires Sunday 17:00 UTC, when this window
 * covers nearly the full week.
 */
function startOfIsoWeekUtc(now: number): number {
  const d = new Date(now);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

/**
 * How many expenses the user logged this calendar week (Monday 00:00 UTC →
 * now, matching the in-app Week-in-review card), across up to three of
 * their portfolios. Only kind === "expense" rows count — income rows used
 * to silently eat the scan budget. The count is capped at 200 expense rows
 * total — the recap copy only needs "did anything happen and roughly how
 * much", not an exact ledger.
 */
export const weeklyActivity = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const portfolioIds = memberships.slice(0, 3).map((m) => m.portfolioId);
    const now = Date.now();
    const since = startOfIsoWeekUtc(now);
    let budget = 200;
    let count = 0;
    for (const portfolioId of portfolioIds) {
      if (budget <= 0) break;
      const rows = await ctx.db
        .query("transactions")
        .withIndex("by_portfolio_time", (q) =>
          q.eq("portfolioId", portfolioId).gte("occurredAt", since).lte("occurredAt", now)
        )
        .filter((q) => q.eq(q.field("kind"), "expense"))
        .take(budget);
      budget -= rows.length;
      count += rows.length;
    }
    return count;
  }
});

/**
 * Push copy lives server-side in this module on purpose: the notification is
 * rendered by the OS, not by the app, so the client locale files can't help.
 */
function recapCopy(locale: RecapLocale, count: number): { title: string; body: string } {
  if (locale === "ru") {
    return {
      title: "Ваша неделя готова",
      body: `Записей за неделю: ${count} — посмотрите, куда ушла неделя`
    };
  }
  if (locale === "es") {
    return {
      title: "Tu semana está lista",
      body: `Registraste ${count} gasto${count === 1 ? "" : "s"} — mira a dónde se fue la semana`
    };
  }
  return {
    title: "Your week is ready",
    body: `You logged ${count} expense${count === 1 ? "" : "s"} — see where the week went`
  };
}

/**
 * Cron entrypoint. Sequential on purpose: /api/push-send is rate-limited at
 * 120/min per userId and the weekly cadence makes throughput irrelevant.
 * Users with zero logged expenses are skipped — no hollow pings.
 */
export const sendWeeklyRecaps = internalAction({
  args: {},
  handler: async (ctx) => {
    const siteUrl = process.env.SITE_URL ?? "";
    if (!siteUrl.startsWith("https://")) {
      // Dev / preview deployments: never push from non-production.
      return { skipped: "dev" } as const;
    }
    const secret = process.env.NUMA_PUSH_INTERNAL_SECRET ?? "";
    if (!secret) {
      // Deployment not wired for push yet (owner sets the shared secret on
      // the Convex deployment) — skip quietly instead of 401ing weekly.
      return { skipped: "no-secret" } as const;
    }
    const endpoint = `${siteUrl.replace(/\/+$/, "")}/api/push-send`;
    const targets = await ctx.runQuery(internal.recap.listRecapTargets, {});

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        const count = await ctx.runQuery(internal.recap.weeklyActivity, {
          userId: target.userId
        });
        if (count === 0) {
          skipped += 1;
          continue;
        }
        const copy = recapCopy(target.locale, count);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Numa-Push-Secret": secret
          },
          body: JSON.stringify({
            userId: String(target.userId),
            title: copy.title,
            body: copy.body,
            url: "/?recap=week"
          }),
          // A hung push endpoint must not stall the whole weekly fanout —
          // abort after 10s; the per-user catch below absorbs the abort.
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch {
        // Per-user isolation: one dead endpoint must not sink the whole run.
        failed += 1;
      }
    }
    return { sent, skipped, failed };
  }
});
