import type { Id, TableNames } from "../../convex/_generated/dataModel";
import type { Asset, Category, CurrencyCode, Liability, PortfolioType, RecurringTransaction, Transaction } from "@/lib/types";

/**
 * Patch translation between app-domain objects and the convex write surface.
 * Cloud writes distinguish "key absent" (leave unchanged) from "key present
 * but null" (clear the field), so every field respects hasOwn on the incoming
 * patch. Also home of requirePortfolioWriteTarget, the shared precondition for
 * every cloud write.
 */


export type CloudCurrency = "USD" | "EUR";
export type MutationResult = { id?: unknown; clientMutationId?: string; replayed?: boolean } | string | undefined;
export type AuditedMutationOptions = { clientMutationId?: string; auditDraftId?: string };
export type TransactionPatch = Partial<Omit<Transaction, "categoryId" | "accountId" | "notes" | "location">> & {
  categoryId?: string | null;
  accountId?: string | null;
  notes?: string | null;
  location?: Transaction["location"] | null;
};
export type RecurringPatch = Partial<
  Omit<RecurringTransaction, "categoryId" | "accountId" | "endAt" | "notes" | "revenueType" | "incomeSource">
> & {
  categoryId?: string | null;
  accountId?: string | null;
  endAt?: number | null;
  notes?: string | null;
  revenueType?: RecurringTransaction["revenueType"] | null;
  incomeSource?: string | null;
};
export type CategoryPatch = Partial<Omit<Category, "emoji" | "monthlyLimit">> & {
  emoji?: string | null;
  monthlyLimit?: number | null;
};
export type AssetPatch = Partial<Omit<Asset, "notes">> & {
  notes?: string | null;
};
export type LiabilityPatch = Partial<Omit<Liability, "interestRate" | "dueDate" | "notes">> & {
  interestRate?: number | null;
  dueDate?: number | null;
  notes?: string | null;
};

export const STARTER_CATEGORIES: Array<{
  name: string;
  kind: "income" | "expense";
  icon: string;
  color: string;
}> = [
  { name: "Groceries", kind: "expense", icon: "shopping-basket", color: "mint" },
  { name: "Dining", kind: "expense", icon: "utensils", color: "peach" },
  { name: "Transport", kind: "expense", icon: "car", color: "sand" },
  { name: "Rent", kind: "expense", icon: "home", color: "lavender" },
  { name: "Utilities", kind: "expense", icon: "zap", color: "sky" },
  { name: "Subscriptions", kind: "expense", icon: "repeat", color: "blush" },
  { name: "Salary", kind: "income", icon: "briefcase", color: "mint" },
  { name: "Freelance", kind: "income", icon: "sparkles", color: "lavender" }
];

export type CreatePortfolioInput = {
  name: string;
  type: PortfolioType;
  tagline: string;
  defaultCurrency: CurrencyCode;
  seedDefaults?: boolean;
};

export function idAs<T extends TableNames>(id: string): Id<T> {
  return id as unknown as Id<T>;
}

export function asCloudCurrency(currency: CurrencyCode): CloudCurrency {
  if (currency === "USD" || currency === "EUR") return currency;
  throw new Error("Cloud finance writes currently support USD and EUR.");
}

export function resultId(result: MutationResult, fallback: string) {
  if (typeof result === "string") return result;
  if (result && "id" in result && result.id) return String(result.id);
  return fallback;
}

export function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Patch-building helpers shared by every buildCloud*Patch below. The cloud
 * surface distinguishes "key absent" (leave unchanged) from "key present but
 * null" (clear), so each field must respect hasOwn on the incoming patch.
 */
export function cloudIdOrNull<T extends TableNames>(patch: object, key: string, value: string | null | undefined) {
  if (!hasOwn(patch, key)) return undefined;
  return value ? idAs<T>(value) : null;
}

export function cloudNullable(patch: object, key: string, value: unknown) {
  return hasOwn(patch, key) ? (value ?? null) : undefined;
}

export function localTransactionPatch(patch: TransactionPatch): Partial<Transaction> {
  return {
    ...patch,
    categoryId: patch.categoryId ?? undefined,
    accountId: patch.accountId ?? undefined,
    notes: patch.notes ?? undefined,
    location: patch.location ?? undefined
  };
}

export function buildCloudTransactionPatch(patch: TransactionPatch) {
  return {
    occurredAt: patch.occurredAt,
    description: patch.description,
    categoryId: cloudIdOrNull<"categories">(patch, "categoryId", patch.categoryId),
    accountId: cloudIdOrNull<"assets">(patch, "accountId", patch.accountId),
    kind: patch.kind,
    amount: patch.amount,
    currency: patch.currency ? asCloudCurrency(patch.currency) : undefined,
    splits: patch.splits?.map((split) => ({
      userId: idAs<"users">(split.userId),
      bps: split.bps
    })),
    notes: cloudNullable(patch, "notes", patch.notes),
    location: cloudNullable(patch, "location", patch.location)
  };
}

export function localRecurringPatch(patch: RecurringPatch): Partial<RecurringTransaction> {
  return {
    ...patch,
    categoryId: patch.categoryId ?? undefined,
    accountId: patch.accountId ?? undefined,
    endAt: patch.endAt ?? undefined,
    notes: patch.notes ?? undefined,
    revenueType: patch.revenueType ?? undefined,
    incomeSource: patch.incomeSource ?? undefined
  };
}

export function buildCloudRecurringPatch(patch: RecurringPatch) {
  return {
    ...patch,
    categoryId: cloudIdOrNull<"categories">(patch, "categoryId", patch.categoryId),
    accountId: cloudIdOrNull<"assets">(patch, "accountId", patch.accountId),
    endAt: cloudNullable(patch, "endAt", patch.endAt),
    notes: cloudNullable(patch, "notes", patch.notes),
    revenueType: cloudNullable(patch, "revenueType", patch.revenueType),
    incomeSource: cloudNullable(patch, "incomeSource", patch.incomeSource),
    currency: patch.currency ? asCloudCurrency(patch.currency) : undefined
  };
}

export function localCategoryPatch(patch: CategoryPatch): Partial<Category> {
  return {
    ...patch,
    emoji: patch.emoji ?? undefined,
    monthlyLimit: patch.monthlyLimit ?? undefined
  };
}

export function buildCloudCategoryPatch(patch: CategoryPatch) {
  return {
    ...patch,
    // emoji uses || so an empty string clears the field like an absent emoji.
    emoji: hasOwn(patch, "emoji") ? patch.emoji || null : undefined,
    monthlyLimit: cloudNullable(patch, "monthlyLimit", patch.monthlyLimit)
  };
}

export function localAssetPatch(patch: AssetPatch): Partial<Asset> {
  return {
    ...patch,
    notes: patch.notes ?? undefined
  };
}

export function buildCloudAssetPatch(patch: AssetPatch) {
  return {
    ...patch,
    currency: patch.currency ? asCloudCurrency(patch.currency) : undefined,
    notes: cloudNullable(patch, "notes", patch.notes)
  };
}

export function localLiabilityPatch(patch: LiabilityPatch): Partial<Liability> {
  return {
    ...patch,
    interestRate: patch.interestRate ?? undefined,
    dueDate: patch.dueDate ?? undefined,
    notes: patch.notes ?? undefined
  };
}

export function buildCloudLiabilityPatch(patch: LiabilityPatch) {
  return {
    ...patch,
    currency: patch.currency ? asCloudCurrency(patch.currency) : undefined,
    interestRate: cloudNullable(patch, "interestRate", patch.interestRate),
    dueDate: cloudNullable(patch, "dueDate", patch.dueDate),
    notes: cloudNullable(patch, "notes", patch.notes)
  };
}

export function requirePortfolioWriteTarget({
  cloudEnabled,
  portfolioId,
  cloudPortfolioIds
}: {
  cloudEnabled: boolean;
  portfolioId: string | undefined;
  cloudPortfolioIds: ReadonlySet<string>;
}) {
  if (!cloudEnabled) return false;
  if (!portfolioId || !cloudPortfolioIds.has(portfolioId)) {
    throw new Error("Your cloud money data is still syncing. Try again in a moment.");
  }
  return true;
}
