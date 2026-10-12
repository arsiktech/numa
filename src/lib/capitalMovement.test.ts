import { describe, expect, it } from "vitest";
import { buildCapitalMovement } from "./capitalMovement";
import type { Asset, Holding, Liability, MarketQuote, Transaction } from "./types";

const NOW = new Date("2026-05-18T12:00:00Z");

describe("buildCapitalMovement", () => {
  it("combines net worth, cashflow, market, and shared drivers", () => {
    const assets: Asset[] = [
      {
        id: "a_cash",
        portfolioId: "p1",
        name: "Cash",
        kind: "cash",
        balance: 1000,
        currency: "EUR",
        updatedAt: NOW.getTime()
      }
    ];
    const holdings: Holding[] = [
      {
        id: "h_btc",
        portfolioId: "p1",
        symbol: "BTC",
        name: "Bitcoin",
        kind: "crypto",
        quantity: 1,
        costBasis: 200,
        currency: "EUR",
        acquiredAt: NOW.getTime()
      }
    ];
    const liabilities: Liability[] = [
      {
        id: "l_card",
        portfolioId: "p1",
        name: "Card",
        kind: "credit_card",
        balance: 150,
        currency: "EUR",
        updatedAt: NOW.getTime()
      }
    ];
    const transactions: Transaction[] = [
      {
        id: "t_income",
        portfolioId: "p1",
        occurredAt: NOW.getTime(),
        description: "Salary",
        kind: "income",
        amount: 500,
        currency: "EUR",
        createdByUserId: "u1"
      },
      {
        id: "t_food",
        portfolioId: "p1",
        occurredAt: NOW.getTime(),
        description: "Groceries",
        kind: "expense",
        amount: 80,
        currency: "EUR",
        createdByUserId: "u1"
      }
    ];
    const quotes: Record<string, MarketQuote> = {
      BTC: { symbol: "BTC", price: 260, changePercent: 3, provider: "mock", updatedAt: NOW.getTime() }
    };

    const summary = buildCapitalMovement({
      assets,
      holdings,
      liabilities,
      transactions,
      quotes,
      currency: "EUR",
      rates: { EUR: 1, USD: 1.08 },
      sharedDriver: -20,
      now: NOW
    });

    // Live quotes are USD-denominated (analytics.QUOTE_CURRENCY): the BTC
    // market value is 260 USD → 240.74 EUR at the explicitly supplied 1.08 test rate, while
    // the 200 cost basis is already EUR. The old expectations (1110/60/460)
    // pinned the pre-fix bug that read the quote as EUR.
    expect(summary.netWorth).toBeCloseTo(1090.74, 2);
    expect(summary.cashflowDriver).toBe(420);
    expect(summary.marketDriver).toBeCloseTo(40.74, 2);
    expect(summary.sharedDriver).toBe(-20);
    expect(summary.monthDelta).toBeCloseTo(440.74, 2);
    expect(summary.movementFeed.map((item) => item.id)).toContain("cashflow");
  });
});
