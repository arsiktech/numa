import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/** Only rows stamped with the new retention contract are eligible. Old rows,
 * provider files, logs and SDK auth counters are deliberately not swept here. */
export const expireRateLimitBuckets = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("rateLimitBuckets")
      .withIndex("by_expiry", q => q.gt("expiresAt", 0).lte("expiresAt", Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.privacyRetention.expireRateLimitBuckets, {});
    return { deleted: rows.length };
  },
});
