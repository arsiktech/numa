import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireEditor, type AnyCtx } from "./lib/access";
import { addMoney, assertCurrency, assertTimestamp, exactPositiveMoney } from "./lib/finance";
import { normalizeClientMutationId, withMutationReceipt } from "./lib/mutationReceipts";

const currency = v.union(v.literal("USD"), v.literal("EUR"));
type Transfer = Pick<Doc<"cashTransfers">, "portfolioId" | "fromAccountId" | "toAccountId" | "amount" | "currency" | "occurredAt">;

function required(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new ConvexError({ code: "INVALID_INPUT", message: `${label} is required` });
  return clean;
}
function replayKey(value: string) {
  const key = normalizeClientMutationId(value);
  if (!key) throw new ConvexError({ code: "INVALID_INPUT", message: "A replay key is required" });
  return key;
}
function validateTransfer(value: Transfer) {
  assertCurrency(value.currency);
  exactPositiveMoney(value.amount);
  assertTimestamp(value.occurredAt);
  if (value.occurredAt > Date.now()) throw new Error("Record transfers only after they occur; future transfers are not scheduled");
  if (value.fromAccountId === value.toAccountId) throw new Error("Choose two distinct cash accounts");
}

/** Validate every reference and resulting balance before changing either leg. */
async function applyTransferChange(ctx: MutationCtx, before: Transfer | null, after: Transfer | null) {
  if (after) validateTransfer(after);
  const changes = new Map<Id<"assets">, { account: Doc<"assets">; delta: number }>();
  for (const [transfer, sign] of [[before, -1], [after, 1]] as const) {
    if (!transfer) continue;
    for (const [id, direction] of [[transfer.fromAccountId, -1], [transfer.toAccountId, 1]] as const) {
      const account = await ctx.db.get(id);
      if (!account || account.kind !== "cash" || account.portfolioId !== transfer.portfolioId) {
        throw new Error("Both cash accounts must belong to this space");
      }
      if (account.currency !== transfer.currency) throw new Error("Transfer accounts and amount must use one currency; no implicit FX");
      const prior = changes.get(id);
      changes.set(id, { account, delta: addMoney(prior?.delta ?? 0, sign * direction * transfer.amount) });
    }
  }
  const patches = [...changes].map(([id, { account, delta }]) => ({ id, balance: addMoney(account.balance, delta) }));
  for (const { id, balance } of patches) await ctx.db.patch(id, { balance, updatedAt: Date.now() });
}

/** Account identity must survive later edits/deletions of recorded movements. */
export async function assertCashAccountDefinitionChange(
  ctx: AnyCtx, account: Doc<"assets">, after: { kind: string; currency: string } | null
) {
  if (after && after.kind === account.kind && after.currency === account.currency) return;
  const [transactions, transfersFrom, transfersTo, recurring] = await Promise.all([
    ctx.db.query("transactions").withIndex("by_portfolio_time", q => q.eq("portfolioId", account.portfolioId)).collect(),
    ctx.db.query("cashTransfers").withIndex("by_from_account", q => q.eq("fromAccountId", account._id)).collect(),
    ctx.db.query("cashTransfers").withIndex("by_to_account", q => q.eq("toAccountId", account._id)).collect(),
    ctx.db.query("recurring").withIndex("by_portfolio", q => q.eq("portfolioId", account.portfolioId)).collect()
  ]);
  if (transactions.some(row => row.accountId === account._id) || recurring.some(row => row.accountId === account._id) ||
      [...transfersFrom, ...transfersTo].some(row => row.deletedAt === undefined)) {
    throw new ConvexError({ code: "ACCOUNT_IN_USE", message: "This account is linked to money records. Keep its currency and type, and remove or reassign those records before deleting it." });
  }
}

export const createTransfer = mutation({
  args: {
    portfolioId: v.id("portfolios"), fromAccountId: v.id("assets"), toAccountId: v.id("assets"),
    amount: v.number(), currency, occurredAt: v.number(), description: v.string(), notes: v.optional(v.string()),
    sourceEventId: v.string(), clientMutationId: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const key = replayKey(args.clientMutationId);
    return await withMutationReceipt(ctx, userId, key, "money.createTransfer", async () => {
      validateTransfer(args);
      const description = required(args.description, "Description");
      const sourceEventId = required(args.sourceEventId, "Source event ID");
      if (sourceEventId.length > 120) throw new Error("Source event ID must not exceed 120 characters");
      const notes = args.notes?.trim() || undefined;
      const sourceFingerprint = JSON.stringify([args.fromAccountId, args.toAccountId, args.amount, args.currency, args.occurredAt, description, notes ?? null]);
      const prior = await ctx.db.query("cashTransfers")
        .withIndex("by_portfolio_source", q => q.eq("portfolioId", args.portfolioId).eq("sourceEventId", sourceEventId)).unique();
      if (prior) {
        if (prior.sourceFingerprint !== sourceFingerprint) throw new Error("Source event already has different transfer content");
        return prior._id; // Includes tombstones: completed deletions cannot be resurrected by a retry.
      }
      await applyTransferChange(ctx, null, args);
      const now = Date.now();
      return await ctx.db.insert("cashTransfers", {
        portfolioId: args.portfolioId, fromAccountId: args.fromAccountId, toAccountId: args.toAccountId,
        amount: args.amount, currency: args.currency, occurredAt: args.occurredAt, description, notes,
        sourceEventId, sourceFingerprint, createdByUserId: userId, createdAt: now, updatedAt: now
      });
    }, String(args.portfolioId));
  }
});

export const updateTransfer = mutation({
  args: {
    id: v.id("cashTransfers"), fromAccountId: v.optional(v.id("assets")), toAccountId: v.optional(v.id("assets")),
    amount: v.optional(v.number()), currency: v.optional(currency), occurredAt: v.optional(v.number()),
    description: v.optional(v.string()), notes: v.optional(v.union(v.string(), v.null())), clientMutationId: v.string()
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Transfer not found");
    const { userId } = await requireEditor(ctx, before.portfolioId);
    return await withMutationReceipt(ctx, userId, replayKey(args.clientMutationId), "money.updateTransfer", async () => {
      if (before.deletedAt !== undefined) throw new Error("Transfer was deleted");
      const patch: Partial<Doc<"cashTransfers">> = { updatedAt: Date.now() };
      if (args.fromAccountId !== undefined) patch.fromAccountId = args.fromAccountId;
      if (args.toAccountId !== undefined) patch.toAccountId = args.toAccountId;
      if (args.amount !== undefined) patch.amount = args.amount;
      if (args.currency !== undefined) patch.currency = args.currency;
      if (args.occurredAt !== undefined) patch.occurredAt = args.occurredAt;
      if (args.description !== undefined) patch.description = required(args.description, "Description");
      if (args.notes !== undefined) patch.notes = args.notes?.trim() || undefined;
      await applyTransferChange(ctx, before, { ...before, ...patch });
      await ctx.db.patch(args.id, patch);
      return args.id;
    }, String(before.portfolioId));
  }
});

export const deleteTransfer = mutation({
  args: { id: v.id("cashTransfers"), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Transfer not found");
    const { userId } = await requireEditor(ctx, before.portfolioId);
    return await withMutationReceipt(ctx, userId, replayKey(args.clientMutationId), "money.deleteTransfer", async () => {
      if (before.deletedAt === undefined) {
        await applyTransferChange(ctx, before, null);
        await ctx.db.patch(args.id, { deletedAt: Date.now(), updatedAt: Date.now() });
      }
      return args.id;
    }, String(before.portfolioId));
  }
});

/** Existing caps retain denomination when their amount changes. Clearing a cap
 * clears its denomination; a later new cap uses that space's current default. */
export async function categoryBudgetCurrency(
  ctx: AnyCtx, portfolioId: Id<"portfolios">, monthlyLimit: number | null | undefined,
  existing?: Pick<Doc<"categories">, "monthlyLimit" | "monthlyLimitCurrency">
) {
  if (monthlyLimit == null) return undefined;
  exactPositiveMoney(monthlyLimit);
  const portfolio = await ctx.db.get(portfolioId);
  if (!portfolio) throw new Error("Space not found");
  const denomination = existing?.monthlyLimit !== undefined
    ? existing.monthlyLimitCurrency ?? portfolio.defaultCurrency
    : portfolio.defaultCurrency;
  assertCurrency(denomination);
  return denomination;
}

export const setCategoryBudget = mutation({
  args: { categoryId: v.id("categories"), monthlyLimit: v.union(v.number(), v.null()), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) throw new Error("Category not found");
    const { userId } = await requireEditor(ctx, category.portfolioId);
    return await withMutationReceipt(ctx, userId, replayKey(args.clientMutationId), "money.setCategoryBudget", async () => {
      if (category.kind !== "expense") throw new Error("Monthly spending budgets require an expense category");
      const monthlyLimitCurrency = await categoryBudgetCurrency(ctx, category.portfolioId, args.monthlyLimit, category);
      await ctx.db.patch(args.categoryId, { monthlyLimit: args.monthlyLimit ?? undefined, monthlyLimitCurrency });
      return args.categoryId;
    }, String(category.portfolioId));
  }
});
