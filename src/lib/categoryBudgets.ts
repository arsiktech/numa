import type { Category, CurrencyCode, Transaction } from "./types";
import { addMoney, financeMonth } from "../../convex/lib/finance";

/** Budget caps retain their denomination. A foreign-currency expense makes
 * progress unavailable rather than silently converting or ignoring spending. */
export function currentMonthBudgetSpend(
  categories: Category[], transactions: Transaction[], defaultCurrency: CurrencyCode, nowMs = Date.now()
): Map<string, number | null> {
  const { start, end } = financeMonth(nowMs);
  const byId = new Map(categories.filter(category => category.kind === "expense").map(category => [category.id, category]));
  const spend = new Map<string, number | null>([...byId.keys()].map(id => [id, 0]));
  for (const tx of transactions) {
    if (tx.kind !== "expense" || !tx.categoryId) continue;
    const category = byId.get(tx.categoryId);
    if (!category || tx.portfolioId !== category.portfolioId) continue;
    if (!Number.isSafeInteger(tx.occurredAt)) { spend.set(category.id, null); continue; }
    if (tx.occurredAt < start || tx.occurredAt >= end || tx.occurredAt > nowMs) continue;
    const previous = spend.get(category.id);
    if (previous === null) continue;
    if (tx.currency !== (category.monthlyLimitCurrency ?? defaultCurrency) || tx.amount <= 0) {
      spend.set(category.id, null);
      continue;
    }
    try { spend.set(category.id, addMoney(previous ?? 0, tx.amount)); }
    catch { spend.set(category.id, null); }
  }
  return spend;
}
