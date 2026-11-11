import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { requireUser } from "./lib/access";
import { normalizeClientMutationId } from "./lib/mutationReceipts";

export const MAX_FEEDBACK_CHARS = 2000;
const DAILY_LIMIT = 10;

/** Free-text feedback from the signed-in person. Stored as sent, tied to the account, erased and exported with it. */
export const submit = mutation({
  args: {
    expectedUserId: v.id("users"),
    kind: v.union(v.literal("idea"), v.literal("problem"), v.literal("other")),
    message: v.string(), platform: v.string(), appVersion: v.string(), clientMutationId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (userId !== args.expectedUserId) throw new ConvexError({ code: "ACCOUNT_CHANGED", message: "This feedback belongs to an earlier account" });
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (profile?.deletionScheduledAt !== undefined) throw new ConvexError({ code: "DELETION_PENDING", message: "Feedback is unavailable during account deletion" });
    const message = args.message.trim();
    if (!message) throw new ConvexError({ code: "EMPTY_FEEDBACK", message: "Write a message first" });
    if (message.length > MAX_FEEDBACK_CHARS) throw new ConvexError({ code: "FEEDBACK_TOO_LONG", message: `Keep feedback under ${MAX_FEEDBACK_CHARS} characters` });
    const clientMutationId = normalizeClientMutationId(args.clientMutationId);
    if (!clientMutationId) throw new ConvexError({ code: "INVALID_INPUT", message: "clientMutationId is required" });
    const repeat = await ctx.db.query("feedback").withIndex("by_user_client_id", q => q.eq("userId", userId).eq("clientMutationId", clientMutationId)).unique();
    if (repeat) return { id: repeat._id };
    const recent = await ctx.db.query("feedback").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(DAILY_LIMIT);
    const dayAgo = Date.now() - 86_400_000;
    if (recent.length >= DAILY_LIMIT && recent[DAILY_LIMIT - 1].sentAt > dayAgo) throw new ConvexError({ code: "TOO_MANY_FEEDBACK", message: "You’ve sent a lot of feedback today. Try again tomorrow." });
    const id = await ctx.db.insert("feedback", { userId, kind: args.kind, message, platform: args.platform.slice(0, 20), appVersion: args.appVersion.slice(0, 20), clientMutationId, sentAt: Date.now() });
    return { id };
  },
});

/** Operator-only read for the recurring review. No public client or agent can read feedback. */
export const recent = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("feedback").order("desc").take(Math.min(Math.max(args.limit ?? 50, 1), 200));
    return rows.map(r => ({ at: r.sentAt, kind: r.kind, message: r.message, platform: r.platform, appVersion: r.appVersion }));
  },
});
