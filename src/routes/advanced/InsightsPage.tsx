import { useMemo, type ReactNode } from "react";
import { emitCommand } from "@/lib/commands";
import { AskNumaButton, SearchCommandButton } from "@/components/layout/CommandBar";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, TrendingUp, WalletCards } from "lucide-react";
import { Sparkle } from "@/components/ui/Sparkle";
import {
  useAssets,
  useCryptoWallets,
  useCurrentPortfolioId,
  useHoldings,
  useLiabilities,
  usePortfolio,
  useRecurring,
  useTransactions
} from "@/services/store";
import { useFxRates } from "@/services/fxSync";
import { findDuplicateTransactions, rollupCashflow, rollupNetWorth } from "@/lib/analytics";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { formatMoney } from "@/lib/money";
import { pageEnter } from "@/lib/motion";
import { rangeForSelection } from "@/lib/period";
import type { CurrencyCode } from "@/lib/types";
import { cryptoCapitalAmounts } from "@/lib/cryptoWallets";
import { useCryptoWalletSync } from "@/features/crypto/useCryptoWalletSync";

interface Insight {
  title: string;
  body: string;
  cta: string;
  to?: string;
  command?: "ask-numa" | "open-capture";
  tone: "lime" | "paper" | "dark";
}

export default function InsightsPage() {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const currency = portfolio.defaultCurrency;
  const transactions = useTransactions(portfolio.id);
  const recurring = useRecurring(portfolio.id);
  const assets = useAssets(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const cryptoWallets = useCryptoWallets(portfolio.id);
  const cryptoSync = useCryptoWalletSync(cryptoWallets);
  const liabilities = useLiabilities(portfolio.id);
  const { rates } = useFxRates();
  const monthRange = useMemo(() => rangeForSelection({ preset: "month" }), []);
  const cashflow = rollupCashflow(transactions, monthRange, { rates, currency });
  const baseNetWorth = rollupNetWorth(assets, holdings, liabilities, {}, { rates, currency });
  const cryptoCapital = cryptoCapitalAmounts(cryptoSync.wallets, rates, currency);
  const netWorth = {
    ...baseNetWorth,
    invested: baseNetWorth.invested + cryptoCapital.assets,
    liabilities: baseNetWorth.liabilities + cryptoCapital.debts,
    netWorth: baseNetWorth.netWorth + cryptoCapital.net
  };
  const duplicates = findDuplicateTransactions(transactions);
  const monthName = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date()),
    []
  );

  const insights = useMemo<Insight[]>(() => {
    const next: Insight[] = [];
    if (AI_ENABLED && cashflow.net > 0) {
      next.push({
        title: `Stash ${formatMoney(Math.max(25, Math.round(cashflow.net * 0.1)), currency)} without feeling it`,
        body: "Cashflow is positive this month. Move a small slice before it turns into invisible spending.",
        cta: "Ask Numa Pro",
        command: "ask-numa",
        tone: "lime"
      });
    }
    if (recurring.length) {
      next.push({
        title: `${recurring.length} recurring ${recurring.length === 1 ? "rule" : "rules"} to review`,
        body: "Recurring money is where silent drift hides. Review active rules before next month starts.",
        cta: "Review money",
        to: "/money",
        tone: "paper"
      });
    }
    if (duplicates.length) {
      next.push({
        title: `${duplicates.length} possible duplicate ${duplicates.length === 1 ? "entry" : "entries"}`,
        body: duplicates[0]?.reason ?? "Numa Pro found transactions with matching amount and nearby dates.",
        cta: "Open money",
        to: "/money",
        tone: "paper"
      });
    }
    if (!assets.length && !holdings.length && !cryptoWallets.length && !liabilities.length) {
      next.push({
        title: "Make worth complete",
        body: "Add cash, debt, investments, or hard assets so Numa Pro can explain movement instead of showing zeros.",
        cta: "Add capital",
        to: "/?add=asset",
        tone: "dark"
      });
    } else {
      next.push({
        title: "Capital picture is live",
        body: `${formatMoney(netWorth.netWorth, currency)} across cash, holdings, on-chain wallets, assets, and debt.`,
        cta: "Open net worth",
        to: "/",
        tone: "paper"
      });
    }
    if (!next.length) {
      next.push({
        title: "Nothing urgent",
        body: "Numa Pro has enough signal for now. Capture the next movement and the feed will wake up.",
        cta: "Capture",
        command: "open-capture",
        tone: "lime"
      });
    }
    return next.slice(0, 4);
  }, [
    assets.length,
    cashflow.net,
    currency,
    duplicates,
    holdings.length,
    cryptoWallets.length,
    liabilities.length,
    netWorth.netWorth,
    recurring.length
  ]);

  const metrics = [
    {
      label: "this month",
      value: formatMoney(cashflow.net, currency),
      detail: "income minus spending"
    },
    {
      label: "recurring",
      value: String(recurring.length),
      detail: "rules being watched"
    },
    {
      label: "duplicates",
      value: String(duplicates.length),
      detail: "possible repeats"
    }
  ];

  return (
    <>
      <div className="hidden lg:block">
        <InsightsDesktopSurface
          monthName={monthName}
          insights={insights}
          metrics={metrics}
          cashflowNet={cashflow.net}
          currency={currency}
          hasCapitalSignal={assets.length + holdings.length + cryptoWallets.length + liabilities.length > 0}
        />
      </div>
      <div className="lg:hidden">
        <InsightsMobileSurface
          insights={insights}
          metrics={metrics}
          cashflowNet={cashflow.net}
          currency={currency}
        />
      </div>
    </>
  );
}

function InsightsDesktopSurface({
  monthName,
  insights,
  metrics,
  cashflowNet,
  currency,
  hasCapitalSignal
}: {
  monthName: string;
  insights: Insight[];
  metrics: Array<{ label: string; value: string; detail: string }>;
  cashflowNet: number;
  currency: CurrencyCode;
  hasCapitalSignal: boolean;
}) {
  const primary = insights[0] ?? fallbackInsight;
  const secondary = insights.slice(1);

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
            className="mt-1 text-[30px] font-bold leading-none tracking-normal text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Insights
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchCommandButton />
          {AI_ENABLED && (
            <AskNumaButton icon={<Sparkle size={14} />} />
          )}
          <button
            type="button"
            onClick={() => emitCommand("open-capture")}
            className="nm-interactive inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--color-ink)] px-4 text-[13px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          >
            <WalletCards size={15} />
            Add
          </button>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-[1.08fr_0.92fr] gap-4 overflow-hidden">
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-4 overflow-hidden">
          {AI_ENABLED && (
            <NumaNoticePanel insight={primary} cashflowNet={cashflowNet} currency={currency} />
          )}

          <section className="min-h-0 overflow-hidden rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold tracking-normal text-[color:var(--color-ink)]">
                Next best moves
              </h2>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                ranked
              </p>
            </div>
            <div className="mt-3 space-y-2.5 overflow-hidden">
              {(secondary.length ? secondary : [primary]).map((insight) => (
                <InsightRow key={insight.title} insight={insight} />
              ))}
            </div>
          </section>
        </div>

        <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-4 overflow-hidden">
          <section className="grid grid-cols-3 gap-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)]"
              >
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                  {metric.label}
                </p>
                <p className="mt-2 text-[24px] font-bold leading-none tracking-normal tabular-nums text-[color:var(--color-ink)]">
                  {metric.value}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-[color:var(--color-ink-3)]">
                  {metric.detail}
                </p>
              </div>
            ))}
          </section>

          <section className="min-h-0 overflow-hidden rounded-[22px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-ink)] text-[color:var(--color-cta-ink)]">
                <TrendingUp size={16} />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
                  system health
                </p>
                <h2 className="text-[18px] font-bold tracking-normal">Ready to act</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <HealthRow icon={<Check size={15} />} label="Cloud data mirrored" />
              <HealthRow icon={<TrendingUp size={15} />} label="Capital rollup computed" />
              <HealthRow
                icon={<Sparkle size={14} />}
                label={hasCapitalSignal ? "Capital signal is live" : "Capital setup still needed"}
              />
            </div>
          </section>

          {AI_ENABLED && (
            <section className="rounded-[20px] bg-[color:var(--color-ink)] p-5 text-[color:var(--color-cta-ink)] shadow-[var(--shadow-md)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-cta-ink)]/70">
                notice → propose → execute
              </p>
              <p className="mt-2 text-[14px] leading-snug text-[color:var(--color-bg)]/75">
                Insights stay as proposals. Ask Numa Pro or open the destination before anything writes.
              </p>
            </section>
          )}
        </aside>
      </section>
    </motion.div>
  );
}

function InsightsMobileSurface({
  insights,
  metrics,
  cashflowNet,
  currency
}: {
  insights: Insight[];
  metrics: Array<{ label: string; value: string; detail: string }>;
  cashflowNet: number;
  currency: CurrencyCode;
}) {
  const primary = insights[0] ?? fallbackInsight;
  return (
    <motion.div
      {...pageEnter}
      className="space-y-4 pb-24"
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="nm-eyebrow">Numa Pro noticed</p>
          <h1
            className="mt-1 text-[34px] font-bold leading-none tracking-normal text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Insights
          </h1>
        </div>
        {AI_ENABLED && (
          <button
            type="button"
            onClick={() => emitCommand("ask-numa")}
            aria-label="Ask Numa Pro"
            className="nm-interactive grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--color-ink)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          >
            <Sparkle size={18} />
          </button>
        )}
      </header>

      {AI_ENABLED && (
        <NumaNoticePanel insight={primary} cashflowNet={cashflowNet} currency={currency} compact />
      )}

      <section className="grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[16px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-3 shadow-[var(--shadow-sm)]"
          >
            <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
              {metric.label}
            </p>
            <p className="mt-2 truncate text-[17px] font-bold leading-none tabular-nums text-[color:var(--color-ink)]">
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-2.5">
        {(insights.length > 1 ? insights.slice(1) : insights).map((insight) => (
          <InsightRow key={insight.title} insight={insight} />
        ))}
      </section>
    </motion.div>
  );
}

function NumaNoticePanel({
  insight,
  cashflowNet,
  currency,
  compact
}: {
  insight: Insight;
  cashflowNet: number;
  currency: CurrencyCode;
  compact?: boolean;
}) {
  return (
    <section
      className={cnPanel(
        "rounded-[22px] bg-[color:var(--color-brand-mist)] p-5 shadow-[var(--shadow-sm)]",
        compact ? "" : "min-h-[260px]"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[color:var(--color-ink)] text-[color:var(--color-cta-ink)]">
          <Sparkle size={14} />
        </span>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
          Numa Pro noticed
        </p>
      </div>
      <h2
        className="mt-4 max-w-[600px] text-[30px] font-bold leading-[0.95] tracking-normal text-[color:var(--color-ink)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {insight.title}
      </h2>
      <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
        {insight.body}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <InsightAction insight={insight} primary />
        <button
          type="button"
          onClick={() => emitCommand("ask-numa", { prompt: insight.title })}
          className="nm-interactive inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 text-[12px] font-semibold text-[color:var(--color-ink-3)]"
        >
          Explain
        </button>
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
        this month {formatMoney(cashflowNet, currency)}
      </p>
    </section>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  return (
    <div className={rowClassName(insight)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--color-ink)] text-[color:var(--color-cta-ink)]">
        <Sparkle size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight tracking-normal text-[color:var(--color-ink)]">
          {insight.title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug text-[color:var(--color-ink-3)]">
          {insight.body}
        </span>
      </span>
      <InsightAction insight={insight} />
    </div>
  );
}

function InsightAction({ insight, primary }: { insight: Insight; primary?: boolean }) {
  const className = primary
    ? "nm-interactive inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[color:var(--color-ink)] px-4 text-[12px] font-bold text-[color:var(--color-cta-ink)]"
    : "nm-interactive grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)]";
  const children = primary ? (
    <>
      {insight.cta}
      <ArrowRight size={14} />
    </>
  ) : (
    <ArrowRight size={16} />
  );

  if (insight.to) {
    return (
      <Link to={insight.to} viewTransition className={className} aria-label={insight.cta}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => insight.command && emitCommand(insight.command)}
      className={className}
      aria-label={insight.cta}
    >
      {children}
    </button>
  );
}

function HealthRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-bg)] px-3 py-3 text-[13px] font-semibold text-[color:var(--color-ink)]">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
        {icon}
      </span>
      {label}
    </div>
  );
}

function cnPanel(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function rowClassName(insight: Insight) {
  const tone =
    insight.tone === "lime"
      ? "bg-[color:var(--color-brand-mist)]"
      : insight.tone === "dark"
        ? "bg-[color:var(--color-ink)] [&_*]:text-[color:var(--color-cta-ink)]"
        : "bg-[color:var(--color-paper)]";
  return `flex items-center gap-3 rounded-[20px] border border-[color:var(--color-line)] p-3.5 shadow-[var(--shadow-sm)] ${tone}`;
}

const fallbackInsight: Insight = {
  title: "Nothing urgent",
  body: "Numa Pro has enough signal for now. Capture the next movement and the feed will wake up.",
  cta: "Capture",
  command: "open-capture",
  tone: "lime"
};
