import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireEditor } from "./access";
import { assertAssetBalance, assertPositiveAmount, cleanLocation, cleanParty, cleanRequired } from "./inputGuards";
import type { Doc } from "../_generated/dataModel";
import { majorUnits, minorUnits } from "./finance";
import { withMutationReceipt } from "./mutationReceipts";
import { refreshQuoteSoon } from "./quoteRefresh";
import { isCryptoSymbol } from "./marketQuoteProviders";
import { withAiAuditConfirmation } from "./aiAudit";
import {
  applyTransactionChange,
  assertTransactionMoney,
  replayDeletedTransaction
} from "./transactionFinance";
import { assertCashAccountDefinitionChange, categoryBudgetCurrency } from "../money";
import { cardDetailsValidator, cleanCardDetails } from "./cardDetails";
import {
  assertGoalRefs,
  assetKindValidator,
  categoryKindValidator,
  currencyValidator,
  goalScopeValidator,
  holdingKindValidator,
  liabilityKindValidator,
  mobileTransactionAuditPayload,
  txKindValidator
} from "./mobileSupport";

/**
 * Native-app wealth record mutations (transactions, categories, assets,
 * liabilities, holdings, goals). Grouped as a plain object so the public
 * api.mobile.* paths stay in mobile.ts.
 */

const createTransaction = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    occurredAt: v.number(),
    description: v.string(),
    categoryId: v.optional(v.id("categories")),
    accountId: v.optional(v.id("assets")),
    kind: txKindValidator,
    amount: v.number(),
    currency: currencyValidator,
    notes: v.optional(v.string()),
    card: v.optional(cardDetailsValidator),
    clientMutationId: v.optional(v.string()),
    auditDraftId: v.optional(v.id("aiActionDrafts"))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    assertTransactionMoney(args);
    const auditedPayload = mobileTransactionAuditPayload(args, userId);
    return await withAiAuditConfirmation(
      ctx,
      {
        userId,
        portfolioId: args.portfolioId,
        auditDraftId: args.auditDraftId,
        clientMutationId: args.clientMutationId,
        actionType: "transaction.create",
        actualPayload: auditedPayload,
        payloadKeys: [
          "portfolioId",
          "occurredAt",
          "description",
          "categoryId",
          "accountId",
          "kind",
          "amount",
          "currency",
          "notes",
          "createdByUserId"
        ]
      },
      async () => await withMutationReceipt(
        ctx,
        userId,
        args.clientMutationId,
        "mobile.createTransaction",
        async () => {
          await applyTransactionChange(ctx, null, args);
          const txId = await ctx.db.insert("transactions", { ...auditedPayload, ...(args.card ? { card: cleanCardDetails(args.card) } : {}) });
          return txId;
        },
        String(args.portfolioId)
      )
    );
  }
});

const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    occurredAt: v.optional(v.number()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    accountId: v.optional(v.union(v.id("assets"), v.null())),
    kind: v.optional(txKindValidator),
    amount: v.optional(v.number()),
    currency: v.optional(currencyValidator),
    notes: v.optional(v.union(v.string(), v.null())),
    card: v.optional(v.union(cardDetailsValidator, v.null())),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found" });
    const { userId } = await requireEditor(ctx, before.portfolioId);
    if (args.amount !== undefined) assertPositiveAmount(args.amount);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.updateTransaction", async () => {
      const patch: Record<string, unknown> = {};
      if (args.occurredAt !== undefined) patch.occurredAt = args.occurredAt;
      if (args.description !== undefined) patch.description = cleanRequired(args.description, "Description");
      if (args.categoryId !== undefined) patch.categoryId = args.categoryId ?? undefined;
      if (args.accountId !== undefined) patch.accountId = args.accountId ?? undefined;
      if (args.kind !== undefined) patch.kind = args.kind;
      if (args.amount !== undefined) patch.amount = args.amount;
      if (args.currency !== undefined) patch.currency = args.currency;
      if (args.notes !== undefined) patch.notes = args.notes?.trim() || undefined;
      if (args.card !== undefined) patch.card = args.card === null ? undefined : cleanCardDetails(args.card);
      const after = { ...before, ...patch } as Doc<"transactions">;
      await applyTransactionChange(ctx, before, after);
      await ctx.db.patch(args.id, patch);
      return args.id;
    }, String(before.portfolioId));
  }
});

const deleteTransaction = mutation({
  args: { id: v.id("transactions"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return await replayDeletedTransaction(ctx, args.id, args.clientMutationId, "mobile.deleteTransaction");
    const { userId } = await requireEditor(ctx, existing.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.deleteTransaction", async () => {
      await applyTransactionChange(ctx, existing, null);
      await ctx.db.delete(args.id);
      return args.id;
    }, String(existing.portfolioId));
  }
});

const createCategory = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: categoryKindValidator,
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    monthlyLimit: v.optional(v.number()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.createCategory", async () => {
      if (args.monthlyLimit !== undefined && args.kind !== "expense") throw new Error("Monthly spending budgets require an expense category");
      const monthlyLimitCurrency = await categoryBudgetCurrency(ctx, args.portfolioId, args.monthlyLimit);
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
        .collect();
      return await ctx.db.insert("categories", {
        portfolioId: args.portfolioId,
        name: cleanRequired(args.name, "Name"),
        kind: args.kind,
        icon: args.icon?.trim() || "tag",
        color: args.color?.trim() || "mint",
        sortOrder: existing.length,
        monthlyLimit: args.monthlyLimit,
        monthlyLimitCurrency
      });
    });
  }
});

const upsertAsset = mutation({
  args: {
    id: v.optional(v.id("assets")),
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: assetKindValidator,
    balance: v.number(),
    currency: currencyValidator,
    notes: v.optional(v.string()),
    location: v.optional(v.string()),
    /** Who owes this money to the person; an empty string clears it, leaving it out keeps it. */
    owedBy: v.optional(v.string()),
    /** Total paid, in the asset's currency; null clears it, leaving it out keeps what is saved. */
    costBasis: v.optional(v.union(v.number(), v.null())),
    acquiredAt: v.optional(v.union(v.number(), v.null())),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const extra = { ...cleanLocation(args.location), ...cleanParty("owedBy", args.owedBy) };
    const purchase = assetPurchase(args.costBasis, args.acquiredAt);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.upsertAsset", async () => {
      if (args.id) {
        const existing = await ctx.db.get(args.id);
        if (!existing || String(existing.portfolioId) !== String(args.portfolioId)) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Asset not found" });
        }
        // Native upserts resend every field, including unchanged legacy money.
        if (!Object.is(args.balance, existing.balance)) assertAssetBalance(args.balance);
        await assertCashAccountDefinitionChange(ctx, existing, args);
        await ctx.db.patch(args.id, {
          name: cleanRequired(args.name, "Name"),
          kind: args.kind,
          investmentType: args.kind === "other" ? existing.investmentType : undefined,
          balance: args.balance,
          currency: args.currency,
          notes: args.notes?.trim() || undefined,
          ...extra,
          ...purchase,
          updatedAt: Date.now()
        });
        return args.id;
      }
      assertAssetBalance(args.balance);
      return await ctx.db.insert("assets", {
        portfolioId: args.portfolioId,
        name: cleanRequired(args.name, "Name"),
        kind: args.kind,
        balance: args.balance,
        currency: args.currency,
        notes: args.notes?.trim() || undefined,
        ...extra,
        ...purchase,
        updatedAt: Date.now()
      });
    }, args.portfolioId);
  }
});

const DAY_MS = 86_400_000;

/** What an asset cost and when it was bought: undefined keeps what is stored, null clears it. */
function assetPurchase(costBasis: number | null | undefined, acquiredAt: number | null | undefined): { costBasis?: number; acquiredAt?: number } {
  const out: { costBasis?: number; acquiredAt?: number } = {};
  if (costBasis !== undefined) {
    if (costBasis !== null && (!Number.isFinite(costBasis) || costBasis <= 0 || majorUnits(minorUnits(costBasis)) !== costBasis)) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "What it cost must be more than zero, to the cent" });
    }
    out.costBasis = costBasis ?? undefined;
  }
  if (acquiredAt !== undefined) {
    if (acquiredAt !== null && (!Number.isSafeInteger(acquiredAt) || acquiredAt > Date.now() + DAY_MS)) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "When it was bought can't be in the future" });
    }
    out.acquiredAt = acquiredAt ?? undefined;
  }
  return out;
}

const deleteAsset = mutation({
  args: {
    id: v.id("assets"),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id);
    if (!asset) throw new ConvexError({ code: "NOT_FOUND", message: "Asset not found" });
    const { userId } = await requireEditor(ctx, asset.portfolioId);
    const receipt = await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.deleteAsset", async () => {
      await assertCashAccountDefinitionChange(ctx, asset, null);
      await ctx.db.delete(args.id);
      return args.id;
    }, asset.portfolioId);
    if (String(receipt.id) !== String(args.id)) {
      throw new ConvexError({ code: "DUPLICATE_CLIENT_MUTATION_ID", message: "Receipt belongs to a different record" });
    }
    return receipt;
  }
});

/** The in-kind fields to save: undefined keeps what is stored, an empty symbol clears both. */
function owedInKind(symbol: string | undefined, quantity: number | undefined): { owedSymbol?: string; owedQuantity?: number } | null {
  if (symbol === undefined) {
    if (quantity !== undefined) throw new ConvexError({ code: "INVALID_INPUT", message: "Say which asset the debt is owed in" });
    return null;
  }
  const s = symbol.trim().toUpperCase();
  if (!s) return { owedSymbol: undefined, owedQuantity: undefined };
  if (!isCryptoSymbol(s)) throw new ConvexError({ code: "INVALID_INPUT", message: `Debts can be owed in BTC, ETH, SOL, USDC, USDT or EURC, not ${s}` });
  if (quantity === undefined || !Number.isFinite(quantity) || quantity <= 0) throw new ConvexError({ code: "INVALID_INPUT", message: "Add how much is owed" });
  return { owedSymbol: s, owedQuantity: quantity };
}

const upsertLiability = mutation({
  args: {
    id: v.optional(v.id("liabilities")),
    portfolioId: v.id("portfolios"),
    name: v.string(),
    kind: liabilityKindValidator,
    balance: v.number(),
    currency: currencyValidator,
    interestRate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    /** Owed in an asset, like "BTC". Left out keeps what is saved; an empty string makes it a plain money debt again. */
    owedSymbol: v.optional(v.string()),
    owedQuantity: v.optional(v.number()),
    /** Who it is owed to; an empty string clears it, leaving it out keeps what is saved. */
    counterparty: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const owed = owedInKind(args.owedSymbol, args.owedQuantity);
    const party = cleanParty("counterparty", args.counterparty);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.upsertLiability", async () => {
      // A debt owed in an asset is worth that asset at today's price; without a price yet, the
      // amount the caller sent stands until one arrives.
      let balance = args.balance, currency = args.currency;
      if (owed?.owedSymbol) {
        const quote = await ctx.db.query("marketQuotes").withIndex("by_symbol", (q) => q.eq("symbol", owed.owedSymbol!)).unique();
        if (quote && quote.price > 0) { balance = Math.round(owed.owedQuantity! * quote.price * 100) / 100; currency = "USD"; }
      }
      const patch = {
        name: cleanRequired(args.name, "Name"),
        kind: args.kind,
        balance,
        currency,
        // Leaving the rate out keeps the one saved with the loan terms, so an update from Ask never wipes it.
        ...(args.interestRate !== undefined ? { interestRate: args.interestRate } : {}),
        dueDate: args.dueDate,
        notes: args.notes?.trim() || undefined,
        ...(owed ?? {}),
        ...party,
        updatedAt: Date.now()
      };
      if (args.id) {
        const existing = await ctx.db.get(args.id);
        if (!existing || String(existing.portfolioId) !== String(args.portfolioId)) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Liability not found" });
        }
        await ctx.db.patch(args.id, patch);
        if (owed?.owedSymbol) await refreshQuoteSoon(ctx, owed.owedSymbol);
        return args.id;
      }
      const id = await ctx.db.insert("liabilities", {
        portfolioId: args.portfolioId,
        ...patch
      });
      if (owed?.owedSymbol) await refreshQuoteSoon(ctx, owed.owedSymbol);
      return id;
    }, args.portfolioId);
  }
});

const deleteLiability = mutation({
  args: {
    id: v.id("liabilities"),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const liability = await ctx.db.get(args.id);
    if (!liability) throw new ConvexError({ code: "NOT_FOUND", message: "Liability not found" });
    const { userId } = await requireEditor(ctx, liability.portfolioId);
    const receipt = await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.deleteLiability", async () => {
      await ctx.db.delete(args.id);
      return args.id;
    }, liability.portfolioId);
    if (String(receipt.id) !== String(args.id)) {
      throw new ConvexError({ code: "DUPLICATE_CLIENT_MUTATION_ID", message: "Receipt belongs to a different record" });
    }
    return receipt;
  }
});

const upsertHolding = mutation({
  args: {
    id: v.optional(v.id("holdings")),
    portfolioId: v.id("portfolios"),
    symbol: v.string(),
    name: v.string(),
    kind: holdingKindValidator,
    quantity: v.number(),
    costBasis: v.number(),
    currency: currencyValidator,
    acquiredAt: v.number(),
    location: v.optional(v.string()),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    assertPositiveAmount(args.quantity);
    const location = cleanLocation(args.location);
    assertPositiveAmount(args.costBasis);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.upsertHolding", async () => {
      const patch = {
        symbol: cleanRequired(args.symbol, "Symbol").toUpperCase(),
        name: cleanRequired(args.name, "Name"),
        kind: args.kind,
        quantity: args.quantity,
        costBasis: args.costBasis,
        currency: args.currency,
        acquiredAt: args.acquiredAt,
        ...location
      };
      if (args.id) {
        const existing = await ctx.db.get(args.id);
        if (!existing || String(existing.portfolioId) !== String(args.portfolioId)) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Holding not found" });
        }
        await ctx.db.patch(args.id, patch);
        await refreshQuoteSoon(ctx, patch.symbol);
        return args.id;
      }
      const id = await ctx.db.insert("holdings", {
        portfolioId: args.portfolioId,
        ...patch
      });
      await refreshQuoteSoon(ctx, patch.symbol);
      return id;
    }, args.portfolioId);
  }
});

const deleteHolding = mutation({
  args: {
    id: v.id("holdings"),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const holding = await ctx.db.get(args.id);
    if (!holding) throw new ConvexError({ code: "NOT_FOUND", message: "Holding not found" });
    const { userId } = await requireEditor(ctx, holding.portfolioId);
    const receipt = await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.deleteHolding", async () => {
      await ctx.db.delete(args.id);
      return args.id;
    }, holding.portfolioId);
    if (String(receipt.id) !== String(args.id)) {
      throw new ConvexError({ code: "DUPLICATE_CLIENT_MUTATION_ID", message: "Receipt belongs to a different record" });
    }
    return receipt;
  }
});

const upsertGoal = mutation({
  args: {
    id: v.optional(v.id("goals")),
    portfolioId: v.id("portfolios"),
    scope: goalScopeValidator,
    target: v.number(),
    currency: currencyValidator,
    startAt: v.number(),
    deadline: v.optional(v.number()),
    label: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    assetId: v.optional(v.id("assets")),
    holdingId: v.optional(v.id("holdings")),
    createdAt: v.number(),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    assertPositiveAmount(args.target);
    await assertGoalRefs(ctx, args);

    const patch = {
      portfolioId: args.portfolioId,
      scope: args.scope,
      target: args.target,
      currency: args.currency,
      startAt: args.startAt,
      deadline: args.deadline,
      label: args.label?.trim() || undefined,
      categoryId: args.scope === "income_category" ? args.categoryId : undefined,
      assetId: args.scope === "asset_value" ? args.assetId : undefined,
      holdingId: args.scope === "holding_value" ? args.holdingId : undefined,
      createdAt: args.createdAt
    };

    return await withMutationReceipt(ctx, userId, args.clientMutationId, "mobile.upsertGoal", async () => {
      if (args.id) {
        const existing = await ctx.db.get(args.id);
        if (!existing || String(existing.portfolioId) !== String(args.portfolioId)) {
          throw new ConvexError({ code: "NOT_FOUND", message: "Goal not found" });
        }
        await ctx.db.patch(args.id, patch);
        return args.id;
      }
      return await ctx.db.insert("goals", patch);
    }, args.portfolioId);
  }
});

export const mobileRecords = {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createCategory,
  upsertAsset,
  deleteAsset,
  upsertLiability,
  deleteLiability,
  upsertHolding,
  deleteHolding,
  upsertGoal
};
