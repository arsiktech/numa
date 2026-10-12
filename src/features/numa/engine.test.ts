import { describe, expect, it } from "vitest";
import {
  aiDraftMutationOperation,
  buildContext,
  draftCompletionMessage,
  draftPortfolioId,
  parseActionDraft
} from "./engine";
import type { Category, CryptoWallet } from "@/lib/types";

const categories: Category[] = [
  {
    id: "cat_groceries",
    portfolioId: "p1",
    name: "Groceries",
    kind: "expense",
    icon: "cart",
    color: "mint",
    sortOrder: 0
  },
  {
    id: "cat_salary",
    portfolioId: "p1",
    name: "Salary",
    kind: "income",
    icon: "briefcase",
    color: "mint",
    sortOrder: 1
  }
];

function parse(text: string) {
  return parseActionDraft({
    text,
    portfolioId: "p1",
    defaultCurrency: "EUR",
    createdByUserId: "u1",
    categories
  });
}

describe("numa engine draft parser", () => {
  it("drafts a bare quick-add: merchant + amount", () => {
    const draft = parse("coffee 3.50");
    expect(draft?.actionType).toBe("transaction.create");
    if (draft?.actionType !== "transaction.create") return;
    expect(draft.payload.amount).toBe(3.5);
    expect(draft.payload.description).toBe("coffee");
    expect(draft.payload.kind).toBe("expense");
  });

  it("handles digits inside the merchant name — the trailing number is the amount", () => {
    const draft = parse("7eleven snacks 8.20");
    expect(draft?.actionType).toBe("transaction.create");
    if (draft?.actionType !== "transaction.create") return;
    expect(draft.payload.amount).toBe(8.2);
    expect(draft.payload.description).toContain("7eleven");
  });

  it("keeps comma decimals", () => {
    const draft = parse("mercadona 24,80");
    if (draft?.actionType !== "transaction.create") throw new Error("expected transaction");
    expect(draft.payload.amount).toBe(24.8);
  });

  it("never drafts from a question", () => {
    expect(parse("how much is coffee 3.50?")).toBeNull();
  });

  it("verb form keeps first-number semantics", () => {
    const draft = parse("add 20 for lunch");
    if (draft?.actionType !== "transaction.create") throw new Error("expected transaction");
    expect(draft.payload.amount).toBe(20);
  });

  it("income verbs draft income with the matching category", () => {
    const draft = parse("earned salary 2100");
    if (draft?.actionType !== "transaction.create") throw new Error("expected transaction");
    expect(draft.payload.kind).toBe("income");
    expect(draft.payload.categoryId).toBe("cat_salary");
  });

  it("budget wins over quick-add and targets a real category", () => {
    const draft = parse("set groceries budget to 450");
    expect(draft?.actionType).toBe("budget.update");
    if (draft?.actionType !== "budget.update") return;
    expect(draft.payload.categoryId).toBe("cat_groceries");
    expect(draft.payload.monthlyLimit).toBe(450);
  });

  it("budget draft is refused for unknown categories", () => {
    expect(parse("set travel budget to 300")?.actionType).not.toBe("budget.update");
  });
});

describe("numa engine draft execution metadata", () => {
  it("maps every supported draft to its durable mutation operation and portfolio", () => {
    const transaction = parse("coffee 3.50");
    if (!transaction) throw new Error("expected transaction draft");

    expect(aiDraftMutationOperation(transaction)).toBe("transactions.add");
    expect(draftPortfolioId(transaction)).toBe("p1");
  });

  it("does not claim a queued write is already complete", () => {
    const transaction = parse("coffee 3.50");
    if (!transaction) throw new Error("expected transaction draft");

    expect(draftCompletionMessage(transaction, true)).toMatch(/queued|sync/i);
    expect(draftCompletionMessage(transaction, true)).not.toMatch(/^Done\./);
  });
});

describe("numa engine money context", () => {
  it("caps every collection at the API contract before sending", () => {
    const context = buildContext({
      portfolio: { name: "Personal", defaultCurrency: "EUR" },
      transactions: [],
      categories: Array.from({ length: 105 }, (_, index) => ({
        id: `cat-${index}`,
        portfolioId: "p1",
        name: `Category ${index}`,
        kind: "expense" as const,
        icon: "tag",
        color: "mint",
        sortOrder: index
      })),
      assets: Array.from({ length: 105 }, (_, index) => ({
        id: `asset-${index}`,
        portfolioId: "p1",
        name: `Asset ${index}`,
        kind: "cash" as const,
        balance: index,
        currency: "EUR" as const
      })),
      liabilities: Array.from({ length: 105 }, (_, index) => ({
        id: `liability-${index}`,
        portfolioId: "p1",
        name: `Liability ${index}`,
        kind: "loan" as const,
        balance: index,
        currency: "EUR" as const
      })),
      holdings: [],
      quotes: {}
    });

    expect(context.categories).toHaveLength(100);
    expect(context.assets).toHaveLength(100);
    expect(context.liabilitiesDetail).toHaveLength(100);
  });

  it("caps imported names and descriptions at the shared API field limits", () => {
    const longName = "n".repeat(180);
    const longDescription = "d".repeat(260);
    const context = buildContext({
      portfolio: { name: longName, defaultCurrency: "EUR" },
      transactions: [{
        id: "tx-1",
        portfolioId: "p1",
        occurredAt: 1,
        description: longDescription,
        categoryId: "cat-1",
        kind: "expense",
        amount: 10,
        currency: "EUR",
        createdByUserId: "user-1"
      }],
      categories: [{
        id: "cat-1",
        portfolioId: "p1",
        name: longName,
        kind: "expense",
        icon: "tag",
        color: "mint",
        sortOrder: 0
      }],
      assets: [{
        id: "asset-1",
        portfolioId: "p1",
        name: longName,
        kind: "cash",
        balance: 1,
        currency: "EUR",
        updatedAt: 1
      }],
      liabilities: [{
        id: "liability-1",
        portfolioId: "p1",
        name: longName,
        kind: "loan",
        balance: 1,
        currency: "EUR",
        updatedAt: 1
      }],
      holdings: [],
      quotes: {}
    });

    expect(context.portfolio.name).toHaveLength(100);
    expect(context.categories[0]?.name).toHaveLength(100);
    expect(context.recentTransactions[0]?.description).toHaveLength(200);
    expect(context.recentTransactions[0]?.categoryName).toHaveLength(100);
    expect(context.assets[0]?.name).toHaveLength(100);
    expect(context.liabilitiesDetail[0]?.name).toHaveLength(100);
  });

  it("includes on-chain assets and debt without exposing the raw address", () => {
    const wallet: CryptoWallet = {
      id: "cw1",
      portfolioId: "p1",
      address: "0x000000000000000000000000000000000000dead",
      addressType: "evm",
      label: "Main wallet",
      includeInNetWorth: true,
      createdAt: 1,
      updatedAt: 2,
      snapshot: {
        provider: "moralis",
        addressType: "evm",
        tokenValueUsd: 100,
        defiValueUsd: 50,
        debtValueUsd: 20,
        totalValueUsd: 130,
        tokens: [],
        defiPositions: [],
        chains: ["Ethereum"],
        failedChains: [],
        tokensFetchedAt: 2,
        defiFetchedAt: 2,
        updatedAt: 2,
        partial: false
      }
    };
    const context = buildContext({
      portfolio: { name: "Personal", defaultCurrency: "USD" },
      transactions: [],
      categories: [],
      assets: [],
      liabilities: [],
      holdings: [],
      cryptoWallets: [wallet],
      quotes: {},
      fxRates: { EUR: 1, USD: 1 }
    });

    expect(context).toMatchObject({ netWorth: 130, invested: 150, liabilities: 20 });
    expect(context.onChainWallets[0]).toMatchObject({
      label: "Main wallet",
      totalUsd: 130,
      chains: ["Ethereum"],
      stale: true
    });
    expect(JSON.stringify(context)).not.toContain(wallet.address);
  });

  it("replaces address-like wallet labels before building AI context", () => {
    const address = "0x000000000000000000000000000000000000dead";
    const wallet: CryptoWallet = {
      id: "cw1",
      portfolioId: "p1",
      address,
      addressType: "evm",
      label: `Main ${address}`,
      includeInNetWorth: true,
      createdAt: 1,
      updatedAt: 1
    };
    const context = buildContext({
      portfolio: { name: "Personal", defaultCurrency: "USD" },
      transactions: [],
      categories: [],
      assets: [],
      liabilities: [],
      holdings: [],
      cryptoWallets: [wallet],
      quotes: {},
      fxRates: { EUR: 1, USD: 1 }
    });

    expect(context.onChainWallets[0]?.label).toBe("EVM wallet");
    expect(JSON.stringify(context)).not.toContain(address);
  });

  it("converts manual and on-chain capital into the same portfolio currency", () => {
    const context = buildContext({
      portfolio: { name: "Personal", defaultCurrency: "EUR" },
      transactions: [],
      categories: [],
      assets: [{
        id: "cash",
        portfolioId: "p1",
        name: "USD cash",
        kind: "cash",
        balance: 100,
        currency: "USD"
      }],
      liabilities: [],
      holdings: [],
      cryptoWallets: [{
        id: "cw1",
        portfolioId: "p1",
        address: "0x000000000000000000000000000000000000dead",
        addressType: "evm",
        label: "Main wallet",
        includeInNetWorth: true,
        createdAt: 1,
        updatedAt: 2,
        snapshot: {
          provider: "moralis",
          addressType: "evm",
          tokenValueUsd: 100,
          defiValueUsd: 50,
          debtValueUsd: 20,
          totalValueUsd: 130,
          tokens: [],
          defiPositions: [],
          chains: ["Ethereum"],
          failedChains: [],
          tokensFetchedAt: 2,
          defiFetchedAt: 2,
          updatedAt: 2,
          partial: false
        }
      }],
      quotes: {},
      fxRates: { EUR: 1, USD: 2 }
    });

    expect(context).toMatchObject({
      liquid: 50,
      invested: 75,
      liabilities: 10,
      netWorth: 115
    });
  });
});
