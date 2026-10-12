import { describe, expect, it } from "vitest";
import { buildPodCategoryBreakdown, inferPodCategory } from "./podCategories";
import type { Category, PodExpense } from "./types";

const categories: Category[] = [
  { id: "cat_grocery", portfolioId: "pf", name: "Groceries", kind: "expense", icon: "shopping-basket", color: "mint", sortOrder: 0 },
  { id: "cat_dining", portfolioId: "pf", name: "Dining", kind: "expense", icon: "utensils", color: "peach", sortOrder: 1 },
  { id: "cat_transport", portfolioId: "pf", name: "Transport", kind: "expense", icon: "car", color: "sand", sortOrder: 2 },
  { id: "cat_utilities", portfolioId: "pf", name: "Utilities", kind: "expense", icon: "zap", color: "sky", sortOrder: 3 },
  { id: "cat_salary", portfolioId: "pf", name: "Salary", kind: "income", icon: "briefcase", color: "mint", sortOrder: 4 }
];

function expense(partial: Partial<PodExpense>): PodExpense {
  return {
    id: partial.id ?? "pe",
    podId: "pod",
    paidByMemberId: "m1",
    amount: partial.amount ?? 10,
    currency: partial.currency ?? "EUR",
    description: partial.description ?? "Coffee",
    categoryId: partial.categoryId,
    occurredAt: 1,
    splitMode: "equal_people",
    participantMemberIds: ["m1", "m2"]
  };
}

describe("pod category inference", () => {
  it("matches common merchant descriptions", () => {
    expect(inferPodCategory("Iberdrola factura", categories)?.name).toBe("Utilities");
    expect(inferPodCategory("Bolt ride", categories)?.name).toBe("Transport");
    expect(inferPodCategory("Lemongrass dinner", categories)?.name).toBe("Dining");
    expect(inferPodCategory("Mercadona groceries", categories)?.name).toBe("Groceries");
    expect(inferPodCategory("Maria Soledad Torres Miralles", categories)?.name).toBe("Rent");
    expect(inferPodCategory("Digi fibra internet", categories)?.name).toBe("Utilities");
    expect(inferPodCategory("Savage lounge", categories)?.name).toBe("Dining");
    expect(inferPodCategory("Repsol gasolina", categories)?.name).toBe("Transport");
    expect(inferPodCategory("99 cheesecakes", categories)?.name).toBe("Dining");
    expect(inferPodCategory("LA CONDESA", categories)?.name).toBe("Dining");
    expect(inferPodCategory("CASA BOMBA VIELHA", categories)?.name).toBe("Dining");
    expect(inferPodCategory("ZUNDER", categories)?.name).toBe("Transport");
    expect(inferPodCategory("Waylet", categories)?.name).toBe("Transport");
  });

  it("adds smarter fallback categories for richer shared-pot reporting", () => {
    expect(inferPodCategory("Leroy Merlin shelves", categories)?.name).toBe("Household");
    expect(inferPodCategory("GNP seguros hogar", categories)?.name).toBe("Insurance");
    expect(inferPodCategory("Cinema tickets", categories)?.name).toBe("Entertainment");
    expect(inferPodCategory("Bank fee", categories)?.name).toBe("Fees");
    expect(inferPodCategory("Haircut peluqueria", categories)?.name).toBe("Personal care");
  });

  it("uses category aliases and avoids short false positives", () => {
    const customCategories: Category[] = [
      { id: "cat_food", portfolioId: "pf", name: "Food", kind: "expense", icon: "utensils", color: "peach", sortOrder: 0 },
      { id: "cat_transport", portfolioId: "pf", name: "Transport", kind: "expense", icon: "car", color: "sand", sortOrder: 1 }
    ];

    expect(inferPodCategory("coffee and croissant", customCategories)?.id).toBe("cat_food");
    expect(inferPodCategory("Mercadona weekly shop", customCategories)?.id).toBe("cat_food");
    expect(inferPodCategory("Barcelona apartment rent", categories)?.name).toBe("Rent");
    expect(inferPodCategory("Barcelona", categories)).toBeUndefined();
  });

  it("rolls up stored and inferred categories together", () => {
    const rows = buildPodCategoryBreakdown({
      expenses: [
        expense({ id: "1", description: "Iberdrola", amount: 80 }),
        expense({ id: "2", description: "Internet", amount: 20, categoryId: "cat_utilities" }),
        expense({ id: "3", description: "Unknown", amount: 5 })
      ],
      categories,
      currency: "EUR",
      rates: {}
    });

    expect(rows[0]).toMatchObject({
      key: "cat_utilities",
      total: 100,
      count: 2,
      inferredCount: 1
    });
    expect(rows[1]).toMatchObject({ key: "__uncategorized", total: 5 });
  });
});
