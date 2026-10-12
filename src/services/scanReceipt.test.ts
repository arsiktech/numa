import { describe, expect, it } from "vitest";
import {
  AI_CONTEXT_ID_LIMIT,
  AI_CONTEXT_NAME_LIMIT,
  AI_RECEIPT_CONTEXT_LIST_LIMIT,
  AI_RECEIPT_TEXT_LIMIT
} from "@/lib/aiRequestLimits";
import { boundedReceiptText, boundedScanContext, type ScanContext } from "./scanReceipt";

function contextWithRows(count: number): ScanContext {
  return {
    portfolioName: "Numa",
    portfolioType: "personal",
    defaultCurrency: "EUR",
    categories: Array.from({ length: count }, (_, index) => ({
      id: `category-${index}`,
      name: `Category ${index}`,
      kind: "expense" as const
    })),
    members: Array.from({ length: count }, (_, index) => ({
      userId: `user-${index}`,
      displayName: `User ${index}`
    }))
  };
}

describe("receipt request bounds", () => {
  it("matches the server limits for large portfolio context", () => {
    const bounded = boundedScanContext(contextWithRows(101));
    expect(bounded.categories).toHaveLength(AI_RECEIPT_CONTEXT_LIST_LIMIT);
    expect(bounded.members).toHaveLength(AI_RECEIPT_CONTEXT_LIST_LIMIT);
  });

  it("trims and caps long dictated text", () => {
    const bounded = boundedReceiptText(`  old${"x".repeat(4_100)}new  `);
    expect(bounded).toHaveLength(AI_RECEIPT_TEXT_LIMIT);
    expect(bounded.startsWith("old")).toBe(true);
  });

  it("caps imported portfolio, category, and member fields", () => {
    const context = contextWithRows(1);
    context.portfolioName = "p".repeat(180);
    context.categories[0]!.id = "c".repeat(180);
    context.categories[0]!.name = "n".repeat(180);
    context.members[0]!.userId = "u".repeat(180);
    context.members[0]!.displayName = "m".repeat(180);

    const bounded = boundedScanContext(context);

    expect(bounded.portfolioName).toHaveLength(AI_CONTEXT_NAME_LIMIT);
    expect(bounded.categories[0]?.id).toHaveLength(AI_CONTEXT_ID_LIMIT);
    expect(bounded.categories[0]?.name).toHaveLength(AI_CONTEXT_NAME_LIMIT);
    expect(bounded.members[0]?.userId).toHaveLength(AI_CONTEXT_ID_LIMIT);
    expect(bounded.members[0]?.displayName).toHaveLength(AI_CONTEXT_NAME_LIMIT);
  });
});
