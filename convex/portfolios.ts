import { v } from "convex/values";
import { seedStarterCategories } from "./lib/starterCategories";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser, requireOwner } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";

const portfolioTypeValidator = v.union(
  v.literal("personal"),
  v.literal("shared"),
  v.literal("family")
);
const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));

/**
 * List every portfolio the authed user is a member of.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const portfolios = await Promise.all(
      memberships.map((m) => ctx.db.get(m.portfolioId))
    );
    return portfolios
      .map((p, i) => (p ? { portfolio: p, membership: memberships[i] } : null))
      .filter((x): x is { portfolio: NonNullable<typeof portfolios[number]>; membership: typeof memberships[number] } => x !== null);
  }
});

/**
 * Create a portfolio + an owner membership for the caller.
 */
export const create = mutation({
  args: {
    name: v.string(),
    type: portfolioTypeValidator,
    tagline: v.string(),
    defaultCurrency: currencyValidator,
    seedDefaults: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "portfolios.create",
      async () => {
        const now = Date.now();
        const portfolioId = await ctx.db.insert("portfolios", {
          name: args.name,
          type: args.type,
          tagline: args.tagline,
          ownerId: userId,
          defaultCurrency: args.defaultCurrency,
          createdAt: now
        });
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique();
        const user = await ctx.db.get(userId);
        const displayName =
          profile?.displayName ??
          (user as { name?: string } | null)?.name ??
          ((user as { email?: string } | null)?.email ?? "").split("@")[0] ??
          "Owner";
        await ctx.db.insert("memberships", {
          portfolioId,
          userId,
          ownershipBps: 10000,
          role: "owner",
          displayName,
          joinedAt: now
        });
        if (args.seedDefaults) {
          await seedStarterCategories(ctx, portfolioId);
          await ctx.db.insert("assets", {
            portfolioId,
            name: "Cash",
            kind: "cash",
            balance: 0,
            currency: args.defaultCurrency,
            notes: "Starter account",
            updatedAt: now
          });
        }
        return portfolioId;
      }
    );
  }
});

/**
 * Update a portfolio's mutable fields. Owner-only.
 */
export const update = mutation({
  args: {
    id: v.id("portfolios"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      name: v.optional(v.string()),
      tagline: v.optional(v.string()),
      defaultCurrency: v.optional(currencyValidator)
    })
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx, args.id);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "portfolios.update",
      async () => {
        const patch: Record<string, unknown> = {};
        if (args.patch.name !== undefined) patch.name = args.patch.name;
        if (args.patch.tagline !== undefined) patch.tagline = args.patch.tagline;
        if (args.patch.defaultCurrency !== undefined) {
          const portfolio = await ctx.db.get(args.id);
          if (!portfolio) throw new Error("Space not found");
          if (args.patch.defaultCurrency !== portfolio.defaultCurrency) {
            // Freeze legacy cap denomination before changing the default. Known
            // currency is never relabeled or converted implicitly.
            const categories = await ctx.db.query("categories")
              .withIndex("by_portfolio", q => q.eq("portfolioId", args.id)).collect();
            for (const category of categories) {
              if (category.monthlyLimit !== undefined && category.monthlyLimitCurrency === undefined) {
                await ctx.db.patch(category._id, { monthlyLimitCurrency: portfolio.defaultCurrency });
              }
            }
          }
          patch.defaultCurrency = args.patch.defaultCurrency;
        }
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

/**
 * Delete a portfolio and all of its dependents. Owner-only.
 *
 * Cascade order: child rows first, then memberships, then invites, then the portfolio itself.
 */
export const remove = mutation({
  args: { id: v.id("portfolios"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx, args.id);
    const portfolioId: Id<"portfolios"> = args.id;
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "portfolios.remove",
      async () => {
        // Delete dependent child rows first.
        const categories = await ctx.db
          .query("categories")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of categories) await ctx.db.delete(row._id);

        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of transactions) await ctx.db.delete(row._id);

        const transfers = await ctx.db
          .query("cashTransfers")
          .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of transfers) await ctx.db.delete(row._id);

        const holdings = await ctx.db
          .query("holdings")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of holdings) await ctx.db.delete(row._id);

        const cryptoWallets = await ctx.db
          .query("cryptoWallets")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of cryptoWallets) await ctx.db.delete(row._id);

        const loanLinks = await ctx.db
          .query("loanLinks")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of loanLinks) await ctx.db.delete(row._id);

        const debtEvents = await ctx.db
          .query("debtEvents")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of debtEvents) await ctx.db.delete(row._id);

        const liabilitySources = await ctx.db
          .query("liabilitySources")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of liabilitySources) await ctx.db.delete(row._id);

        const assets = await ctx.db
          .query("assets")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of assets) await ctx.db.delete(row._id);

        const liabilities = await ctx.db
          .query("liabilities")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of liabilities) await ctx.db.delete(row._id);

        const settlements = await ctx.db
          .query("settlements")
          .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of settlements) await ctx.db.delete(row._id);

        const recurring = await ctx.db
          .query("recurring")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of recurring) await ctx.db.delete(row._id);

        const snapshots = await ctx.db
          .query("wealthSnapshots")
          .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of snapshots) await ctx.db.delete(row._id);

        // Holding events + goals reference portfolioId too — previously left dangling.
        const holdingEvents = await ctx.db
          .query("holdingEvents")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of holdingEvents) await ctx.db.delete(row._id);

        const goals = await ctx.db
          .query("goals")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of goals) await ctx.db.delete(row._id);

        // Memberships (must come after we no longer need to verify access).
        const memberships = await ctx.db
          .query("memberships")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of memberships) await ctx.db.delete(row._id);

        const invites = await ctx.db
          .query("invites")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId))
          .collect();
        for (const row of invites) await ctx.db.delete(row._id);

        await ctx.db.delete(portfolioId);
        return portfolioId;
      }
    );
  }
});
