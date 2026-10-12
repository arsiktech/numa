import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { privateDiagnostic } from "./lib/diagnosticPrivacy";

/**
 * Client error telemetry sink. Public (errors on the signed-out welcome
 * surface matter too), so it is deliberately defensive:
 *
 * - server allowlists retain only categorical error class, route and version;
 *   raw messages, stacks, user agents and identities are discarded;
 * - reports dedupe by fingerprint (one row per distinct error, with a count
 *   and last-seen timestamp), so a crash loop cannot flood the table;
 * - the table itself is capped: past MAX_DISTINCT_ERRORS the oldest rows are
 *   evicted, bounding worst-case abuse to a fixed number of small rows.
 *
 * Rows are read in the Convex dashboard (sorted by lastSeenAt); there is
 * intentionally no public read API.
 */

const MAX_DISTINCT_ERRORS = 500;
const EVICT_BATCH = 25;

export const report = mutation({
  args: {
    fingerprint: v.string(),
    source: v.union(
      v.literal("boundary"),
      v.literal("window"),
      v.literal("promise"),
      v.literal("route"),
      v.literal("manual")
    ),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    release: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { fingerprint, message, url, release } = privateDiagnostic(args);
    const now = Date.now();

    const existing = await ctx.db
      .query("clientErrors")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .unique()
      .catch(async () => {
        // Defensive: if duplicates ever exist, fold into the first.
        const rows = await ctx.db
          .query("clientErrors")
          .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
          .take(1);
        return rows[0] ?? null;
      });

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        lastSeenAt: now,
        message, url, release,
        stack: undefined, userAgent: undefined, userId: undefined
      });
      return { recorded: true };
    }

    // Cap distinct rows: evict the oldest when full. take(cap+1) is fine at
    // this table's bounded size.
    const all = await ctx.db
      .query("clientErrors")
      .withIndex("by_last_seen")
      .order("asc")
      .take(MAX_DISTINCT_ERRORS + 1);
    if (all.length >= MAX_DISTINCT_ERRORS) {
      for (const row of all.slice(0, EVICT_BATCH)) {
        await ctx.db.delete(row._id);
      }
    }

    await ctx.db.insert("clientErrors", {
      fingerprint,
      source: args.source,
      message,
      url, release,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now
    });
    return { recorded: true };
  }
});
