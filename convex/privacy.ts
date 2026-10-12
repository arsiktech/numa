import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";
import { requireUser } from "./lib/access";
import { withMutationReceipt, normalizeClientMutationId } from "./lib/mutationReceipts";
import { AI_SHARING_DISCLOSURE, AI_SHARING_VERSION } from "./lib/privacyPolicy";

export const status = query({
  args: {},
  handler: async ctx => {
    const userId = await auth.getUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    const [profile, choice] = userId && user ? await Promise.all([
      ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique(),
      ctx.db.query("privacyChoices").withIndex("by_user", q => q.eq("userId", userId)).unique(),
    ]) : [null, null];
    const deletionPending = profile?.deletionScheduledAt !== undefined || profile?.deletionStartedAt !== undefined;
    return {
      userId: user ? userId : null,
      requiredVersion: AI_SHARING_VERSION,
      allowed: Boolean(user && !deletionPending && choice?.allowed && choice.version === AI_SHARING_VERSION),
      decidedAt: choice?.recordedAt ?? null,
      deletionPending,
      disclosure: AI_SHARING_DISCLOSURE,
    };
  },
});

export const setAISharing = mutation({
  args: { expectedUserId: v.id("users"), allowed: v.boolean(), version: v.string(), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (userId !== args.expectedUserId) throw new ConvexError({ code: "ACCOUNT_CHANGED", message: "This choice belongs to an earlier account. Review it again in the current account." });
    if (!await ctx.db.get(userId)) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in again" });
    const receipt = normalizeClientMutationId(args.clientMutationId);
    if (!receipt) throw new ConvexError({ code: "INVALID_INPUT", message: "A stable choice identifier is required" });
    if (args.allowed && args.version !== AI_SHARING_VERSION) {
      throw new ConvexError({ code: "PRIVACY_POLICY_CHANGED", message: "Read the current AI sharing explanation before agreeing" });
    }
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (args.allowed && (profile?.deletionScheduledAt !== undefined || profile?.deletionStartedAt !== undefined)) {
      throw new ConvexError({ code: "DELETION_PENDING", message: "AI sharing cannot be enabled during account deletion" });
    }
    // One serializable current decision, with each choice recorded in the
    // mutation receipt's scope. Retrying an old grant never grants again.
    return withMutationReceipt(ctx, userId, receipt, "privacy.setAISharing", async () => {
      const existing = await ctx.db.query("privacyChoices").withIndex("by_user", q => q.eq("userId", userId)).unique();
      const choice = { userId, allowed: args.allowed, version: AI_SHARING_VERSION, recordedAt: Date.now() };
      if (existing) { await ctx.db.patch(existing._id, choice); return existing._id; }
      return ctx.db.insert("privacyChoices", choice);
    }, JSON.stringify([AI_SHARING_VERSION, args.allowed]));
  },
});
