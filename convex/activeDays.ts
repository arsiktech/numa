import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { requireUser } from "./lib/access";
import { activeDayReport, utcDate } from "./lib/activeDays";

export const record = mutation({
  args: { expectedUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (userId !== args.expectedUserId) throw new ConvexError({ code: "ACCOUNT_CHANGED", message: "This activity belongs to an earlier account" });
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (profile?.deletionScheduledAt !== undefined) throw new ConvexError({ code: "DELETION_PENDING", message: "Activity is unavailable during account deletion" });
    const day = utcDate(Date.now());
    const existing = await ctx.db.query("activeDays").withIndex("by_user_day", q => q.eq("userId", userId).eq("utcDate", day)).unique();
    if (!existing) await ctx.db.insert("activeDays", { userId, utcDate: day });
    return { utcDate: day };
  },
});

/** Operator-only read. No public client or agent can enumerate another person's activity. */
export const weeklyReport = internalQuery({
  args: { outsideHouseholdUserIds: v.optional(v.array(v.id("users"))) },
  handler: async (ctx, args) => {
    const asOf = utcDate(Date.now());
    const empty = activeDayReport([], asOf, args.outsideHouseholdUserIds ?? null);
    // Bound the report. A saturated page is incomplete, never a successful retention verdict.
    const rows = await ctx.db.query("activeDays").withIndex("by_day", q => q.gte("utcDate", empty.window.from).lte("utcDate", empty.window.through)).take(10001);
    if (rows.length > 10000) throw new ConvexError({ code: "REPORT_TOO_LARGE", message: "Activity report requires pagination; no retention verdict produced" });
    return activeDayReport(rows, asOf, args.outsideHouseholdUserIds ?? null);
  },
});
