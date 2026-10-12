import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt, normalizeClientMutationId } from "./lib/mutationReceipts";
import { assertBalancedMoney, assertClassifiedAccounts, assertTimestamp, exactPositiveMoney } from "./lib/finance";
import { financeClassificationValidator } from "./lib/financeValidators";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
const accountKindValidator = v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("income"),
  v.literal("expense"),
  v.literal("equity"),
  v.literal("pod")
);
const normalBalanceValidator = v.union(v.literal("debit"), v.literal("credit"));
const sourceTypeValidator = v.union(
  v.literal("transaction"),
  v.literal("asset"),
  v.literal("liability"),
  v.literal("holding"),
  v.literal("pod_expense"),
  v.literal("settlement"),
  v.literal("manual"),
  v.literal("migration")
);
const refTypeValidator = v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("holding"),
  v.literal("category"),
  v.literal("pod"),
  v.literal("member"),
  v.literal("system")
);
const lineValidator = v.object({
  ledgerAccountId: v.id("ledgerAccounts"),
  side: normalBalanceValidator,
  amount: v.number(),
  currency: currencyValidator,
  memo: v.optional(v.string())
});

async function assertAccountDefinitionChange(ctx: MutationCtx, existing: Doc<"ledgerAccounts">, patch: Partial<Doc<"ledgerAccounts">>) {
  if (["kind", "normalBalance", "currency", "refType", "refId"].some(key => existing[key as keyof typeof existing] !== patch[key as keyof typeof patch])) {
    const line = await ctx.db.query("ledgerLines").withIndex("by_account", q => q.eq("ledgerAccountId", existing._id)).first();
    if (line) throw new Error("An account with postings cannot change its financial definition");
  }
}

export const listAccounts = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("ledgerAccounts")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const listTransactions = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db
      .query("ledgerTransactions")
      .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
    return rows.sort((a, b) => b.occurredAt - a.occurredAt);
  }
});

export const listLinesForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("ledgerLines")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const upsertAccount = mutation({
  args: {
    id: v.optional(v.id("ledgerAccounts")),
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: accountKindValidator,
    normalBalance: normalBalanceValidator,
    currency: currencyValidator,
    refType: v.optional(refTypeValidator),
    refId: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const expectedNormal = ["liability", "income", "equity"].includes(args.kind) ? "credit" : "debit";
    if (args.normalBalance !== expectedNormal) throw new Error("Account normal balance does not match its kind");
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "ledger.upsertAccount",
      async () => {
        const now = Date.now();
        const patch = {
          portfolioId: args.portfolioId,
          name: args.name.trim() || "Ledger account",
          kind: args.kind,
          normalBalance: args.normalBalance,
          currency: args.currency,
          refType: args.refType,
          refId: args.refId,
          updatedAt: now
        };

        if (args.id) {
          const existing = await ctx.db.get(args.id);
          if (!existing) {
            throw new ConvexError({ code: "NOT_FOUND", message: "Ledger account not found" });
          }
          if (String(existing.portfolioId) !== String(args.portfolioId)) {
            throw new ConvexError({ code: "INVALID_LEDGER_ACCOUNT", message: "Portfolio cannot change" });
          }
          await assertAccountDefinitionChange(ctx, existing, patch);
          await ctx.db.patch(args.id, patch);
          return args.id;
        }

        if (args.refType && args.refId) {
          const existing = await ctx.db
            .query("ledgerAccounts")
            .withIndex("by_ref", (q) => q.eq("refType", args.refType).eq("refId", args.refId))
            .first();
          if (existing && String(existing.portfolioId) === String(args.portfolioId)) {
            await assertAccountDefinitionChange(ctx, existing, patch);
            await ctx.db.patch(existing._id, patch);
            return existing._id;
          }
        }

        return await ctx.db.insert("ledgerAccounts", {
          ...patch,
          createdAt: now
        });
      }
    );
  }
});

export const recordTransaction = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    sourceType: sourceTypeValidator,
    sourceId: v.optional(v.string()),
    occurredAt: v.number(),
    description: v.string(),
    currency: currencyValidator,
    lines: v.array(lineValidator),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    if (args.lines.length < 2) {
      throw new ConvexError({
        code: "INVALID_LEDGER_TRANSACTION",
        message: "Ledger transaction needs at least two lines"
      });
    }
    assertTimestamp(args.occurredAt);
    assertBalancedMoney(args.lines);

    for (const line of args.lines) {
      const account = await ctx.db.get(line.ledgerAccountId);
      if (!account || String(account.portfolioId) !== String(args.portfolioId) || account.currency !== line.currency || args.currency !== line.currency) {
        throw new ConvexError({
          code: "INVALID_LEDGER_LINE",
          message: "Ledger line account must match portfolio and currency"
        });
      }
    }

    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "ledger.recordTransaction",
      async () => {
        const now = Date.now();
        const ledgerTransactionId = await ctx.db.insert("ledgerTransactions", {
          portfolioId: args.portfolioId,
          sourceType: args.sourceType,
          sourceId: args.sourceId,
          occurredAt: args.occurredAt,
          description: args.description.trim() || "Ledger transaction",
          currency: args.currency,
          createdByUserId: userId,
          clientMutationId: args.clientMutationId,
          createdAt: now
        });
        for (const line of args.lines) {
          await ctx.db.insert("ledgerLines", {
            portfolioId: args.portfolioId,
            ledgerTransactionId,
            ledgerAccountId: line.ledgerAccountId,
            side: line.side,
            amount: line.amount,
            currency: line.currency,
            memo: line.memo,
            createdAt: now
          });
        }
        return ledgerTransactionId;
      }
    );
  }
});

export const removeTransaction = mutation({
  args: {
    ledgerTransactionId: v.id("ledgerTransactions"),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.ledgerTransactionId);
    if (!existing) return;
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    if (existing.classification || existing.reversesId) throw new Error("Classified entries are immutable; record a reversal instead");
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "ledger.removeTransaction",
      async () => {
        const lines = await ctx.db
          .query("ledgerLines")
          .withIndex("by_transaction", (q) =>
            q.eq("ledgerTransactionId", args.ledgerTransactionId)
          )
          .collect();
        for (const line of lines) {
          await ctx.db.delete(line._id);
        }
        await ctx.db.delete(args.ledgerTransactionId);
        return args.ledgerTransactionId;
      }
    );
  }
});

export const migrationPreview = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const [transactions, assets, liabilities, holdings, settlements] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
        .collect(),
      ctx.db
        .query("assets")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
        .collect(),
      ctx.db
        .query("liabilities")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
        .collect(),
      ctx.db
        .query("holdings")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
        .collect(),
      ctx.db
        .query("settlements")
        .withIndex("by_portfolio_time", (q) => q.eq("portfolioId", args.portfolioId))
        .collect()
    ]);
    return {
      transactions: transactions.length,
      assets: assets.length,
      liabilities: liabilities.length,
      holdings: holdings.length,
      settlements: settlements.length,
      destructive: false
    };
  }
});

/** Typed finance writes stay in the ledger lane; never also write a legacy
 * income/expense or asset balance. Cutover is a separate reviewed migration. */
export const recordClassifiedTransaction = mutation({
  args: {
    portfolioId: v.id("portfolios"), classification: financeClassificationValidator,
    debitAccountId: v.id("ledgerAccounts"), creditAccountId: v.id("ledgerAccounts"),
    amount: v.number(), currency: currencyValidator, occurredAt: v.number(),
    description: v.string(), sourceEventId: v.string(), clientMutationId: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    if (!normalizeClientMutationId(args.clientMutationId)) throw new Error("A replay key is required");
    const sourceId = args.sourceEventId.trim();
    if (!sourceId || sourceId.length > 120) throw new Error("A stable source event ID of at most 120 characters is required");
    exactPositiveMoney(args.amount);
    assertTimestamp(args.occurredAt);
    if (!args.description.trim()) throw new Error("Description is required");
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "ledger.recordClassifiedTransaction", async () => {
      const debit = await ctx.db.get(args.debitAccountId);
      const credit = await ctx.db.get(args.creditAccountId);
      if (!debit || !credit || debit._id === credit._id) throw new Error("Two distinct ledger accounts are required");
      for (const account of [debit, credit]) {
        if (account.portfolioId !== args.portfolioId || account.currency !== args.currency) throw new Error("Ledger account portfolio or currency mismatch");
        const normal = ["income", "liability", "equity"].includes(account.kind) ? "credit" : "debit";
        if (account.normalBalance !== normal) throw new Error("Ledger account has an incompatible normal balance");
      }
      assertClassifiedAccounts(args.classification, debit.kind, credit.kind);
      // Source identity deduplicates both transfer legs and retries with a new
      // transport key. Refuse conflicting re-use instead of silently rewriting.
      const prior = await ctx.db.query("ledgerTransactions").withIndex("by_source", q => q.eq("sourceType", "manual").eq("sourceId", sourceId))
        .filter(q => q.eq(q.field("portfolioId"), args.portfolioId)).unique();
      if (prior) {
        const lines = await ctx.db.query("ledgerLines").withIndex("by_transaction", q => q.eq("ledgerTransactionId", prior._id)).collect();
        if (prior.classification !== args.classification || prior.occurredAt !== args.occurredAt || prior.currency !== args.currency ||
            lines.length !== 2 || !lines.some(l => l.ledgerAccountId === debit._id && l.side === "debit" && l.amount === args.amount) ||
            !lines.some(l => l.ledgerAccountId === credit._id && l.side === "credit" && l.amount === args.amount)) throw new Error("Source event already has a different financial posting");
        return prior._id;
      }
      const now = Date.now();
      const id = await ctx.db.insert("ledgerTransactions", {
        portfolioId: args.portfolioId, classification: args.classification,
        sourceType: "manual", sourceId, occurredAt: args.occurredAt,
        description: args.description.trim(), currency: args.currency,
        createdByUserId: userId, clientMutationId: args.clientMutationId, createdAt: now
      });
      for (const [account, side] of [[debit, "debit"], [credit, "credit"]] as const) {
        await ctx.db.insert("ledgerLines", { portfolioId: args.portfolioId, ledgerTransactionId: id,
          ledgerAccountId: account._id, side, amount: args.amount, currency: args.currency, createdAt: now });
      }
      return id;
    }, String(args.portfolioId));
  }
});

/** A full refund/correction is an immutable opposite posting in its own period.
 * Partial refunds and reversing a reversal are intentionally not supported yet. */
export const reverseClassifiedTransaction = mutation({
  args: { id: v.id("ledgerTransactions"), occurredAt: v.number(), description: v.string(), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const original = await ctx.db.get(args.id);
    if (!original) throw new Error("Ledger transaction not found");
    const { userId } = await requireEditor(ctx, original.portfolioId);
    if (!original.classification || original.reversesId) throw new Error("Only an original classified entry can be reversed");
    if (!normalizeClientMutationId(args.clientMutationId)) throw new Error("A replay key is required");
    assertTimestamp(args.occurredAt);
    if (args.occurredAt < original.occurredAt || !args.description.trim()) throw new Error("A reversal needs a reason and cannot precede the original");
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "ledger.reverseClassifiedTransaction", async () => {
      const prior = await ctx.db.query("ledgerTransactions").withIndex("by_reversal", q => q.eq("reversesId", args.id)).unique();
      if (prior) return prior._id;
      const lines = await ctx.db.query("ledgerLines").withIndex("by_transaction", q => q.eq("ledgerTransactionId", args.id)).collect();
      assertBalancedMoney(lines);
      const now = Date.now();
      const id = await ctx.db.insert("ledgerTransactions", { portfolioId: original.portfolioId,
        classification: original.classification, reversesId: original._id, sourceType: "manual",
        occurredAt: args.occurredAt, description: args.description.trim(), currency: original.currency,
        createdByUserId: userId, clientMutationId: args.clientMutationId, createdAt: now });
      for (const line of lines) {
        await ctx.db.insert("ledgerLines", { portfolioId: original.portfolioId, ledgerTransactionId: id,
          ledgerAccountId: line.ledgerAccountId, side: line.side === "debit" ? "credit" : "debit",
          amount: line.amount, currency: line.currency, createdAt: now });
      }
      return id;
    }, String(original.portfolioId));
  }
});
