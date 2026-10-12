import { useMemo, useState } from "react";
import { AskNumaButton, SearchCommandButton } from "@/components/layout/CommandBar";
import { motion } from "framer-motion";
import { Plus, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GoalDialog } from "@/components/features/GoalDialog";
import { MonthlyIncomePanel } from "./MonthlyIncomePanel";
import { buildMonthlyIncomePace } from "@/lib/monthlyIncome";
import { AddMoneyDialog } from "@/components/features/AddMoneyDialog";
import { NumaCoin3D } from "@/components/brand/NumaCoin3D";
import { CoinCelebration } from "@/components/brand/CoinCelebration";
import {
  useAssets,
  useCategories,
  useCryptoWallets,
  useCurrentPortfolioId,
  useGoals,
  useHoldings,
  useLiabilities,
  useMarketQuotes,
  usePortfolio,
  useRecurring,
  useTransactions
} from "@/services/store";
import { useFxRates } from "@/services/fxSync";
import { rollupNetWorth } from "@/lib/analytics";
import { computeGoalProgress, goalScope } from "@/lib/goals";
import { convertCurrency } from "@/lib/fx";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { pageEnter } from "@/lib/motion";
import type { CurrencyCode, NetWorthGoal } from "@/lib/types";
import { cryptoCapitalAmounts } from "@/lib/cryptoWallets";
import { useCryptoWalletSync } from "@/features/crypto/useCryptoWalletSync";

function isGoalDone(item: { current: number; target: number }) {
  return item.target > 0 && item.current >= item.target;
}

export default function GoalsPage() {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const currency = portfolio.defaultCurrency;
  const assets = useAssets(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const cryptoWallets = useCryptoWallets(portfolio.id);
  const cryptoSync = useCryptoWalletSync(cryptoWallets);
  const liabilities = useLiabilities(portfolio.id);
  const quotes = useMarketQuotes();
  const transactions = useTransactions(portfolio.id);
  const recurring = useRecurring(portfolio.id);
  const categories = useCategories(portfolio.id);
  const goals = useGoals(portfolio.id);
  const { rates } = useFxRates();
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<NetWorthGoal | null>(null);
  const [contributingGoal, setContributingGoal] = useState<{
    goal: NetWorthGoal;
    label: string;
  } | null>(null);
  const [celebrateMsg, setCelebrateMsg] = useState<string | null>(null);
  const baseNetWorth = rollupNetWorth(assets, holdings, liabilities, quotes, { rates, currency });
  const cryptoCapital = cryptoCapitalAmounts(cryptoSync.wallets, rates, currency);
  const netWorth = {
    ...baseNetWorth,
    invested: baseNetWorth.invested + cryptoCapital.assets,
    liabilities: baseNetWorth.liabilities + cryptoCapital.debts,
    netWorth: baseNetWorth.netWorth + cryptoCapital.net
  };
  const progress = useMemo(
    () =>
      goals.map((goal) => ({
        goal,
        progress: computeGoalProgress(goal, {
          netWorth: netWorth.netWorth,
          netWorthCurrency: currency,
          transactions,
          recurring,
          categories,
          assets,
          holdings,
          quotes,
          rates,
          now: Date.now()
        })
      })),
    [
      assets,
      categories,
      currency,
      goals,
      holdings,
      netWorth.netWorth,
      quotes,
      rates,
      recurring,
      transactions
    ]
  );

  const monthlyIncome = useMemo(
    () => buildMonthlyIncomePace({ transactions, recurring, categories, currency, rates, now: new Date() }),
    [transactions, recurring, categories, currency, rates]
  );
  const monthlyIncomeGoal = useMemo(
    () => [...goals].reverse().find((goal) => goalScope(goal) === "monthly_income") ?? null,
    [goals]
  );
  const monthlyIncomeTarget = monthlyIncomeGoal
    ? convertCurrency(monthlyIncomeGoal.target, monthlyIncomeGoal.currency, currency, rates)
    : null;
  const [goalInitialMode, setGoalInitialMode] = useState<"monthly_income" | undefined>(undefined);

  function openGoal(goal: NetWorthGoal | null = null) {
    setGoalInitialMode(undefined);
    setEditingGoal(goal);
    setGoalOpen(true);
  }
  const incomePanel = (
    <MonthlyIncomePanel
      monthlyIncome={monthlyIncome}
      target={monthlyIncomeTarget}
      goal={monthlyIncomeGoal}
      onEditTarget={() => {
        setGoalInitialMode("monthly_income");
        setEditingGoal(monthlyIncomeGoal);
        setGoalOpen(true);
      }}
    />
  );

  return (
    <>
      <div className="hidden lg:block">
        <div className="mb-5">{incomePanel}</div>
        <GoalsDesktopSurface
          progress={progress}
          currency={currency}
          onOpenGoal={openGoal}
          onAddContribution={(goal, label) => setContributingGoal({ goal, label })}
        />
      </div>
    <motion.div
      {...pageEnter}
      className="space-y-4 pb-24 lg:hidden"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="nm-eyebrow">where you're headed</p>
          <h1 className="nm-brand-heading mt-2 text-[color:var(--color-ink)]">
            Goals
          </h1>
        </div>
        <button
          type="button"
          onClick={() => openGoal()}
          aria-label="New goal"
          className="nm-interactive grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </header>

      {incomePanel}

      {progress.length ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {progress.map(({ goal, progress: item }, index) => {
            const done = isGoalDone(item);
            return (
            <div key={goal.id} className="relative">
            <button
              type="button"
              onClick={() => openGoal(goal)}
              className="nm-interactive w-full rounded-[24px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 text-left shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
                  {index === 0 ? "🏠" : index === 1 ? "🛟" : "🏝️"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[color:var(--color-ink-3)]">
                    {goal.deadline ? new Date(goal.deadline).getFullYear() : item.detail}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-bold tabular-nums text-[color:var(--color-ink)]">
                    {formatMoneyCompact(item.current, goal.currency)}
                  </span>
                  <span className="block font-mono text-[10px] text-[color:var(--color-ink-3)]">
                    of {formatMoneyCompact(item.target, goal.currency)}
                  </span>
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--color-brand-mist)]">
                <div
                  className={`h-full rounded-full ${
                    done ? "bg-[color:var(--color-positive-soft)]" : "bg-[color:var(--color-ink)]"
                  }`}
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              {done ? (
                <p className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-[color:var(--color-ink)]">
                  <NumaCoin3D size={22} mode="flip" segments={28} />
                  Goal reached
                </p>
              ) : (
                <p className="mt-3 text-[12px] text-[color:var(--color-ink-3)]">
                  {formatMoney(item.remaining, goal.currency)} left
                </p>
              )}
            </button>
            {goalScope(goal) !== "holding_value" ? (
              <button
                type="button"
                onClick={() => setContributingGoal({ goal, label: item.label })}
                aria-label={`Add to ${item.label}`}
                className="nm-interactive absolute bottom-4 right-4 inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] text-[12px] font-semibold shadow-[var(--shadow-sm)]"
              >
                <Plus size={13} /> Add
              </button>
            ) : null}
            </div>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[30px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-md)]">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
            <Target size={24} />
          </div>
          <h2 className="mt-5 text-[26px] font-bold leading-none tracking-[-0.04em]">
            Set the first destination.
          </h2>
          <p className="mt-2 max-w-[460px] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
            Goals turn Numa Pro from a ledger into a direction: house deposit,
            emergency fund, sabbatical, or any asset you want to grow.
          </p>
          <Button type="button" className="mt-5" onClick={() => openGoal()}>
            <Plus size={16} />
            New goal
          </Button>
        </section>
      )}

      <GoalDialog
        open={goalOpen}
        editing={editingGoal}
        initialMode={goalInitialMode}
        onClose={() => {
          setGoalOpen(false);
          setEditingGoal(null);
        }}
      />
      <AddMoneyDialog
        open={Boolean(contributingGoal)}
        goal={contributingGoal?.goal ?? null}
        label={contributingGoal?.label ?? ""}
        onClose={() => setContributingGoal(null)}
        onCelebrate={(message) => setCelebrateMsg(message)}
      />
      <CoinCelebration
        show={Boolean(celebrateMsg)}
        label={celebrateMsg ?? undefined}
        onDone={() => setCelebrateMsg(null)}
      />
    </motion.div>
    </>
  );
}

type GoalProgressRow = ReturnType<typeof computeGoalProgress>;

function GoalsDesktopSurface({
  progress,
  currency,
  onOpenGoal,
  onAddContribution
}: {
  progress: Array<{ goal: NetWorthGoal; progress: GoalProgressRow }>;
  currency: CurrencyCode;
  onOpenGoal: (goal?: NetWorthGoal | null) => void;
  onAddContribution: (goal: NetWorthGoal, label: string) => void;
}) {
  const { rates } = useFxRates();
  const primary = progress[0];
  // Overall meter: a net_worth goal's `current` is the ENTIRE portfolio net
  // worth, which already contains every asset/holding-scoped goal — summing
  // across scopes double-counts. If a net_worth goal exists it IS the overall
  // picture, so use it as the headline meter; otherwise sum the comparable
  // per-goal scopes, normalized into the portfolio currency.
  const netWorthRow = progress.find((row) => goalScope(row.goal) === "net_worth");
  const meterRows = netWorthRow ? [netWorthRow] : progress;
  const totalTarget = meterRows.reduce(
    (sum, row) => sum + convertCurrency(row.progress.target, row.goal.currency, currency, rates),
    0
  );
  const totalCurrent = meterRows.reduce(
    (sum, row) => sum + convertCurrency(row.progress.current, row.goal.currency, currency, rates),
    0
  );
  const totalRemaining = Math.max(0, totalTarget - totalCurrent);
  const overallPct = totalTarget > 0 ? Math.min(100, Math.max(0, (totalCurrent / totalTarget) * 100)) : 0;
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date());

  return (
    <motion.div
      {...pageEnter}
      className="mx-auto flex min-h-[calc(100dvh-40px)] max-w-[1180px] flex-col pb-2"
    >
      <header className="mb-[22px] flex items-center justify-between gap-5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
            personal · {monthName} · advanced
          </p>
          <h1
            className="nm-brand-heading mt-2 text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Goals
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchCommandButton />
          {AI_ENABLED && (
            <AskNumaButton prompt="Help me choose the next money goal." icon={<Sparkles size={14} />} />
          )}
          <button
            type="button"
            onClick={() => onOpenGoal()}
            className="nm-interactive inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--color-cta)] px-4 text-[13px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          >
            <Plus size={16} strokeWidth={2.4} />
            New goal
          </button>
        </div>
      </header>

      {progress.length ? (
        <section className="grid flex-1 grid-cols-[0.92fr_1.08fr] gap-4 overflow-hidden">
          <div className="nm-panel-strong flex min-h-0 flex-col overflow-hidden rounded-[22px] p-6 text-[color:var(--color-cta-ink)] shadow-[var(--shadow-md)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-cta-ink)]/70">
              where you're headed
            </p>
            <h2
              className="mt-3 text-[52px] font-bold leading-none tracking-normal"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {primary?.progress.label ?? "Your goals"}
            </h2>
            <p className="mt-4 max-w-[360px] text-[14px] leading-snug text-[color:var(--color-bg)]/72">
              {primary
                ? isGoalDone(primary.progress)
                  ? "This destination is fully funded. Nicely done."
                  : `${formatMoney(primary.progress.remaining, primary.goal.currency)} left before this destination is fully funded.`
                : "Set a destination and Numa Pro will keep the money picture pointed somewhere useful."}
            </p>
            <div className="mt-auto">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-cta-ink)]/60">
                    total progress
                  </p>
                  <p className="mt-1 text-[34px] font-bold leading-none tabular-nums">
                    {Math.round(overallPct)}%
                  </p>
                </div>
                <p className="text-right font-mono text-[12px] text-[color:var(--color-bg)]/72">
                  {formatMoney(totalRemaining, currency)}
                  <br />
                  left
                </p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[color:var(--color-cta-ink)]/18">
                <div
                  className="h-full rounded-full bg-[color:var(--color-cta-ink)]"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold tracking-normal text-[color:var(--color-ink)]">Destinations</h2>
                <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-3)]">
                  {progress.length} active goal{progress.length === 1 ? "" : "s"} · click any row to edit
                </p>
              </div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                live
              </p>
            </div>
            <div className="mt-3 space-y-3 overflow-y-auto pr-1">
              {progress.map((row, index) => (
                <GoalDesktopRow
                  key={row.goal.id}
                  row={row}
                  index={index}
                  onClick={() => onOpenGoal(row.goal)}
                  onAdd={() => onAddContribution(row.goal, row.progress.label)}
                />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="grid flex-1 grid-cols-[0.95fr_1.05fr] gap-4 overflow-hidden">
          <div className="nm-panel-strong rounded-[22px] p-6 text-[color:var(--color-cta-ink)] shadow-[var(--shadow-md)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-cta-ink)]/70">
              where you're headed
            </p>
            <h2
              className="mt-4 max-w-[420px] text-[58px] font-bold leading-[0.94] tracking-normal"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Set the first destination.
            </h2>
            <p className="mt-5 max-w-[390px] text-[14px] leading-snug text-[color:var(--color-bg)]/72">
              House deposit, emergency fund, sabbatical, or any asset you want to grow. Numa Pro keeps it visible without nagging.
            </p>
            <button
              type="button"
              onClick={() => onOpenGoal()}
              className="nm-interactive mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--color-cta)] px-4 text-[13px] font-bold text-[color:var(--color-cta-ink)]"
            >
              <Plus size={15} />
              New goal
            </button>
          </div>
          <div className="grid place-items-center rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-8 text-center shadow-[var(--shadow-sm)]">
            <div>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
                <Target size={28} />
              </span>
              <h3 className="mt-5 text-[24px] font-bold tracking-normal text-[color:var(--color-ink)]">
                No goals yet
              </h3>
              <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-snug text-[color:var(--color-ink-3)]">
                Add one target and Numa Pro will connect your capital, buckets, and monthly movement around it.
              </p>
            </div>
          </div>
        </section>
      )}
    </motion.div>
  );
}

function GoalDesktopRow({
  row,
  index,
  onClick,
  onAdd
}: {
  row: { goal: NetWorthGoal; progress: GoalProgressRow };
  index: number;
  onClick: () => void;
  onAdd: () => void;
}) {
  const icon = index === 0 ? "🏠" : index === 1 ? "🛟" : "🏝️";
  const done = isGoalDone(row.progress);
  return (
    <div className="relative">
    <button
      type="button"
      onClick={onClick}
      className="nm-interactive w-full rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-4 pr-20 text-left hover:border-[color:var(--color-line-strong)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[color:var(--color-brand-mist)] text-[20px]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold tracking-normal text-[color:var(--color-ink)]">
              {row.progress.label}
            </span>
            {done ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--color-positive)]">
                <NumaCoin3D size={18} mode="flip" segments={24} />
                Done
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-[color:var(--color-ink-3)]">
            {row.goal.deadline ? new Date(row.goal.deadline).getFullYear() : row.progress.detail}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[15px] font-bold tabular-nums text-[color:var(--color-ink)]">
            {formatMoneyCompact(row.progress.current, row.goal.currency)}
          </span>
          <span className="block font-mono text-[10px] text-[color:var(--color-ink-3)]">
            of {formatMoneyCompact(row.progress.target, row.goal.currency)}
          </span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-brand-mist)]">
        <div
          className={`h-full rounded-full ${
            done ? "bg-[color:var(--color-positive-soft)]" : "bg-[color:var(--color-ink)]"
          }`}
          style={{ width: `${row.progress.pct}%` }}
        />
      </div>
    </button>
    {goalScope(row.goal) !== "holding_value" ? (
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add to ${row.progress.label}`}
        className="nm-interactive absolute right-4 top-4 inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] text-[12px] font-semibold shadow-[var(--shadow-sm)]"
      >
        <Plus size={13} /> Add
      </button>
    ) : null}
    </div>
  );
}
