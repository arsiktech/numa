import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EditTransactionDialog } from "@/components/features/EditTransactionDialog";
import { RecurringDialog } from "@/components/features/RecurringDialog";
import { RecurringRevenueCard } from "@/components/features/RecurringRevenueCard";
import type { RecurringTransaction, Transaction } from "@/lib/types";
import { useCategories, useCurrentPortfolioId, usePortfolio, useRecurring, useTransactions } from "@/services/store";
import { usePeriodRange, usePeriodSelection } from "@/hooks/usePeriod";
import { findDuplicateTransactions, rollupCashflow } from "@/lib/analytics";
import { formatMoneyDecimal, formatSignedMoneyDecimal } from "@/lib/money";
import { useFxRates } from "@/services/fxSync";
import { useLocale } from "@/lib/i18n";
import { emitCommand } from "@/lib/commands";
import type { PeriodPreset } from "@/lib/period";
import { cn } from "@/lib/cn";
import { PlainSearchButton } from "@/components/layout/CommandBar";
import { SimpleHistorySurface } from "../History";
import { RecurringSection } from "../Recurring";
import { DuplicatesBanner } from "../Duplicates";
import { PERIOD_OPTIONS } from "../shared";

type Tab = "transactions" | "recurring";

/**
 * Money: what came in and went out, and what repeats (decision 2026-10-11).
 * Budgets and categories live in Settings; net worth lives on the home.
 */
export function MoneyPage() {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<Tab>("transactions");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [addRecurringOpen, setAddRecurringOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const range = usePeriodRange();
  const [, setPeriodSelection] = usePeriodSelection();
  const transactions = useTransactions(portfolio.id);
  const categories = useCategories(portfolio.id);
  const recurring = useRecurring(portfolio.id);
  const currency = portfolio.defaultCurrency;
  const { rates } = useFxRates();
  const periodLabel =
    range.selection.ym || range.selection.preset === "month" || range.selection.preset === "last-month"
      ? range.start.toLocaleDateString(locale, { month: "long", year: "numeric" })
      : range.label;

  // Deep link from search: ?tx=<id> opens that transaction for editing.
  useEffect(() => {
    const txId = searchParams.get("tx");
    if (!txId) return;
    const found = transactions.find((row) => row.id === txId);
    if (found) {
      setEditingTx(found);
      setTab("transactions");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("tx");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, transactions]);

  const cashflow = useMemo(
    () => rollupCashflow(transactions, range, { rates, currency }),
    [transactions, range, rates, currency]
  );
  const duplicateGroups = useMemo(() => findDuplicateTransactions(transactions), [transactions]);

  return (
    <div className="mx-auto w-full max-w-[880px] pb-28 lg:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[17px] font-semibold text-[color:var(--color-ink-2)]">Money</h1>
        <div className="flex items-center gap-3">
          <PlainSearchButton />
          <button type="button" onClick={() => emitCommand("open-capture")} className="nm-balance-add">
            Add transaction
          </button>
        </div>
      </header>

      <section aria-label={`Money in and out, ${periodLabel}`} className="mt-6">
        <label className="inline-flex items-center gap-2 text-[15px] text-[color:var(--color-ink-2)]">
          <span className="sr-only">{t("money.periodAria")}</span>
          <select
            value={range.selection.preset ?? "month"}
            onChange={(event) => setPeriodSelection({ preset: event.target.value as PeriodPreset })}
            className="nm-plain-select"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <span>{periodLabel}</span>
        </label>
        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-[color:var(--color-ink)] pt-3">
          <Figure label="In" value={formatMoneyDecimal(cashflow.income, currency)} tone="positive" />
          <Figure label="Out" value={formatMoneyDecimal(cashflow.expense, currency)} />
          <Figure
            label="Left"
            value={formatSignedMoneyDecimal(cashflow.net, currency)}
            tone={cashflow.net >= 0 ? "positive" : "negative"}
          />
        </dl>
      </section>

      <div role="tablist" aria-label="Money views" className="mt-8 flex gap-6 border-b border-[color:var(--color-line)]">
        {(
          [
            ["transactions", t("money.transactions")],
            ["recurring", t("money.recurring")]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn("nm-plain-tab", tab === value && "nm-plain-tab-active")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "transactions" ? (
        <div className="mt-5 space-y-5">
          {duplicateGroups.length > 0 ? <DuplicatesBanner groups={duplicateGroups} onJumpTo={setEditingTx} /> : null}
          <SimpleHistorySurface
            transactions={transactions}
            categories={categories}
            currency={currency}
            rates={rates}
            locale={locale}
            range={range}
            onEdit={setEditingTx}
          />
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          <RecurringRevenueCard
            recurring={recurring}
            currency={currency}
            rates={rates}
            isBusiness={portfolio.spaceKind === "business"}
          />
          <RecurringSection
            recurring={recurring}
            categories={categories}
            onEdit={setEditingRecurring}
            onAdd={() => setAddRecurringOpen(true)}
          />
        </div>
      )}

      <RecurringDialog
        open={editingRecurring !== null || addRecurringOpen}
        editing={editingRecurring}
        onClose={() => {
          setEditingRecurring(null);
          setAddRecurringOpen(false);
        }}
      />
      <EditTransactionDialog transaction={editingTx} onClose={() => setEditingTx(null)} />
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[14px] text-[color:var(--color-ink-2)]">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-[clamp(17px,4.6vw,24px)] font-semibold tabular-nums",
          tone === "positive"
            ? "text-[color:var(--color-positive)]"
            : tone === "negative"
              ? "text-[color:var(--color-negative)]"
              : "text-[color:var(--color-ink)]"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
