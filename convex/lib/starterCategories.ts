import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * The starter category set seeded for every new portfolio / profile / pod.
 * Single source of truth — previously copy-pasted into portfolios.ts,
 * profiles.ts and mobile.ts.
 */
export const STARTER_CATEGORIES = [
  { name: "Groceries", kind: "expense", icon: "shopping-basket", color: "mint" },
  { name: "Dining", kind: "expense", icon: "utensils", color: "peach" },
  { name: "Transport", kind: "expense", icon: "car", color: "sand" },
  { name: "Rent", kind: "expense", icon: "home", color: "lavender" },
  { name: "Utilities", kind: "expense", icon: "zap", color: "sky" },
  { name: "Subscriptions", kind: "expense", icon: "repeat", color: "blush" },
  { name: "Salary", kind: "income", icon: "briefcase", color: "mint" },
  { name: "Freelance", kind: "income", icon: "sparkles", color: "lavender" }
] as const;

/** Insert the starter categories for a freshly created portfolio. */
export async function seedStarterCategories(
  ctx: MutationCtx,
  portfolioId: Id<"portfolios">
) {
  for (const [index, category] of STARTER_CATEGORIES.entries()) {
    await ctx.db.insert("categories", { portfolioId, ...category, sortOrder: index });
  }
}
