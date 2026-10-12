import { describe, expect, it } from "vitest";
import {
  assertMobileTransactionRefs,
  mobileProfile,
  mobileTransactionAuditPayload
} from "./mobile";

describe("native mobile profile", () => {
  it("carries the account-deletion recovery deadline into bootstrap", () => {
    expect(mobileProfile(
      "user-1" as any,
      { email: "user@numa.app" } as any,
      {
        _id: "profile-1",
        displayName: "Numa User",
        defaultCurrency: "EUR",
        theme: "auto",
        locale: "en",
        appMode: "advanced",
        themeKey: "citrus",
        deletionScheduledAt: 1_800_000_000_000,
        createdAt: 1_700_000_000_000
      } as any
    ).deletionScheduledAt).toBe(1_800_000_000_000);
  });
});

describe("native mobile transaction audit payload", () => {
  it("normalizes the exact fields written by the financial mutation", () => {
    expect(mobileTransactionAuditPayload({
      portfolioId: "portfolio-1" as any,
      occurredAt: 1_777,
      description: "  Coffee  ",
      categoryId: "category-1" as any,
      accountId: "asset-1" as any,
      kind: "expense",
      amount: 4.5,
      currency: "EUR",
      notes: "  Morning  "
    }, "user-1" as any)).toEqual({
      portfolioId: "portfolio-1",
      occurredAt: 1_777,
      description: "Coffee",
      categoryId: "category-1",
      accountId: "asset-1",
      kind: "expense",
      amount: 4.5,
      currency: "EUR",
      notes: "Morning",
      createdByUserId: "user-1"
    });
  });
});

describe("native mobile transaction references", () => {
  const docs = new Map<string, unknown>([
    ["category-a", { portfolioId: "portfolio-a", kind: "expense" }],
    ["account-a", { portfolioId: "portfolio-a", kind: "cash", balance: 10 }],
    ["account-b", { portfolioId: "portfolio-b", kind: "cash", balance: 500 }]
  ]);
  const ctx = {
    db: { get: async (id: string) => docs.get(String(id)) ?? null }
  } as any;

  it("accepts only references owned by the transaction portfolio", async () => {
    await expect(assertMobileTransactionRefs(
      ctx,
      "portfolio-a" as any,
      "category-a" as any,
      "account-a" as any
    )).resolves.toMatchObject({ account: { balance: 10 } });

    await expect(assertMobileTransactionRefs(
      ctx,
      "portfolio-a" as any,
      "category-a" as any,
      "account-b" as any
    )).rejects.toThrow("Cash account does not belong to this portfolio");
  });
});
