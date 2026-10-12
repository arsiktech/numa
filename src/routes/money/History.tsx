
import { useMemo, useState } from "react";

import { Search } from "lucide-react";

import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";

import type { Category, Transaction } from "@/lib/types";
import { isWithin, type PeriodRange } from "@/lib/period";
import { formatMoneyDecimal, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/cn";

import { convertCurrency, type FxRates } from "@/lib/fx";

export function SimpleHistorySurface({
  transactions,
  categories,
  currency,
  rates,
  locale,
  range,
  onEdit
}: {
  transactions: Transaction[];
  categories: Category[];
  currency: CurrencyCode;
  rates: FxRates;
  locale: string;
  range: PeriodRange;
  onEdit: (transaction: Transaction) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  // Chips only for categories that actually occur in the visible period, by
  // frequency — the strip answers "Dining in March" without dead options.
  const filterChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      if (!isWithin(range, tx.occurredAt) || !tx.categoryId) continue;
      counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categoriesById.get(id))
      .filter((category): category is Category => Boolean(category));
  }, [categoriesById, range, transactions]);
  // A stale pick (category vanished from the period) silently resets to All.
  const activeCategoryFilter =
    categoryFilter && filterChips.some((c) => c.id === categoryFilter) ? categoryFilter : null;
  const visibleTransactions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        // Respect the TopBar period pill — same URL-backed range the
        // Advanced cashflow uses, so "May 2026" really shows May rows.
        if (!isWithin(range, tx.occurredAt)) return false;
        if (activeCategoryFilter && tx.categoryId !== activeCategoryFilter) return false;
        if (!needle) return true;
        const category = tx.categoryId ? categoriesById.get(tx.categoryId) : null;
        return `${tx.description} ${category?.name ?? ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, 120);
  }, [activeCategoryFilter, categoriesById, query, range, transactions]);

  const dayGroups = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      total: number;
      items: Transaction[];
    }[] = [];
    const byDay = new Map<string, (typeof groups)[number]>();
    for (const tx of visibleTransactions) {
      const key = dayKey(tx.occurredAt);
      let group = byDay.get(key);
      if (!group) {
        group = {
          key,
          label: formatHistoryDay(tx.occurredAt, locale),
          total: 0,
          items: []
        };
        byDay.set(key, group);
        groups.push(group);
      }
      const signed = tx.kind === "income" ? tx.amount : -tx.amount;
      group.total += convertCurrency(signed, tx.currency, currency, rates);
      group.items.push(tx);
    }
    return groups;
  }, [currency, locale, rates, visibleTransactions]);

  return (
    <section aria-label="Transactions">
      <label className="flex h-12 items-center gap-2.5 border-b border-[color:var(--color-line-strong)] text-[15px] text-[color:var(--color-ink-3)] focus-within:border-[color:var(--color-ink)]">
        <Search size={15} strokeWidth={2} className="shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search transactions"
          aria-label="Search transactions"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] outline-none"
        />
      </label>

      {filterChips.length > 1 ? (
        <div
          role="group"
          aria-label="Filter by category"
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5"
        >
          <HistoryFilterChip
            label="All"
            active={activeCategoryFilter === null}
            onClick={() => setCategoryFilter(null)}
          />
          {filterChips.map((category) => (
            <HistoryFilterChip
              key={category.id}
              label={category.name}
              emoji={category.emoji}
              active={activeCategoryFilter === category.id}
              onClick={() =>
                setCategoryFilter((current) => (current === category.id ? null : category.id))
              }
            />
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        {dayGroups.length === 0 ? (
          <div className="py-6">
            <p className="text-[17px] font-semibold text-[color:var(--color-ink)]">No transactions in this period</p>
            <p className="mt-1 text-[15px] text-[color:var(--color-ink-3)]">
              Use Add transaction to record income or spending. It shows up here by day.
            </p>
          </div>
        ) : (
          dayGroups.map((group) => (
            <section key={group.key}>
              <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--color-ink)] pb-1.5">
                <h3 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{group.label}</h3>
                <p
                  className={cn(
                    "text-[15px] font-semibold tabular-nums",
                    group.total > 0
                      ? "text-[color:var(--color-positive)]"
                      : "text-[color:var(--color-ink-2)]"
                  )}
                >
                  {formatSignedDecimal(group.total, currency)}
                </p>
              </div>
              <div>
                {group.items.map((tx, index) => (
                  <SimpleHistoryRow
                    key={tx.id}
                    transaction={tx}
                    category={tx.categoryId ? categoriesById.get(tx.categoryId) : undefined}
                    isLast={index === group.items.length - 1}
                    onClick={() => onEdit(tx)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function HistoryFilterChip({
  label,
  emoji,
  active,
  onClick
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]",
        active
          ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-bg)]"
          : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)]"
      )}
    >
      {emoji ? (
        <span className="nm-emoji text-[13px] leading-none" aria-hidden>
          {emoji}
        </span>
      ) : null}
      {label}
    </button>
  );
}

function SimpleHistoryRow({
  transaction,
  category,
  isLast,
  onClick
}: {
  transaction: Transaction;
  category?: Category;
  isLast: boolean;
  onClick: () => void;
}) {
  const isIncome = transaction.kind === "income";
  const tone = category ? tonesFor(category.color) : tonesFor("mint");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "nm-balance-row-button flex min-h-[60px] w-full items-center gap-3 py-2.5",
        !isLast ? "border-b border-[color:var(--color-line)]" : ""
      )}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center text-[18px] leading-none" style={{ color: tone.ink }} aria-hidden>
        {category?.emoji ? (
          <span className="nm-emoji">{category.emoji}</span>
        ) : (
          <CategoryIcon name={category?.icon ?? "sparkles"} size={17} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-snug text-[color:var(--color-ink)]">
          {transaction.description}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[color:var(--color-ink-3)]">
          {category?.name ?? "Uncategorised"}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-[16px] tabular-nums",
          isIncome ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-ink)]"
        )}
      >
        {isIncome ? "+" : "−"}
        {formatMoneyDecimal(transaction.amount, transaction.currency)}
      </span>
    </button>
  );
}

export function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatHistoryDay(timestamp: number, locale: string) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekday = date.toLocaleDateString(locale, { weekday: "short" });
  if (sameCalendarDay(date, today)) return `Today, ${weekday}`;
  if (sameCalendarDay(date, yesterday)) return `Yesterday, ${weekday}`;
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatSignedDecimal(value: number, currency: CurrencyCode) {
  if (value === 0) return formatMoneyDecimal(0, currency);
  return `${value > 0 ? "+" : "−"}${formatMoneyDecimal(Math.abs(value), currency)}`;
}
