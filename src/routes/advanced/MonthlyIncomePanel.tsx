import { Plus } from "lucide-react";
import { emitCommand } from "@/lib/commands";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import type { MonthlyIncomePace } from "@/lib/monthlyIncome";
import type { NetWorthGoal } from "@/lib/types";

/** Monthly income pace against an optional income goal. Lives on Goals since the
 *  home became the Balance view (2026-10-11). */
export function MonthlyIncomePanel({
  monthlyIncome,
  target,
  goal,
  onEditTarget
}: {
  monthlyIncome: MonthlyIncomePace;
  target: number | null;
  goal: NetWorthGoal | null;
  onEditTarget: () => void;
}) {
  const progress = target !== null && target > 0 ? Math.min(100, Math.max(0, (monthlyIncome.paceAmount / target) * 100)) : 0;
  const gap = target === null ? null : Math.max(0, target - monthlyIncome.paceAmount);
  const topContributors = monthlyIncome.contributors.slice(0, 5);
  const hasIncomeSignal = monthlyIncome.paceAmount > 0 || monthlyIncome.recurringRunRate > 0;
  if (!goal && !hasIncomeSignal) return null;
  let offset = 0;
  const segments = topContributors.map((row) => {
    const left = offset;
    offset += row.share;
    return { row, left, width: row.share };
  });

  return (
    <section className="overflow-hidden rounded-[20px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-sm)]">
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
                {goal ? "Your income goal" : "This month"}
              </p>
              <h2
                className="mt-1 text-[24px] font-bold leading-none tracking-normal text-[color:var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Monthly income pace
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEditTarget}
                className="nm-interactive inline-flex h-9 items-center rounded-xl border border-[color:var(--color-line)] px-3 text-[12px] font-semibold text-[color:var(--color-ink)]"
              >
                {goal ? "Edit target" : "Set target"}
              </button>
              <button
                type="button"
                onClick={() => emitCommand("open-capture")}
                className="nm-interactive inline-flex h-9 items-center gap-1.5 rounded-xl bg-[color:var(--color-cta)] px-3 text-[12px] font-bold text-[color:var(--color-cta-ink)]"
              >
                <Plus size={14} />
                Add entry
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-1">
            <p
              className="text-[clamp(38px,5.3vw,58px)] font-bold leading-[0.9] tracking-normal nm-num text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatMoneyCompact(monthlyIncome.paceAmount, monthlyIncome.currency)}
            </p>
            {target !== null && <p className="pb-1 font-mono text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
              of {formatMoneyCompact(target, monthlyIncome.currency)} / mo
            </p>}
          </div>

          {target !== null && <>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[color:var(--color-bg)]">
            <div
              className="h-full rounded-full bg-[color:var(--color-cta)] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 text-[12px] text-[color:var(--color-ink-3)] sm:grid-cols-3">
            <span>
              <strong className="font-semibold text-[color:var(--color-ink)]">{Math.round(progress)}%</strong>{" "}
              complete
            </span>
            <span>{formatMoney(gap ?? 0, monthlyIncome.currency)} gap</span>
            <span>{formatMoney(monthlyIncome.recurringRunRate, monthlyIncome.currency)} recurring base</span>
          </div>
          </>}
          <p className="mt-3 text-[12px] text-[color:var(--color-ink-2)]">
            {formatMoney(monthlyIncome.earnedThisMonth, monthlyIncome.currency)} received · {formatMoney(monthlyIncome.scheduledThisMonth, monthlyIncome.currency)} scheduled
          </p>
        </div>

        <div className="min-w-0 rounded-2xl bg-[color:var(--color-bg)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
              contributors
            </p>
            <span className="text-[11px] font-semibold text-[color:var(--color-ink-3)]">
              {monthlyIncome.daysLeft} days left
            </span>
          </div>

          <div className="relative mt-3 h-9 overflow-hidden rounded-xl bg-[color:var(--color-paper)]">
            {segments.length ? (
              segments.map(({ row, left, width }) => (
                <span
                  key={row.id}
                  className="absolute inset-y-0"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: row.kind === "earned" ? "var(--color-cta)" : "var(--color-brand-mist)"
                  }}
                  title={`${row.label}: ${formatMoney(row.amount, monthlyIncome.currency)}`}
                />
              ))
            ) : (
              <span className="grid h-full place-items-center text-[12px] font-medium text-[color:var(--color-ink-3)]">
                No income recorded or scheduled yet.
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {topContributors.length ? (
              topContributors.map((row) => (
                <div key={row.id} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: row.kind === "earned" ? "var(--color-cta)" : "var(--color-brand-mist)"
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[color:var(--color-ink)]">
                      {row.label}
                    </span>
                    <span className="block truncate text-[11px] text-[color:var(--color-ink-3)]">
                      {row.detail}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-[color:var(--color-ink)]">
                    {formatMoney(row.amount, monthlyIncome.currency)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
                {hasIncomeSignal
                  ? "Recurring base is configured; booked and scheduled rows will appear here as they enter this month."
                  : "Set recurring income or add an income movement to see what contributes."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
