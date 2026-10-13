import { v, ConvexError } from "convex/values";
import { removePortfolioDocument } from "./lib/removeDocument";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember, requireUser, type AnyCtx } from "./lib/access";
import type { Id } from "./_generated/dataModel";
import { withMutationReceipt } from "./lib/mutationReceipts";
import { assertTimestamp, minorUnits } from "./lib/finance";
import { snapshotLine } from "./schema";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));

function assertSnapshot(input: {
  takenAt: number; netWorth: number; liquid: number; invested: number;
  hardAssets: number; liabilities: number;
}) {
  assertTimestamp(input.takenAt);
  const components = [input.liquid, input.invested, input.hardAssets, input.liabilities].map(minorUnits);
  if (minorUnits(input.netWorth) !== components[0]! + components[1]! + components[2]! - components[3]!) {
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Snapshot components must reconcile to net worth." });
  }
}

type SnapshotLine = { group: "liquid" | "crypto" | "stocks" | "hard" | "debt"; name: string; amount: number };
const MAX_LINES = 80;

/**
 * A date's positions must add up to the split it records, so the details never disagree with the
 * chart. Positive amounts count as owned by kind; debt and negative amounts count as owed.
 */
function assertLines(lines: SnapshotLine[], parts: { liquid: number; invested: number; hardAssets: number; liabilities: number }) {
  if (lines.length > MAX_LINES) throw new ConvexError({ code: "INVALID_ARGUMENT", message: `A date can hold at most ${MAX_LINES} lines.` });
  const sums = { liquid: 0, invested: 0, hard: 0, owe: 0 };
  for (const line of lines) {
    const name = line.name.trim();
    if (!name || name.length > 60) throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Each line needs a name of up to 60 characters." });
    const cents = minorUnits(line.amount);
    if (line.group === "debt" || cents < 0) sums.owe += Math.abs(cents);
    else if (line.group === "liquid") sums.liquid += cents;
    else if (line.group === "hard") sums.hard += cents;
    else sums.invested += cents;
  }
  if (lines.length && (sums.liquid !== minorUnits(parts.liquid) || sums.invested !== minorUnits(parts.invested)
    || sums.hard !== minorUnits(parts.hardAssets) || sums.owe !== minorUnits(Math.abs(parts.liabilities)))) {
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Snapshot lines must add up to its liquid, invested, hard and owed totals." });
  }
}

async function optionalEditorForAutoSnapshot(
  ctx: AnyCtx,
  portfolioId: Id<"portfolios">
) {
  let userId: Id<"users">;
  try {
    userId = await requireUser(ctx);
  } catch {
    return null;
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("portfolioId"), portfolioId))
    .unique();
  if (!membership) return null;
  if (membership.role !== "owner" && membership.role !== "editor") return null;
  return { userId, membership, role: membership.role };
}

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("wealthSnapshots")
      .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
    return rows.sort((a, b) => b.takenAt - a.takenAt);
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    takenAt: v.number(),
    netWorth: v.number(),
    liquid: v.number(),
    invested: v.number(),
    hardAssets: v.number(),
    liabilities: v.number(),
    currency: currencyValidator,
    label: v.optional(v.string()),
    isAuto: v.boolean(),
    lines: v.optional(v.array(snapshotLine)),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const access = args.isAuto
      ? await optionalEditorForAutoSnapshot(ctx, args.portfolioId)
      : await requireEditor(ctx, args.portfolioId);
    if (!access) return;
    return await withMutationReceipt(
      ctx,
      access.userId,
      args.clientMutationId,
      "wealthSnapshots.add",
      async () => {
        assertSnapshot(args);
        if (args.lines) assertLines(args.lines, args);
        if (args.isAuto) {
          const month = new Date(args.takenAt).toISOString().slice(0, 7);
          const existing = await ctx.db.query("wealthSnapshots")
            .withIndex("by_portfolio_time", q => q.eq("portfolioId", args.portfolioId)).collect();
          const sameMonth = existing.find(row => row.isAuto && new Date(row.takenAt).toISOString().slice(0, 7) === month);
          if (sameMonth) return sameMonth._id;
        }
        return await ctx.db.insert("wealthSnapshots", {
          portfolioId: args.portfolioId,
          takenAt: args.takenAt,
          netWorth: args.netWorth,
          liquid: args.liquid,
          invested: args.invested,
          hardAssets: args.hardAssets,
          liabilities: args.liabilities,
          currency: args.currency,
          label: args.label,
          isAuto: args.isAuto,
          ...(args.lines?.length ? { lines: args.lines } : {})
        });
      },
      String(args.portfolioId)
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("wealthSnapshots"),
    clientMutationId: v.optional(v.string()),
    patch: v.object({
      takenAt: v.optional(v.number()),
      netWorth: v.optional(v.number()),
      liquid: v.optional(v.number()),
      invested: v.optional(v.number()),
      hardAssets: v.optional(v.number()),
      liabilities: v.optional(v.number()),
      currency: v.optional(currencyValidator),
      label: v.optional(v.string()),
      isAuto: v.optional(v.boolean()),
      // An empty list removes a date's details.
      lines: v.optional(v.array(snapshotLine))
    })
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Snapshot not found" });
    }
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "wealthSnapshots.update",
      async () => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args.patch)) {
          if (value !== undefined) patch[key] = value;
        }
        // Keep legacy snapshots label-editable without migrating their values.
        if (["takenAt", "netWorth", "liquid", "invested", "hardAssets", "liabilities", "currency"]
          .some(key => key in patch)) assertSnapshot({ ...existing, ...patch });
        const lines = "lines" in patch ? patch.lines as SnapshotLine[] : existing.lines;
        if (lines?.length) assertLines(lines, { ...existing, ...patch } as Parameters<typeof assertLines>[1]);
        if ("lines" in patch && !(patch.lines as SnapshotLine[]).length) patch.lines = undefined;
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
    );
  }
});

export const remove = mutation({
  args: { id: v.id("wealthSnapshots"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await removePortfolioDocument(ctx, args.id, args.clientMutationId, "wealthSnapshots.remove")
});
