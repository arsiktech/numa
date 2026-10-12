import { useMemo, useState } from "react";
import { computeRecurringRevenue, type RevenueSource } from "../../../convex/lib/recurringRevenue";
import { formatMoney } from "@/lib/money";
import type { FxRates } from "@/lib/fx";
import type { CurrencyCode, RecurringTransaction } from "@/lib/types";

const EXCLUSION_LABEL = {
  inactive: "paused",
  ended: "ended",
  not_started: "starts later",
  no_rate: "no exchange rate",
  invalid_amount: "invalid amount"
} as const;

/**
 * Business spaces get contracted MRR/ARR; every space with recurring income
 * gets its income sources. Both are schedules, never cash received.
 */
export function RecurringRevenueCard({
  recurring,
  currency,
  rates,
  isBusiness,
  now: nowOverride
}: {
  recurring: RecurringTransaction[];
  currency: CurrencyCode;
  rates: FxRates;
  isBusiness: boolean;
  now?: number;
}) {
  const [mountedAt] = useState(() => Date.now());
  const now = nowOverride ?? mountedAt;
  const revenue = useMemo(
    () => computeRecurringRevenue(recurring, { currency, now, rates }),
    [recurring, currency, now, rates]
  );
  const hasIncome = revenue.incomeSources.length > 0;
  if (!hasIncome && !(isBusiness && revenue.excluded.length > 0)) return null;

  return (
    <section aria-label="Recurring revenue" className="space-y-5">
      <div className="border-b border-[color:var(--color-ink)] pb-2">
        <h2 className="text-[17px] font-semibold">{isBusiness ? "Recurring revenue" : "Recurring income"}</h2>
        <p className="mt-1 max-w-[60ch] text-[14px] text-[color:var(--color-ink-3)]">
          {isBusiness
            ? "Contracted run-rate from subscriptions and retainers you marked. Not cash received."
            : "What your recurring income adds up to each month. A schedule, not cash received."}
        </p>
      </div>
        {isBusiness ? (
          <dl className="grid grid-cols-2 gap-6">
            <Metric label="MRR" value={formatMoney(revenue.mrr, currency)} />
            <Metric label="ARR" value={formatMoney(revenue.arr, currency)} />
          </dl>
        ) : null}
        {isBusiness ? (
          <p className="max-w-[64ch] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
            MRR adds every active subscription and retainer, converted to a monthly amount (weekly × 52 ÷ 12,
            quarterly ÷ 3, yearly ÷ 12). ARR is MRR × 12. {revenue.qualifyingRules === 0
              ? "Mark recurring income as a subscription or retainer to count it."
              : `${revenue.qualifyingRules} recurring ${revenue.qualifyingRules === 1 ? "rule counts" : "rules count"}.`}
          </p>
        ) : null}
        {isBusiness && revenue.revenueSources.length > 0 ? (
          <SourceList title="MRR by client" sources={revenue.revenueSources} total={revenue.mrr} currency={currency} />
        ) : null}
        {hasIncome ? (
          <SourceList
            title="Recurring income by source"
            sources={revenue.incomeSources}
            total={revenue.scheduledMonthlyIncome}
            currency={currency}
            footer={`${formatMoney(revenue.scheduledMonthlyIncome, currency)} a month scheduled`}
          />
        ) : null}
        {revenue.excluded.length > 0 ? (
          <p className="text-[14px] text-[color:var(--color-ink-3)]">
            Not counted: {revenue.excluded.map((row) => `${row.description} (${EXCLUSION_LABEL[row.reason]})`).join(", ")}.
          </p>
        ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[14px] text-[color:var(--color-ink-2)]">{label}</dt>
      <dd className="mt-1 text-[24px] font-semibold tabular-nums text-[color:var(--color-ink)]">{value}</dd>
    </div>
  );
}

function SourceList({
  title,
  sources,
  total,
  currency,
  footer
}: {
  title: string;
  sources: RevenueSource[];
  total: number;
  currency: CurrencyCode;
  footer?: string;
}) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{title}</h3>
      <ul>
        {sources.map((source) => {
          const share = total > 0 ? Math.round((source.monthly / total) * 100) : 0;
          return (
            <li key={source.source} className="nm-balance-row flex-col items-stretch gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[color:var(--color-ink)]">{source.source}</span>
                <span className="shrink-0 tabular-nums text-[color:var(--color-ink-2)]">
                  {formatMoney(source.monthly, currency)} a month, {share}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--color-line)]" aria-hidden="true">
                <div className="h-full rounded-full bg-[color:var(--color-positive)]" style={{ width: `${share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {footer ? <p className="mt-2 text-[14px] text-[color:var(--color-ink-3)]">{footer}</p> : null}
    </div>
  );
}
