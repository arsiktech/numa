import { Check, HandCoins, Percent, Scale, UserRoundCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { localizeCategoryName } from "@/lib/i18n";
import { type Translate } from "@/lib/podPageHelpers";
import { formatMoneyDecimal } from "@/lib/money";
import { inferPodCategory } from "@/lib/podCategories";
import type { ExpenseScenario, PodExpenseCopy } from "@/lib/podExpenseCopy";
import type { Category, CurrencyCode, PodGroup, PodMember } from "@/lib/types";
import { Block, CategoryPill, ScenarioButton } from "./shared";

/**
 * Presentational sections extracted verbatim from `ExpenseSheet.tsx` so the
 * sheet stays under the max-lines budget. Pure JSX moves: markup, copy and
 * layout are byte-identical; each block receives exactly the props it needs.
 */

type QuickEntry = { description: string; amount: number | null };

export function QuickAddBlock({
  quickText,
  onQuickText,
  quickInputRef,
  presets,
  batchEntries,
  categories,
  podCurrency,
  copy,
  t
}: {
  quickText: string;
  onQuickText: (next: string) => void;
  quickInputRef: React.RefObject<HTMLInputElement | null>;
  presets: { label: string; text: string }[];
  batchEntries: QuickEntry[];
  categories: Category[];
  podCurrency: CurrencyCode;
  copy: PodExpenseCopy;
  t: Translate;
}) {
  return (
            <div className="rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 sm:p-4">
              <label className="block">
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {copy.smartAdd}
                </span>
                <input
                  ref={quickInputRef}
                  value={quickText}
                  onChange={(e) => onQuickText(e.target.value)}
                  placeholder="dinner 80, taxi 18, groceries 42.50"
                  className="mt-2 w-full min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 py-2.5 text-[17px] sm:text-[19px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
                  style={{ fontFamily: "var(--font-display)" }}
                />
              </label>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {presets.map((preset) => (
                  <button
                    key={preset.text}
                    type="button"
                    onClick={() => onQuickText(preset.text)}
                    className="shrink-0 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-2 text-[12px] font-semibold text-[color:var(--color-ink-2)] hover:border-[color:var(--color-brand)]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {batchEntries.length > 1 ? (
                <div className="mt-3 grid gap-1.5">
                  {batchEntries.map((entry, index) => {
                    const smartCategory = inferPodCategory(entry.description, categories);
                    return (
                      <div
                        key={`${entry.description}-${entry.amount ?? "missing"}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold text-[color:var(--color-ink)]">
                            {entry.description || copy.item(index + 1)}
                          </span>
                          <div className="mt-1">
                            <CategoryPill
                              category={smartCategory}
                              label={
                                smartCategory
                                  ? localizeCategoryName(smartCategory.name, t)
                                  : copy.uncategorized
                              }
                              inferred={Boolean(smartCategory)}
                            />
                          </div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[12.5px] font-bold nm-num",
                            entry.amount === null
                              ? "text-[color:var(--color-negative)]"
                              : "text-[color:var(--color-ink)]"
                          )}
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {entry.amount === null ? copy.addAmount : formatMoneyDecimal(entry.amount, podCurrency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
  );
}

export function SplitScenarioBlock({
  copy,
  hasPairGroups,
  scenario,
  groups,
  onScenario,
  settlementPreview
}: {
  copy: PodExpenseCopy;
  hasPairGroups: boolean;
  scenario: ExpenseScenario;
  groups: PodGroup[];
  onScenario: (next: ExpenseScenario) => void;
  settlementPreview: { title: string; detail: string };
}) {
  return (
    <>
              <Block label={copy.expenseType}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {hasPairGroups ? (
                    <ScenarioButton
                      selected={scenario === "shared_groups"}
                      icon={Scale}
                      title={copy.sharedGroupsTitle}
                      detail={copy.sharedGroupsDetail(groups.length)}
                      onClick={() => onScenario("shared_groups")}
                    />
                  ) : null}
                  {hasPairGroups || scenario === "covered_group" ? (
                    <ScenarioButton
                      selected={scenario === "covered_group"}
                      icon={HandCoins}
                      title={copy.coveredGroupTitle}
                      detail={copy.coveredGroupDetail}
                      onClick={() => onScenario("covered_group")}
                    />
                  ) : null}
                  <ScenarioButton
                    selected={scenario === "selected_people"}
                    icon={UserRoundCheck}
                    title={copy.selectedPeopleTitle}
                    detail={copy.selectedPeopleDetail}
                    onClick={() => onScenario("selected_people")}
                  />
                  <ScenarioButton
                    selected={scenario === "custom_split"}
                    icon={Percent}
                    title={copy.customSplitTitle}
                    detail={copy.customSplitDetail}
                    onClick={() => onScenario("custom_split")}
                  />
                </div>
              </Block>

              <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-brand-soft)]/45 p-3">
                <p className="text-[12.5px] font-semibold text-[color:var(--color-ink)]">
                  {settlementPreview.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[color:var(--color-ink-3)]">
                  {settlementPreview.detail}
                </p>
              </div>
    </>
  );
}

export function CustomSplitBlock({
  copy,
  pickerMembers,
  customShares,
  customShareSum,
  onApplyEven,
  onShare
}: {
  copy: PodExpenseCopy;
  pickerMembers: PodMember[];
  customShares: Record<string, number>;
  customShareSum: number;
  onApplyEven: () => void;
  onShare: (memberId: string, next: number) => void;
}) {
  return (
                <Block label={copy.customShares}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onApplyEven()}
                      className="h-8 rounded-full bg-[color:var(--color-brand-soft)] px-3 text-[12px] font-semibold text-[color:var(--color-ink)] transition-transform active:scale-[0.96]"
                    >
                      {copy.customEven}
                    </button>
                    <span
                      className={cn(
                        "text-[12px] font-semibold tabular-nums",
                        customShareSum === 100
                          ? "text-[color:var(--color-positive)]"
                          : "text-[color:var(--color-ink-3)]"
                      )}
                      role="status"
                    >
                      {customShareSum === 100
                        ? copy.customComplete
                        : customShareSum > 100
                          ? copy.customOver(customShareSum - 100)
                          : copy.customRemaining(100 - customShareSum)}
                    </span>
                  </div>
                  <div className="grid gap-1.5">
                    {pickerMembers.map((m) => {
                      const pct = customShares[m.id] ?? 0;
                      return (
                        <label
                          key={m.id}
                          className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-1.5"
                        >
                          <span className="min-w-0 truncate text-[13px] font-semibold text-[color:var(--color-ink)]">
                            {m.displayName}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={pct === 0 ? "" : String(pct)}
                              placeholder="0"
                              aria-label={`${m.displayName} %`}
                              onChange={(e) => {
                                const next = Math.max(
                                  0,
                                  Math.min(100, Math.round(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))
                                );
                                onShare(m.id, next);
                              }}
                              className="h-9 w-14 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] text-center text-[16px] sm:text-[14px] font-semibold tabular-nums text-[color:var(--color-ink)] focus:border-[color:var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
                            />
                            <span className="text-[12px] font-semibold text-[color:var(--color-ink-3)]">%</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Block>
  );
}

export function PayerPickerBlock({
  copy,
  t,
  paidById,
  onPayer,
  paidBySections,
  pickerMembers
}: {
  copy: PodExpenseCopy;
  t: Translate;
  paidById: string;
  onPayer: (memberId: string) => void;
  paidBySections: {
    sections: { group: PodGroup; members: PodMember[] }[];
    ungrouped: PodMember[];
  } | null;
  pickerMembers: PodMember[];
}) {
  const renderPayer = (m: PodMember) => (
    <button
      key={m.id}
      type="button"
      onClick={() => onPayer(m.id)}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors",
        paidById === m.id
          ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)]"
          : "border-[color:var(--color-line)] bg-[color:var(--color-paper)]"
      )}
    >
      <Avatar name={m.displayName} size={28} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[color:var(--color-ink)]">
        {m.displayName}
      </span>
      {paidById === m.id ? <Check size={14} /> : null}
    </button>
  );
  return (
            <Block label={copy.paidBy}>
              {paidBySections ? (
                <div className="grid gap-3">
                  {paidBySections.sections.map(({ group, members: groupMembers }) => (
                    <div key={group.id} className="grid gap-1.5">
                      <div className="flex items-center gap-1.5 px-1">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: group.color }}
                        />
                        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-[color:var(--color-ink-3)]">
                          {group.name}
                        </span>
                      </div>
                      <div className="grid gap-2">{groupMembers.map(renderPayer)}</div>
                    </div>
                  ))}
                  {paidBySections.ungrouped.length > 0 ? (
                    <div className="grid gap-1.5">
                      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[color:var(--color-ink-3)]">
                        {t("pod.noGroup")}
                      </span>
                      <div className="grid gap-2">{paidBySections.ungrouped.map(renderPayer)}</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-2">{pickerMembers.map(renderPayer)}</div>
              )}
            </Block>
  );
}
