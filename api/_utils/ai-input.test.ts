import { describe, expect, it } from "vitest";
import { ChatBodySchema, ReceiptBodySchema } from "./ai-input";

const chatBody = {
  messages: [{ role: "user" as const, content: "Where did this week go?" }],
  context: {
    portfolio: { name: "Personal", defaultCurrency: "EUR" as const },
    netWorth: 100,
    liquid: 100,
    invested: 0,
    liabilities: 0,
    categories: [],
    recentTransactions: [],
    assets: [],
    liabilitiesDetail: []
  },
  locale: "en"
};

describe("AI API input bounds", () => {
  it("accepts the normal chat contract", () => {
    expect(ChatBodySchema.safeParse(chatBody).success).toBe(true);
  });

  it("rejects oversized chat histories and message content", () => {
    expect(
      ChatBodySchema.safeParse({
        ...chatBody,
        messages: Array.from({ length: 41 }, () => ({ role: "user", content: "hi" }))
      }).success
    ).toBe(false);
    expect(
      ChatBodySchema.safeParse({
        ...chatBody,
        messages: [{ role: "user", content: "x".repeat(4_001) }]
      }).success
    ).toBe(false);
  });

  it("bounds receipt images, transcripts, categories, and members before provider spend", () => {
    expect(ReceiptBodySchema.safeParse({ text: "coffee 3.50", locale: "en" }).success).toBe(true);
    expect(ReceiptBodySchema.safeParse({ text: "x".repeat(4_001) }).success).toBe(false);
    expect(
      ReceiptBodySchema.safeParse({ image: `data:image/jpeg;base64,${"a".repeat(6_000_001)}` }).success
    ).toBe(false);
    expect(
      ReceiptBodySchema.safeParse({
        text: "coffee 3.50",
        portfolioContext: {
          categories: Array.from({ length: 101 }, (_, index) => ({
            id: `category-${index}`,
            name: "Dining",
            kind: "expense"
          }))
        }
      }).success
    ).toBe(false);
  });
});
