import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireEditor, requireMember, requireUser } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";

export function spaceKind(portfolio: Pick<Doc<"portfolios">, "type" | "spaceKind">) {
  return portfolio.spaceKind ?? (portfolio.type === "personal" ? "personal" : "legacy_shared");
}

export function spaceSummary(portfolio: Doc<"portfolios">, membership: Doc<"memberships">) {
  return {
    id: portfolio._id, name: portfolio.name, type: portfolio.type,
    spaceKind: spaceKind(portfolio), tagline: portfolio.tagline,
    defaultCurrency: portfolio.defaultCurrency, role: membership.role,
    ownershipBps: membership.ownershipBps,
    businessOwnershipBps: membership.businessOwnershipBps ?? null,
    createdAt: portfolio.createdAt
  };
}

export const listMine = query({
  args: {},
  handler: async ctx => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db.query("memberships").withIndex("by_user", q => q.eq("userId", userId)).collect();
    const rows = await Promise.all(memberships.map(async membership => {
      const portfolio = await ctx.db.get(membership.portfolioId);
      return portfolio ? spaceSummary(portfolio, membership) : null;
    }));
    return rows.filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)));
  }
});

/** Creates only a new isolated portfolio. Does not move, copy or value money. */
export const create = mutation({
  args: {
    name: v.string(), spaceKind: v.union(v.literal("personal"), v.literal("business")),
    currency: v.union(v.literal("USD"), v.literal("EUR")),
    businessOwnershipBps: v.optional(v.number()), clientMutationId: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 80) throw new Error("Space name must contain 1–80 characters");
    if (!args.clientMutationId.trim()) throw new Error("A stable request ID is required");
    if (args.businessOwnershipBps !== undefined &&
        (args.spaceKind !== "business" || !Number.isInteger(args.businessOwnershipBps) || args.businessOwnershipBps < 0 || args.businessOwnershipBps > 10000)) {
      throw new Error("Business ownership must be an explicit percentage from 0 to 100");
    }
    const receipt = await withMutationReceipt(ctx, userId, args.clientMutationId, "spaces.create", async () => {
      const now = Date.now();
      const id = await ctx.db.insert("portfolios", {
        name, spaceKind: args.spaceKind, type: "personal", tagline: "",
        ownerId: userId, defaultCurrency: args.currency, createdAt: now
      });
      await ctx.db.insert("memberships", {
        portfolioId: id, userId, role: "owner", ownershipBps: 10000,
        businessOwnershipBps: args.businessOwnershipBps,
        displayName: "Owner", joinedAt: now
      });
      // Zero is an explicit opening account value, not an inferred valuation.
      await ctx.db.insert("assets", { portfolioId: id, name: "Cash", kind: "cash", balance: 0,
        currency: args.currency, notes: "New space — no opening money entered", updatedAt: now });
      return id;
    }, JSON.stringify([name, args.spaceKind, args.currency, args.businessOwnershipBps ?? null]));
    await requireEditor(ctx, receipt.id);
    return receipt;
  }
});

/** Read-only compatibility plan. No mutation automatically relabels old money. */
export const migrationPreview = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    const { membership } = await requireMember(ctx, args.portfolioId);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio) throw new Error("Space not found");
    return { portfolioId: portfolio._id, currentKind: spaceKind(portfolio),
      explicitKind: portfolio.spaceKind ?? null, preservesIds: true,
      recordsMoved: 0, destructive: false, automaticReassignment: false,
      economicOwnershipBps: spaceKind(portfolio) === "business" ? membership.businessOwnershipBps ?? null : null,
      consolidation: "not-combined" };
  }
});
