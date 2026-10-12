import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireEditor, requireUser, type AnyCtx } from "./access";
import { normalizeClientMutationId } from "./mutationReceipts";
import { addMoney, assertCurrency, assertTimestamp, exactPositiveMoney } from "./finance";

type TransactionMoney = Pick<Doc<"transactions">, "portfolioId" | "kind" | "amount" | "currency" | "occurredAt" | "accountId" | "categoryId">;

export function assertTransactionMoney(tx: TransactionMoney) {
  assertCurrency(tx.currency);
  assertTimestamp(tx.occurredAt);
  exactPositiveMoney(tx.amount);
}

export async function transactionAccount(ctx: AnyCtx, tx: TransactionMoney, validateCategory = true) {
  if (tx.categoryId && validateCategory) {
    const category = await ctx.db.get(tx.categoryId);
    if (!category || category.portfolioId !== tx.portfolioId || category.kind !== tx.kind) {
      throw new ConvexError({ code: "INVALID_REFERENCE", message: "Category kind and portfolio must match the transaction" });
    }
  }
  if (!tx.accountId) return null;
  const account = await ctx.db.get(tx.accountId);
  if (!account || account.kind !== "cash" || account.portfolioId !== tx.portfolioId) {
    throw new ConvexError({ code: "INVALID_REFERENCE", message: "Cash account does not belong to this portfolio" });
  }
  if (account.currency !== tx.currency) {
    throw new ConvexError({ code: "CURRENCY_MISMATCH", message: "Cash account and transaction must use the same currency; no implicit FX" });
  }
  return account;
}

/** Validate both sides before writing; combine a same-account edit into one delta. */
export async function applyTransactionChange(ctx: MutationCtx, before: TransactionMoney | null, after: TransactionMoney | null) {
  if (after) assertTransactionMoney(after);
  const changes = new Map<Id<"assets">, { account: Doc<"assets">; delta: number }>();
  for (const [tx, sign] of [[before, -1], [after, 1]] as const) {
    if (!tx) continue;
    const validateCategory = sign === 1 && (!before || before.categoryId !== tx.categoryId || before.kind !== tx.kind);
    const account = await transactionAccount(ctx, tx, validateCategory);
    if (!account) continue;
    const delta = sign * (tx.kind === "income" ? tx.amount : -tx.amount);
    const prior = changes.get(account._id);
    changes.set(account._id, { account, delta: addMoney(prior?.delta ?? 0, delta) });
  }
  const patches = [...changes].map(([id, { account, delta }]) => ({ id, balance: addMoney(account.balance, delta) }));
  for (const { id, balance } of patches) await ctx.db.patch(id, { balance, updatedAt: Date.now() });
}

/** Deleted-row retries authenticate and check current scope when recorded.
 * Legacy unscoped receipts only acknowledge that actor's completed deletion. */
export async function replayDeletedTransaction(ctx: MutationCtx, id: Id<"transactions">, key: string | undefined, operation: string) {
  const userId = await requireUser(ctx);
  const clientMutationId = normalizeClientMutationId(key);
  if (clientMutationId) {
    const receipt = await ctx.db.query("mutationReceipts")
      .withIndex("by_client_mutation", q => q.eq("clientMutationId", clientMutationId)).unique();
    if (receipt && receipt.userId === userId && receipt.operation === operation && receipt.resultId === String(id)) {
      if (receipt.scopeId) await requireEditor(ctx, receipt.scopeId as Id<"portfolios">);
      return { id, clientMutationId, replayed: true };
    }
  }
  throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found or no authorized deletion receipt" });
}
