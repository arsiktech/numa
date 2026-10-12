import { useMemo, useState } from "react";
import { CategoryDialog } from "@/components/features/CategoryDialog";
import { useDomainActions } from "@/services/domainActions";
import { useCategories, useCurrentPortfolioId, usePortfolio, useTransactions } from "@/services/store";
import { currentMonthBudgetSpend } from "@/lib/categoryBudgets";
import { formatMoneyDecimal } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Category, CategoryKind } from "@/lib/types";

/**
 * Categories and monthly budgets, moved here from Money (decision 2026-10-11).
 * A budget is a monthly cap on an expense category; spending is measured in
 * the budget's own currency for the current month, never converted.
 */
export function CategoriesSettings() {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const categories = useCategories(portfolio.id);
  const transactions = useTransactions(portfolio.id);
  const actions = useDomainActions();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const currency = portfolio.defaultCurrency;
  const spend = useMemo(
    () => currentMonthBudgetSpend(categories, transactions, currency),
    [categories, transactions, currency]
  );
  const visible = categories.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
  const presets = categoryPresets(kind).filter(
    (name) => !categories.some((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase())
  );
  const budgeted = categories.filter((c) => c.kind === "expense" && c.monthlyLimit !== undefined && c.monthlyLimit > 0);
  const budgetCurrency = budgeted[0]?.monthlyLimitCurrency ?? currency;
  const oneCurrency = budgeted.every((c) => (c.monthlyLimitCurrency ?? currency) === budgetCurrency);
  const totalCap = oneCurrency ? budgeted.reduce((s, c) => s + (c.monthlyLimit ?? 0), 0) : null;
  const spentValues = budgeted.map((c) => spend.get(c.id) ?? null);
  const totalSpent = oneCurrency && spentValues.every((v) => v !== null)
    ? spentValues.reduce<number>((s, v) => s + (v ?? 0), 0)
    : null;

  async function addPreset(name: string) {
    await actions.createCategory({
      portfolioId: portfolio.id,
      name,
      kind,
      icon: kind === "income" ? "hand-coins" : "shopping-basket",
      color: kind === "income" ? "mint" : "peach",
      sortOrder: categories.length
    });
  }

  async function move(category: Category, direction: -1 | 1) {
    const index = visible.findIndex((c) => c.id === category.id);
    const swap = visible[index + direction];
    if (!swap) return;
    await actions.updateCategory(category.id, { sortOrder: swap.sortOrder }, category.portfolioId);
    await actions.updateCategory(swap.id, { sortOrder: category.sortOrder }, swap.portfolioId);
  }

  return (
    <section aria-labelledby="settings-categories" id="settings-categories-controls" className="nm-plain-section">
      <h2 id="settings-categories" className="nm-plain-heading">
        Categories and budgets
      </h2>
      <p className="mt-1 max-w-[60ch] text-[14px] text-[color:var(--color-ink-3)]">
        Categories sort your transactions. Give an expense category a monthly budget to see how much is left.
      </p>
      {budgeted.length ? (
        <p className="mt-3 text-[15px]">
          {totalCap !== null && totalSpent !== null ? (
            <>
              Spent <span className="font-semibold tabular-nums">{formatMoneyDecimal(totalSpent, budgetCurrency)}</span> of{" "}
              <span className="font-semibold tabular-nums">{formatMoneyDecimal(totalCap, budgetCurrency)}</span> budgeted this month.
            </>
          ) : (
            "Budgets use different currencies, so there is no combined total."
          )}
        </p>
      ) : null}

      <div role="tablist" aria-label="Category type" className="mt-4 flex gap-6 border-b border-[color:var(--color-line)]">
        {(["expense", "income"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={cn("nm-plain-tab", kind === value && "nm-plain-tab-active")}
          >
            {value === "expense" ? "Spending" : "Income"}
          </button>
        ))}
      </div>

      <ul>
        {visible.map((category, index) => {
          const cap = category.monthlyLimit;
          const capCurrency = category.monthlyLimitCurrency ?? currency;
          const spent = spend.get(category.id) ?? null;
          const left = cap && spent !== null ? cap - spent : null;
          const detail =
            kind === "income"
              ? null
              : cap
                ? spent === null
                  ? `Budget ${formatMoneyDecimal(cap, capCurrency)} a month, spending unavailable`
                  : left !== null && left < 0
                    ? `${formatMoneyDecimal(-left, capCurrency)} over a ${formatMoneyDecimal(cap, capCurrency)} budget`
                    : `${formatMoneyDecimal(left ?? 0, capCurrency)} left of ${formatMoneyDecimal(cap, capCurrency)}`
                : "No budget";
          return (
            <li key={category.id} className="flex items-center gap-2 border-b border-[color:var(--color-line)]">
              <button
                type="button"
                onClick={() => setEditing(category)}
                className="nm-balance-row-button flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5"
                aria-label={`${category.name}${detail ? `, ${detail}` : ""}. Edit`}
              >
                {category.emoji ? (
                  <span className="nm-emoji w-6 text-center text-[18px]" aria-hidden>
                    {category.emoji}
                  </span>
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-[16px]">{category.name}</span>
                  {detail ? (
                    <span
                      className={cn(
                        "block text-[13px]",
                        left !== null && left < 0 ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-ink-3)]"
                      )}
                    >
                      {detail}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className="nm-icon-action"
                aria-label={`Move ${category.name} up`}
                disabled={index === 0}
                onClick={() => move(category, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="nm-icon-action"
                aria-label={`Move ${category.name} down`}
                disabled={index === visible.length - 1}
                onClick={() => move(category, 1)}
              >
                ↓
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-x-5">
        <button type="button" className="nm-balance-text-action" onClick={() => setAdding(true)}>
          + Add category
        </button>
        {presets.map((name) => (
          <button key={name} type="button" className="nm-balance-text-action" onClick={() => void addPreset(name)}>
            + {name}
          </button>
        ))}
      </div>

      <CategoryDialog
        open={editing !== null || adding}
        editing={editing}
        defaultKind={editing?.kind ?? kind}
        onClose={() => {
          setEditing(null);
          setAdding(false);
        }}
      />
    </section>
  );
}

export function categoryPresets(kind: CategoryKind) {
  const lang = typeof navigator === "undefined" ? "en" : navigator.language.toLowerCase().slice(0, 2);
  if (lang === "ru") {
    return kind === "income"
      ? ["Зарплата", "Фриланс", "Бонус", "Инвестиции"]
      : ["Продукты", "Рестораны", "Транспорт", "Аренда", "Коммунальные", "Здоровье"];
  }
  if (lang === "es") {
    return kind === "income"
      ? ["Salario", "Freelance", "Bonus", "Inversiones"]
      : ["Supermercado", "Restaurantes", "Transporte", "Alquiler", "Servicios", "Salud"];
  }
  return kind === "income"
    ? ["Salary", "Freelance", "Bonus", "Investments"]
    : ["Groceries", "Dining", "Transport", "Rent", "Utilities", "Health"];
}
