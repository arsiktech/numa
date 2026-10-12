import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember, requireOwner } from "./lib/access";

/**
 * List all pending invites tied to a portfolio. Members of the portfolio
 * can see who has been invited but not yet accepted.
 */
export const listOutboundForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("invites")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    return rows.sort((a, b) => b.invitedAt - a.invitedAt);
  }
});

/**
 * Owner-only. Mark a pending invite as revoked.
 */
export const revokeInvite = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.id);
    if (!invite) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invite not found" });
    }
    await requireOwner(ctx, invite.portfolioId);
    if (invite.status !== "pending") {
      // Idempotent — silently no-op if already accepted/revoked.
      return;
    }
    await ctx.db.patch(args.id, { status: "revoked" });
  }
});
