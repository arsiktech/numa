import type { CurrencyCode } from "./types";
import { addMoney, assertBalancedMoney, assertCurrency } from "../../convex/lib/finance";

export type LedgerSide = "debit" | "credit";
export type LedgerNormalBalance = "debit" | "credit";
export type LedgerAccountKind =
  | "asset"
  | "liability"
  | "income"
  | "expense"
  | "equity"
  | "pod";

export interface LedgerAccount {
  id: string;
  portfolioId: string;
  name: string;
  kind: LedgerAccountKind;
  normalBalance: LedgerNormalBalance;
  currency: CurrencyCode;
  refType?: string;
  refId?: string;
}

export interface LedgerLine {
  id?: string;
  portfolioId: string;
  ledgerTransactionId: string;
  ledgerAccountId: string;
  side: LedgerSide;
  amount: number;
  currency: CurrencyCode;
}

export interface LedgerBalance {
  accountId: string;
  naturalBalance: number;
  debitTotal: number;
  creditTotal: number;
  currency: CurrencyCode;
}

export function assertBalancedLedgerLines(lines: Pick<LedgerLine, "side" | "amount" | "currency">[]) {
  assertBalancedMoney(lines);
}

export function rollupLedgerBalances(
  accounts: LedgerAccount[],
  lines: LedgerLine[]
): Record<string, LedgerBalance> {
  const byAccount = new Map(accounts.map((account) => [account.id, account]));
  const balances: Record<string, LedgerBalance> = {};
  if (byAccount.size !== accounts.length) throw new Error("Duplicate ledger account");
  if (new Set(accounts.map((account) => account.portfolioId)).size > 1) throw new Error("Ledger rollup requires one portfolio");

  for (const account of accounts) {
    assertCurrency(account.currency);
    balances[account.id] = {
      accountId: account.id,
      naturalBalance: 0,
      debitTotal: 0,
      creditTotal: 0,
      currency: account.currency
    };
  }

  for (const line of lines) {
    const account = byAccount.get(line.ledgerAccountId);
    if (!account || account.portfolioId !== line.portfolioId || account.currency !== line.currency) {
      throw new Error("Ledger line account, portfolio or currency mismatch");
    }
    // Old rows may predate cent-only writes. addMoney rounds those reads per
    // row without rewriting history; unknown/non-positive data is still invalid.
    if (!Number.isFinite(line.amount) || line.amount <= 0) throw new Error("Ledger line amount must be positive and finite");
    if (line.side !== "debit" && line.side !== "credit") throw new Error("Invalid ledger side");
    const current = balances[account.id]!;
    if (line.side === "debit") current.debitTotal = addMoney(current.debitTotal, line.amount);
    else current.creditTotal = addMoney(current.creditTotal, line.amount);
    current.naturalBalance =
      account.normalBalance === "debit"
        ? addMoney(current.debitTotal, -current.creditTotal)
        : addMoney(current.creditTotal, -current.debitTotal);
  }

  return balances;
}

export function ledgerNetWorth(accounts: LedgerAccount[], lines: LedgerLine[]) {
  if (new Set(accounts.map((account) => account.currency)).size > 1) throw new Error("A combined ledger total requires one currency; no implicit FX");
  const balances = rollupLedgerBalances(accounts, lines);
  return accounts.reduce(
    (total, account) => {
      const balance = balances[account.id]?.naturalBalance ?? 0;
      const assets =
        account.kind === "asset" || account.kind === "pod"
          ? addMoney(total.assets, balance)
          : total.assets;
      const liabilities =
        account.kind === "liability" ? addMoney(total.liabilities, balance) : total.liabilities;
      return { assets, liabilities, netWorth: addMoney(assets, -liabilities) };
    },
    { assets: 0, liabilities: 0, netWorth: 0 }
  );
}

export function ledgerCashflow(accounts: LedgerAccount[], lines: LedgerLine[]) {
  if (new Set(accounts.map((account) => account.currency)).size > 1) throw new Error("A combined ledger total requires one currency; no implicit FX");
  const balances = rollupLedgerBalances(accounts, lines);
  return accounts.reduce(
    (total, account) => {
      const balance = balances[account.id]?.naturalBalance ?? 0;
      const income = account.kind === "income" ? addMoney(total.income, balance) : total.income;
      const expense = account.kind === "expense" ? addMoney(total.expense, balance) : total.expense;
      return { income, expense, net: addMoney(income, -expense) };
    },
    { income: 0, expense: 0, net: 0 }
  );
}
