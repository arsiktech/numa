import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, MoreHorizontal, Plus, Target } from "lucide-react";
import { GoalDialog } from "@/components/features/GoalDialog";
import { AddMoneyDialog } from "@/components/features/AddMoneyDialog";
import { CoinCelebration } from "@/components/brand/CoinCelebration";
import {
  useAssets,
  useCategories,
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
import { cn } from "@/lib/cn";
import { computeGoalProgress, goalScope } from "@/lib/goals";
import { convertCurrency } from "@/lib/fx";
import { useLocale, type I18nKey } from "@/lib/i18n";
import { template } from "@/lib/podPageHelpers";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { pageEnter } from "@/lib/motion";
import type { NetWorthGoal, Transaction } from "@/lib/types";

/** Locale key for the pluralized "{count} buckets" badge (ru one/few/many). */
function bucketCountKey(count: number, locale: string): I18nKey {
  const category = (() => {
    try {
      return new Intl.PluralRules(locale).select(count);
    } catch {
      return count === 1 ? "one" : "other";
    }
  })();
  const variant = category === "one" ? "One" : category === "few" ? "Few" : "Many";
  return `buckets.count${variant}` as I18nKey;
}

export default function BucketsPage() {
  const { t, locale } = useLocale();
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const currency = portfolio.defaultCurrency;
  const assets = useAssets(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const liabilities = useLiabilities(portfolio.id);
  const quotes = useMarketQuotes();
  const transactions = useTransactions(portfolio.id);
  const recurring = useRecurring(portfolio.id);
  const categories = useCategories(portfolio.id);
  const goals = useGoals(portfolio.id);
  const { rates } = useFxRates();
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<NetWorthGoal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [celebrateMsg, setCelebrateMsg] = useState<string | null>(null);
  const netWorth = rollupNetWorth(assets, holdings, liabilities, quotes, { rates, currency });
  const buckets = useMemo(
    () =>
      goals.filter((goal) => goalScope(goal) !== "monthly_income").map((goal, index) => ({
        goal,
        icon: BUCKET_ICONS[index % BUCKET_ICONS.length],
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
    [assets, categories, currency, goals, holdings, netWorth.netWorth, quotes, rates, recurring, transactions]
  );
  // Headline total: skip net_worth-scoped goals (their `current` is the whole
  // portfolio net worth, which already contains every asset/holding-scoped
  // bucket — summing them double-counts) and normalize each goal's currency
  // into the portfolio currency so the aggregate is internally consistent.
  const totalSaved = buckets
    .filter((item) => goalScope(item.goal) !== "net_worth")
    .reduce(
      (sum, item) =>
        sum + convertCurrency(item.progress.current, item.goal.currency, currency, rates),
      0
    );
  const recentAdds = useMemo(
    () =>
      transactions
        .filter((tx) => tx.kind === "income")
        // Newest first — array order isn't guaranteed to be chronological.
        .sort((a, b) => b.occurredAt - a.occurredAt)
        .slice(0, 3),
    [transactions]
  );
  const selectedBucket = selectedGoalId
    ? buckets.find((item) => item.goal.id === selectedGoalId) ?? null
    : null;
  // Only income linked to the bucket's income category is really "this
  // bucket's adds" — other scopes get portfolio-wide income clearly labeled.
  const selectedBucketAdds = useMemo(() => {
    if (!selectedBucket) return recentAdds;
    const categoryId =
      goalScope(selectedBucket.goal) === "income_category"
        ? selectedBucket.goal.categoryId
        : undefined;
    if (!categoryId) return recentAdds;
    return transactions
      .filter((tx) => tx.kind === "income" && tx.categoryId === categoryId)
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, 3);
  }, [recentAdds, selectedBucket, transactions]);

  useEffect(() => {
    if (selectedGoalId && !selectedBucket) {
      setSelectedGoalId(null);
    }
  }, [selectedBucket, selectedGoalId]);

  function openGoal(goal: NetWorthGoal | null = null) {
    setEditingGoal(goal);
    setGoalOpen(true);
  }

  return (
    <motion.div
      {...pageEnter}
      className="space-y-4 pb-28 lg:pb-0"
    >
      {selectedBucket ? (
        <BucketDetail
          bucket={selectedBucket}
          recentAdds={selectedBucketAdds}
          onBack={() => setSelectedGoalId(null)}
          onAddMoney={() => setAddMoneyOpen(true)}
          onEditGoal={() => openGoal(selectedBucket.goal)}
        />
      ) : (
        <>
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="nm-eyebrow">{t("buckets.eyebrow")}</p>
              <h1
                className="mt-1 text-[34px] font-bold leading-none tracking-[-0.045em] text-[color:var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t("buckets.heading")}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => openGoal()}
              aria-label={t("buckets.new")}
              className="nm-interactive grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--color-cta-ink)] text-[color:var(--color-cta)] shadow-[var(--shadow-sm)]"
            >
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </header>

          <section className="rounded-[22px] bg-[color:var(--color-brand-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                  {t("buckets.totalLabel")}
                </p>
                <p
                  className="mt-1 text-[30px] font-bold tracking-[-0.045em] text-[color:var(--color-ink)] nm-num"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {formatMoney(totalSaved, currency)}
                </p>
              </div>
              <span className="rounded-full bg-[color:var(--color-paper)] px-3 py-1.5 font-mono text-[11px] font-semibold text-[color:var(--color-positive)]">
                {template(t(bucketCountKey(buckets.length, locale)), {
                  count: String(buckets.length)
                })}
              </span>
            </div>
          </section>

          {buckets.length ? (
            <section className="space-y-3">
              {buckets.map((bucket) => (
                <BucketListCard
                  key={bucket.goal.id}
                  bucket={bucket}
                  onOpen={() => setSelectedGoalId(bucket.goal.id)}
                />
              ))}
            </section>
          ) : (
            <section className="rounded-[28px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-md)]">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
                <Target size={24} />
              </div>
              <h2
                className="mt-5 text-[26px] font-bold leading-none tracking-[-0.04em] text-[color:var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t("buckets.emptyTitle")}
              </h2>
              <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
                {t("buckets.emptyBody")}
              </p>
              <button
                type="button"
                onClick={() => openGoal()}
                className="nm-interactive mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--color-cta)] px-5 text-[14px] font-bold text-[color:var(--color-cta-ink)]"
              >
                <Plus size={16} />
                {t("buckets.new")}
              </button>
            </section>
          )}

          <RecentAddsPanel recentAdds={recentAdds} />
        </>
      )}

      <GoalDialog
        open={goalOpen}
        editing={editingGoal}
        onClose={() => {
          setGoalOpen(false);
          setEditingGoal(null);
        }}
      />
      <AddMoneyDialog
        open={addMoneyOpen && Boolean(selectedBucket)}
        goal={selectedBucket?.goal ?? null}
        label={selectedBucket?.progress.label ?? ""}
        onClose={() => setAddMoneyOpen(false)}
        onCelebrate={(message) => setCelebrateMsg(message)}
      />
      <CoinCelebration
        show={Boolean(celebrateMsg)}
        label={celebrateMsg ?? undefined}
        onDone={() => setCelebrateMsg(null)}
      />
    </motion.div>
  );
}

const BUCKET_ICONS = ["✈️", "🚲", "🛟", "🏠", "🌴", "💻"];

type BucketViewModel = {
  goal: NetWorthGoal;
  icon: string;
  progress: ReturnType<typeof computeGoalProgress>;
};

function BucketListCard({
  bucket,
  onOpen
}: {
  bucket: BucketViewModel;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const { goal, icon, progress } = bucket;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="nm-interactive w-full rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 text-left shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color:var(--color-bg)] text-[22px] shadow-[var(--shadow-inner-line)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[17px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]">
              {progress.label}
            </span>
            {goal.scope === "net_worth" ? (
              <span className="rounded-full bg-[color:var(--color-brand-mist)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
                {t("buckets.sharedBadge")}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-[color:var(--color-ink-3)]">
            {goal.deadline
              ? new Date(goal.deadline).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric"
                })
              : progress.detail}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[16px] font-bold tabular-nums text-[color:var(--color-ink)]">
            {formatMoneyCompact(progress.current, goal.currency)}
          </span>
          <span className="block font-mono text-[10px] text-[color:var(--color-ink-3)]">
            {template(t("buckets.ofTarget"), {
              amount: formatMoneyCompact(progress.target, goal.currency)
            })}
          </span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-bg)]">
        <div
          className="h-full rounded-full bg-[color:var(--color-ink)]"
          style={{ width: `${Number.isFinite(progress.pct) ? progress.pct : 0}%` }}
        />
      </div>
    </button>
  );
}

function BucketDetail({
  bucket,
  recentAdds,
  onBack,
  onAddMoney,
  onEditGoal
}: {
  bucket: BucketViewModel;
  recentAdds: Transaction[];
  onBack: () => void;
  onAddMoney: () => void;
  onEditGoal: () => void;
}) {
  const { t } = useLocale();
  const { goal, icon, progress } = bucket;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  // Missing FX makes progress unknown (NaN): draw an empty ring, say "Unavailable".
  const known = Number.isFinite(progress.pct);
  const dashOffset = circumference * (1 - (known ? progress.pct : 0) / 100);
  const pctText = known ? `${Math.round(progress.pct)}%` : "Unavailable";
  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("buckets.back")}
          className="nm-interactive grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)] shadow-[var(--shadow-sm)]"
        >
          <ChevronLeft size={18} />
        </button>
        <h1
          className="flex min-w-0 flex-1 items-center gap-2 truncate text-[18px] font-bold tracking-[-0.025em] text-[color:var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span aria-hidden>{icon}</span>
          <span className="truncate">{progress.label}</span>
        </h1>
        <button
          type="button"
          onClick={onEditGoal}
          aria-label={t("buckets.editGoal")}
          className="nm-interactive grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] shadow-[var(--shadow-sm)]"
        >
          <MoreHorizontal size={18} />
        </button>
      </header>

      <div className="flex justify-center py-2">
        <div className="relative h-[190px] w-[190px]">
          <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label={known ? template(t("buckets.pctSaved"), { pct: String(Math.round(progress.pct)) }) : "Progress unavailable"}>
            <circle
              cx="95"
              cy="95"
              r={radius}
              fill="none"
              stroke="var(--color-brand-mist)"
              strokeWidth="14"
            />
            <circle
              cx="95"
              cy="95"
              r={radius}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 95 95)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p
              className={known ? "text-[40px] font-bold leading-none tracking-[-0.045em] text-[color:var(--color-ink)] nm-num" : "text-[18px] font-semibold text-[color:var(--color-ink-2)]"}
              style={known ? { fontFamily: "var(--font-display)" } : undefined}
            >
              {pctText}
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--color-ink-3)]">
              {formatMoneyCompact(progress.current, goal.currency)} / {formatMoneyCompact(progress.target, goal.currency)}
            </p>
          </div>
        </div>
      </div>

      {/* holding_value buckets track market price — AddMoneyDialog would only
          dead-end in its read-only branch, so hide the CTA (mirrors
          GoalsPage's goalScope guard; QA 2026-06-24). */}
      <div
        className={cn(
          "grid gap-2",
          goalScope(bucket.goal) !== "holding_value" ? "grid-cols-[1fr_auto]" : "grid-cols-1"
        )}
      >
        {goalScope(bucket.goal) !== "holding_value" ? (
          <button
            type="button"
            onClick={onAddMoney}
            className="nm-interactive inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--color-cta)] px-4 text-[14px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          >
            <Plus size={17} />
            {t("buckets.addMoney")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEditGoal}
          className="nm-interactive h-12 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-5 text-[14px] font-bold text-[color:var(--color-ink)] shadow-[var(--shadow-sm)]"
        >
          {t("buckets.goalButton")}
        </button>
      </div>

      <RecentAddsPanel recentAdds={recentAdds} compact />
    </section>
  );
}

function RecentAddsPanel({
  recentAdds,
  compact
}: {
  recentAdds: Transaction[];
  compact?: boolean;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-[24px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold tracking-[-0.025em] text-[color:var(--color-ink)]">
          {t("buckets.recentAdds")}
        </h2>
        {!compact ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
            {t("buckets.latest")}
          </span>
        ) : null}
      </div>
      <div className="mt-2 divide-y divide-[color:var(--color-line)]">
        {recentAdds.length ? (
          recentAdds.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-bg)]">
                +
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[color:var(--color-ink)]">
                  {tx.description}
                </span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
                  {new Date(tx.occurredAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric"
                  })}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-[color:var(--color-positive)]">
                +{formatMoney(tx.amount, tx.currency)}
              </span>
            </div>
          ))
        ) : (
          <p className="py-4 text-[13px] leading-relaxed text-[color:var(--color-ink-3)]">
            {t("buckets.recentEmpty")}
          </p>
        )}
      </div>
    </section>
  );
}
