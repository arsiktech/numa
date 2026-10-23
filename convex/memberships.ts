import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMember, requireOwner, requireUser } from "./lib/access";

import { verifiedInvitationEmail } from "./lib/invitationAuthority";

const roleValidator = v.union(v.literal("editor"), v.literal("viewer"));
const inviteRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));

/**
 * List members of a portfolio (caller must already be a member).
 */
export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("memberships")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

/**
 * Owner-only. Invite by email. If a user with the email exists in `users`,
 * create the membership immediately; otherwise stash a pending `invites` row
 * to be redeemed when the invitee signs in.
 */
export const inviteByEmail = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    email: v.string(),
    ownershipBps: v.number(),
    role: inviteRoleValidator,
    displayName: v.string()
  },
  handler: async (ctx, args) => {
    const { userId: invitedByUserId } = await requireOwner(ctx, args.portfolioId);
    const email = args.email.trim().toLowerCase();
    if (!email) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Email required" });
    }

    // Look up a user with this email. `authTables` indexes the `users` table
    // by "email".
    const matchedUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    const matchedUserId: Id<"users"> | null = verifiedInvitationEmail(matchedUser)
      ? (matchedUser!._id as Id<"users">)
      : null;

    if (matchedUserId) {
      // Avoid duplicates.
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", matchedUserId as Id<"users">))
        .filter((q) => q.eq(q.field("portfolioId"), args.portfolioId))
        .unique();
      if (existing) {
        return { kind: "member" as const, id: existing._id };
      }
      const id = await ctx.db.insert("memberships", {
        portfolioId: args.portfolioId,
        userId: matchedUserId,
        ownershipBps: args.ownershipBps,
        role: args.role,
        displayName: args.displayName,
        joinedAt: Date.now()
      });
      return { kind: "member" as const, id };
    }

    // No user yet — write a pending invite.
    const id = await ctx.db.insert("invites", {
      portfolioId: args.portfolioId,
      invitedEmail: email,
      ownershipBps: args.ownershipBps,
      role: args.role,
      displayName: args.displayName,
      invitedByUserId,
      invitedAt: Date.now(),
      status: "pending"
    });
    return { kind: "invite" as const, id };
  }
});

/**
 * Owner-only. Patch a membership.
 */
export const updateMembership = mutation({
  args: {
    id: v.id("memberships"),
    patch: v.object({
      ownershipBps: v.optional(v.number()),
      role: v.optional(roleValidator),
      displayName: v.optional(v.string())
    })
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.id);
    if (!membership) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Membership not found" });
    }
    await requireOwner(ctx, membership.portfolioId);
    // Owner role can't be downgraded through this endpoint (use a separate
    // explicit transfer flow if needed).
    if (membership.role === "owner" && args.patch.role !== undefined) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot change the owner's role here"
      });
    }
    const patch: Record<string, unknown> = {};
    if (args.patch.ownershipBps !== undefined) patch.ownershipBps = args.patch.ownershipBps;
    if (args.patch.role !== undefined) patch.role = args.patch.role;
    if (args.patch.displayName !== undefined) patch.displayName = args.patch.displayName;
    await ctx.db.patch(args.id, patch);
  }
});

/**
 * Owner-only. Remove a membership; cannot remove the last owner.
 */
export const removeMembership = mutation({
  args: { id: v.id("memberships") },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.id);
    if (!membership) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Membership not found" });
    }
    await requireOwner(ctx, membership.portfolioId);
    if (membership.role === "owner") {
      const owners = await ctx.db
        .query("memberships")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", membership.portfolioId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();
      if (owners.length <= 1) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Cannot remove the last owner"
        });
      }
    }
    await ctx.db.delete(args.id);
  }
});

/**
 * Authed mutation. Reads my profile email, scans pending invites whose
 * lowercased email matches mine, materializes a membership for each, and
 * marks the invite accepted. Returns count redeemed.
 *
 * Call from the client immediately after `ensureProfile` so a freshly
 * signed-in user automatically picks up any portfolios they were invited to.
 */
export const redeemInvitesForMe = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const rawEmail = verifiedInvitationEmail(user);
    if (!rawEmail) return 0;
    const email = rawEmail.toLowerCase();

    const pending = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    let redeemed = 0;
    for (const invite of pending) {
      // Skip if user is somehow already a member.
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("portfolioId"), invite.portfolioId))
        .unique();
      if (!existing) {
        await ctx.db.insert("memberships", {
          portfolioId: invite.portfolioId,
          userId,
          ownershipBps: invite.ownershipBps,
          role: invite.role,
          displayName: invite.displayName,
          joinedAt: Date.now()
        });
      }
      await ctx.db.patch(invite._id, { status: "accepted" });
      redeemed += 1;
    }
    return redeemed;
  }
});

/**
 * List pending invites addressed to me, hydrated with the inviting portfolio.
 */
export const listPendingInvitesFor = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const rawEmail = verifiedInvitationEmail(user);
    if (!rawEmail) return [];
    const email = rawEmail.toLowerCase();
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    const hydrated = await Promise.all(
      invites.map(async (invite) => {
        const portfolio = await ctx.db.get(invite.portfolioId);
        return { invite, portfolio };
      })
    );
    return hydrated.filter(
      (
        x
      ): x is {
        invite: Doc<"invites">;
        portfolio: NonNullable<Awaited<ReturnType<typeof ctx.db.get<"portfolios">>>>;
      } => x.portfolio !== null
    );
  }
});
