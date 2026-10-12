/**
 * History sheet: merged expense + settlement timeline with progressive
 * reveal. Extracted from the former `page.tsx`.
 */
import { useEffect, useMemo, useState } from "react";
import { HandCoins, ReceiptText } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoneyDecimal } from "@/lib/money";
import { useLocale } from "@/lib/i18n";
import { revealDelay } from "@/lib/motion";
import {
  buildMemberLabelMap,
  historyCountKey,
  splitLabel,
  template
} from "@/lib/podPageHelpers";
import type { Category, MoneyPod, PodExpense, PodGroup, PodMember, PodSettlement } from "@/lib/types";
import { resolvePodExpenseCategory } from "@/lib/podCategories";
import { CategoryPill, Sheet } from "./shared";

const HISTORY_INITIAL_COUNT = 24;
const HISTORY_WARM_COUNT = 80;
const HISTORY_STEP_COUNT = 80;

export function HistorySheet({
  open,
  onClose,
  pod,
  members,
  groups,
  expenses,
  settlements,
  categories,
  labelForCategory,
  onEditExpense,
  onEditSettlement
}: {
  open: boolean;
  onClose: () => void;
  pod: MoneyPod;
  members: PodMember[];
  groups: PodGroup[];
  expenses: PodExpense[];
  settlements: PodSettlement[];
  categories: Category[];
  labelForCategory: (category: Category) => string;
  onEditExpense: (expense: PodExpense) => void;
  onEditSettlement: (settlement: PodSettlement) => void;
}) {
  const { locale, t } = useLocale();
  const memberLabels = useMemo(() => buildMemberLabelMap(members, groups), [members, groups]);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_INITIAL_COUNT);

  useEffect(() => {
    if (!open) return;
    const total = expenses.length + settlements.length;
    setVisibleHistoryCount(Math.min(HISTORY_INITIAL_COUNT, total));
    const frame = window.requestAnimationFrame(() => {
      setVisibleHistoryCount(Math.min(HISTORY_WARM_COUNT, total));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, expenses.length, settlements.length]);

  const historySources = useMemo(() => {
    if (!open) return [];
    return [
      ...expenses.map((expense) => ({
        id: `expense-${expense.id}`,
        kind: "expense" as const,
        source: expense,
        occurredAt: expense.occurredAt
      })),
      ...settlements.map((settlement) => ({
        id: `settlement-${settlement.id}`,
        kind: "settlement" as const,
        source: settlement,
        occurredAt: settlement.occurredAt
      }))
    ].sort((a, b) => b.occurredAt - a.occurredAt);
  }, [open, expenses, settlements]);

  const visibleHistory = useMemo(() => {
    return historySources.slice(0, visibleHistoryCount).map((entry) => {
      if (entry.kind === "settlement") {
        const settlement = entry.source;
        return {
          id: entry.id,
          kind: entry.kind,
          source: settlement,
          occurredAt: entry.occurredAt,
          title: `${memberLabels.get(settlement.fromMemberId) ?? t("pod.someone")} → ${memberLabels.get(settlement.toMemberId) ?? t("pod.someone")}`,
          meta: settlement.note?.trim() || t("pod.settlement"),
          amount: settlement.amount,
          currency: settlement.currency,
          category: undefined,
          categoryLabel: undefined,
          inferredCategory: false
        };
      }
      const expense = entry.source;
      const { category, inferred } = resolvePodExpenseCategory(expense, categories);
      return {
        id: entry.id,
        kind: entry.kind,
        source: expense,
        occurredAt: entry.occurredAt,
        title: expense.description || "Expense",
        meta: `${memberLabels.get(expense.paidByMemberId) ?? t("pod.someone")} · ${splitLabel(expense.splitMode, t)}`,
        amount: expense.amount,
        currency: expense.currency,
        category,
        categoryLabel: category ? labelForCategory(category) : t("pod.uncategorized"),
        inferredCategory: inferred
      };
    });
  }, [historySources, visibleHistoryCount, memberLabels, categories, labelForCategory, t]);

  const canShowMoreHistory = visibleHistory.length < historySources.length;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }),
    [locale]
  );

  return (
    <Sheet open={open} onClose={onClose} title={t("pod.allHistory")} width={680}>
      <div className="mb-3 rounded-2xl bg-[color:var(--color-bg)] border border-[color:var(--color-line)] px-3 py-2">
        <p className="text-[12px] font-semibold text-[color:var(--color-ink)]">
          {pod.name}
        </p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)]">
          {template(t("pod.historySummary"), {
            expenses: template(t(historyCountKey("expenses", expenses.length, locale)), {
              count: String(expenses.length)
            }),
            settlements: template(
              t(historyCountKey("settlements", settlements.length, locale)),
              { count: String(settlements.length) }
            )
          })}
        </p>
      </div>
      {historySources.length === 0 ? (
        <p className="text-[13.5px] text-[color:var(--color-ink-3)]">
          {t("pod.noActivity")}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[color:var(--color-line)]/70 rounded-2xl border border-[color:var(--color-line)] overflow-hidden">
            {visibleHistory.map((entry, index) => (
              <li key={entry.id} className="nm-reveal" style={revealDelay(Math.min(index, 8), 50)}>
                <button
                  type="button"
                  onClick={() => {
                    if (entry.kind === "expense") {
                      onEditExpense(entry.source);
                    } else {
                      onEditSettlement(entry.source);
                    }
                  }}
                  className="nm-interactive w-full grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-3 py-3 bg-[color:var(--color-paper)] text-left hover:bg-[color:var(--color-bg)]"
                  aria-label={template(t("pod.editHistoryItem"), { name: entry.title })}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-8 w-8 rounded-full grid place-items-center",
                      entry.kind === "settlement"
                        ? "bg-[color:var(--color-brand-soft)] text-[color:var(--color-ink)]"
                        : "bg-[color:var(--color-bg)] text-[color:var(--color-ink-2)]"
                    )}
                  >
                    {entry.kind === "settlement" ? <HandCoins size={15} /> : <ReceiptText size={15} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">
                      {entry.title}
                    </p>
                    <p
                      className="text-[11.5px] text-[color:var(--color-ink-3)] truncate"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {dateFormatter.format(new Date(entry.occurredAt))} · {entry.meta}
                    </p>
                    {entry.kind === "expense" ? (
                      <div className="mt-1">
                        <CategoryPill
                          category={entry.category}
                          label={entry.categoryLabel ?? t("pod.uncategorized")}
                          inferred={entry.inferredCategory}
                        />
                      </div>
                    ) : null}
                  </div>
                  <p
                    className="text-[13.5px] font-bold nm-num text-[color:var(--color-ink)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {formatMoneyDecimal(entry.amount, entry.currency)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {canShowMoreHistory ? (
            <button
              type="button"
              onClick={() =>
                setVisibleHistoryCount((count) =>
                  Math.min(count + HISTORY_STEP_COUNT, historySources.length)
                )
              }
              className="mt-3 h-11 w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[13px] font-semibold text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)]"
            >
              Showing {visibleHistory.length} of {historySources.length} · Show more
            </button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
