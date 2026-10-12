import { describe, expect, it } from "vitest";
import {
  assertBalancedLedgerLines,
  ledgerCashflow,
  ledgerNetWorth,
  rollupLedgerBalances,
  type LedgerAccount,
  type LedgerLine
} from "./ledger";

const accounts: LedgerAccount[] = [
  {
    id: "cash",
    portfolioId: "pf",
    name: "Cash",
    kind: "asset",
    normalBalance: "debit",
    currency: "EUR"
  },
  {
    id: "card",
    portfolioId: "pf",
    name: "Card",
    kind: "liability",
    normalBalance: "credit",
    currency: "EUR"
  },
  {
    id: "salary",
    portfolioId: "pf",
    name: "Salary",
    kind: "income",
    normalBalance: "credit",
    currency: "EUR"
  },
  {
    id: "food",
    portfolioId: "pf",
    name: "Food",
    kind: "expense",
    normalBalance: "debit",
    currency: "EUR"
  },
  {
    id: "broker",
    portfolioId: "pf",
    name: "Broker",
    kind: "asset",
    normalBalance: "debit",
    currency: "EUR"
  },
  {
    id: "pod",
    portfolioId: "pf",
    name: "Pod receivable",
    kind: "pod",
    normalBalance: "debit",
    currency: "EUR"
  }
];

const lines: LedgerLine[] = [
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-income",
    ledgerAccountId: "cash",
    side: "debit",
    amount: 3000,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-income",
    ledgerAccountId: "salary",
    side: "credit",
    amount: 3000,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-food",
    ledgerAccountId: "food",
    side: "debit",
    amount: 120,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-food",
    ledgerAccountId: "card",
    side: "credit",
    amount: 120,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-holding",
    ledgerAccountId: "broker",
    side: "debit",
    amount: 500,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-holding",
    ledgerAccountId: "cash",
    side: "credit",
    amount: 500,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-pod",
    ledgerAccountId: "pod",
    side: "debit",
    amount: 40,
    currency: "EUR"
  },
  {
    portfolioId: "pf",
    ledgerTransactionId: "tx-pod",
    ledgerAccountId: "cash",
    side: "credit",
    amount: 40,
    currency: "EUR"
  }
];

describe("ledger rollups", () => {
  it("validates balanced double-entry lines", () => {
    expect(() => assertBalancedLedgerLines(lines)).not.toThrow();
    expect(() =>
      assertBalancedLedgerLines([
        { side: "debit", amount: 10, currency: "EUR" },
        { side: "credit", amount: 9, currency: "EUR" }
      ])
    ).toThrow(/not balanced/);
  });

  it("rolls asset, liability, holding, and pod balances by natural side", () => {
    const balances = rollupLedgerBalances(accounts, lines);
    expect(balances.cash?.naturalBalance).toBe(2460);
    expect(balances.card?.naturalBalance).toBe(120);
    expect(balances.broker?.naturalBalance).toBe(500);
    expect(balances.pod?.naturalBalance).toBe(40);
  });

  it("derives net worth and cashflow from ledger lines", () => {
    expect(ledgerNetWorth(accounts, lines)).toEqual({
      assets: 3000,
      liabilities: 120,
      netWorth: 2880
    });
    expect(ledgerCashflow(accounts, lines)).toEqual({
      income: 3000,
      expense: 120,
      net: 2880
    });
  });
});
