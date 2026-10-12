import { cn } from "@/lib/cn";
/**
 * Add/edit shared-expense sheet, including quick-parse batch entry, split
 * scenarios and the settlement preview. Extracted from the former
 * `page.tsx`; behavior (including batch-save idempotency) is unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ReceiptText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { localizeCategoryName, useLocale } from "@/lib/i18n";
import { formatMoneyDecimal } from "@/lib/money";
import { getPodExpenseCategories } from "@/lib/podCategories";  // eslint-disable-line @typescript-eslint/no-unused-vars
import {
  formatCompactAmount,
  parseQuickExpense,
  parseQuickExpenseList
} from "@/lib/podPageHelpers";
import {
  buildExpenseEffectCopy,
  buildExpensePresets,
  POD_EXPENSE_COPY,
  type ExpenseScenario
} from "@/lib/podExpenseCopy";
import { inferPodCategory, isFallbackPodCategory } from "@/lib/podCategories";
import {
  useCurrentUser,
  usePodGroups,
  usePodMembers
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { usePodActions } from "@/services/podActions";
import type { Category, MoneyPod, PodExpense, PodSplitMode } from "@/lib/types";
import { Block, CategoryPill, Chip, ChipScroller, Sheet } from "./shared";
import {
  CustomSplitBlock,
  PayerPickerBlock,
  QuickAddBlock,
  SplitScenarioBlock
} from "./ExpenseSheetParts";

export function ExpenseSheet({
  open,
  onClose,
  pod,
  expense,
  categories,
  portfolioId
}: {
  open: boolean;
  onClose: () => void;
  pod: MoneyPod;
  expense: PodExpense | null;
  categories: Category[];
  portfolioId: string;
}) {
  const members = usePodMembers(pod.id);
  // Active members drive new-expense pickers. When editing an expense whose
  // payer/participants include a since-removed member, keep them selectable so
  // the edit doesn't silently drop them — `pickerMembers` adds those back in.
  const activeMembers = useMemo(() => members.filter((m) => m.active !== false), [members]);
  const pickerMembers = useMemo(() => {
    const referenced = new Set(
      expense ? [expense.paidByMemberId, ...expense.participantMemberIds] : []
    );
    return members.filter((m) => m.active !== false || referenced.has(m.id));
  }, [members, expense]);
  const groups = usePodGroups(pod.id);
  const me = useCurrentUser();
  const actions = usePodActions();
  const domainActions = useDomainActions();
  const { locale, t } = useLocale();
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  // Stable key for the current sheet session. Batch entries derive their
  // idempotency ids from it, so retrying a partially-failed batch replays the
  // already-committed entries into mutation receipts instead of duplicating
  // them (QA 2026-06-24, pod batch-save finding).
  const batchSaveKeyRef = useRef(`b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const copy = POD_EXPENSE_COPY[locale] ?? POD_EXPENSE_COPY.en;

  const meMember = members.find((m) => m.linkedUserId === me.id);
  const [paidById, setPaidById] = useState<string>(meMember?.id ?? activeMembers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const categoryTouchedRef = useRef(false);
  const [quickText, setQuickText] = useState("");
  const [card, setCard] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<PodSplitMode>(
    groups.length > 1 ? "equal_groups" : "equal_people"
  );
  const [coveredGroupId, setCoveredGroupId] = useState<string>(groups[0]?.id ?? "");
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set(activeMembers.map((m) => m.id))
  );
  // Custom split: memberId → integer percent. Integers summing to 100 map to
  // bps summing to exactly 10000 (×100), which the server validates strictly.
  const [customShares, setCustomShares] = useState<Record<string, number>>({});
  const memberIdsKey = members.map((m) => m.id).join("|");
  const groupIdsKey = groups.map((g) => g.id).join("|");
  const categoryIdsKey = categories.map((category) => `${category.id}:${category.name}`).join("|");
  const editExpenseId = expense?.id ?? "new";
  const hasPairGroups = groups.length > 1;

  // Group the "Paid by" picker under each member's group header, so it's clear
  // who belongs where (e.g. the two couples). Falls back to a flat list when
  // the pod has no groups — or nobody is assigned to one yet.
  const paidBySections = useMemo(() => {
    if (groups.length === 0) return null;
    const groupIds = new Set(groups.map((g) => g.id));
    const sections = groups
      .map((g) => ({ group: g, members: pickerMembers.filter((m) => m.groupId === g.id) }))
      .filter((s) => s.members.length > 0);
    if (sections.length === 0) return null;
    return {
      sections,
      ungrouped: pickerMembers.filter((m) => !m.groupId || !groupIds.has(m.groupId))
    };
  }, [groups, pickerMembers]);
  // Reset form when sheet re-opens or switches between create/edit.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setConfirmDelete(false);
    setDetailsOpen(false);
    if (expense) {
      setPaidById(expense.paidByMemberId);
      setAmount(String(expense.amount));
      setDescription(expense.description);
      setCategoryId(
        expense.categoryId ?? inferPodCategory(expense.description, categories)?.id ?? ""
      );
      categoryTouchedRef.current = Boolean(expense.categoryId);
      setQuickText(`${expense.description} ${formatCompactAmount(expense.amount)}`);
      setCard(expense.paidByCard ?? "");
      setSplitMode(expense.splitMode);
      setCoveredGroupId(expense.coveredGroupId ?? groups[0]?.id ?? "");
      setSelectedParticipants(new Set(expense.participantMemberIds));
      setCustomShares(
        expense.splitMode === "custom" && expense.customSplits?.length
          ? Object.fromEntries(
              expense.customSplits.map((split) => [split.memberId, Math.round(split.bps / 100)])
            )
          : {}
      );
      return;
    }
    setPaidById(meMember?.id ?? activeMembers[0]?.id ?? "");
    setAmount("");
    setDescription("");
    setCategoryId("");
    categoryTouchedRef.current = false;
    batchSaveKeyRef.current = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    setQuickText("");
    setCard("");
    setSplitMode(groups.length > 1 ? "equal_groups" : "equal_people");
    setCoveredGroupId(groups[0]?.id ?? "");
    setSelectedParticipants(new Set(activeMembers.map((m) => m.id)));
    setCustomShares({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editExpenseId, memberIdsKey, groupIdsKey, meMember?.id, categoryIdsKey]);

  useEffect(() => {
    if (!open || categoryTouchedRef.current) return;
    setCategoryId(inferPodCategory(description, categories)?.id ?? "");
  }, [open, description, categoryIdsKey, categories]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => quickInputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open, editExpenseId]);

  const payer = members.find((m) => m.id === paidById);
  const payerCards = useMemo(() => payer?.cards ?? [], [payer?.cards]);

  // If the payer changes, snap the card chip to their first card (if any) so
  // the user can submit immediately without an extra tap.
  useEffect(() => {
    if (!card && payerCards[0]) setCard(payerCards[0]);
    if (card && !payerCards.includes(card)) setCard(payerCards[0] ?? "");
  }, [payerCards, card]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const quickEntries = parseQuickExpenseList(quickText);
    const batchEntries = !expense && quickEntries.length > 1 ? quickEntries : [];
    const isBatchSave = batchEntries.length > 1;
    const numericAmount = Number(amount.replace(",", "."));
    if (!isBatchSave && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      setError(copy.errorPositiveAmount);
      return;
    }
    if (!isBatchSave && !description.trim()) {
      setError(copy.errorDescription);
      return;
    }
    if (
      isBatchSave &&
      batchEntries.some((entry) => !entry.description.trim() || entry.amount === null)
    ) {
      setError(copy.errorSmartItems);
      return;
    }
    if (!paidById) {
      setError(copy.errorPayer);
      return;
    }
    const submitShareEntries = Object.entries(customShares).filter(([, pct]) => pct > 0);
    const participantList =
      splitMode === "covered_group"
        ? activeMembers.filter((m) => m.groupId === coveredGroupId).map((m) => m.id)
        : splitMode === "custom"
          ? submitShareEntries.map(([id]) => id)
          : Array.from(selectedParticipants);
    if (participantList.length === 0) {
      setError(copy.errorParticipants);
      setDetailsOpen(true);
      return;
    }
    if (
      splitMode === "custom" &&
      submitShareEntries.reduce((sum, [, pct]) => sum + pct, 0) !== 100
    ) {
      setError(copy.errorCustomSum);
      setDetailsOpen(true);
      return;
    }
    const createdCategoryIds = new Map<string, string>();
    async function ensurePersistedCategory(category: Category | undefined) {
      if (!category) return undefined;
      if (!isFallbackPodCategory(category.id)) return category.id;
      const cached = createdCategoryIds.get(category.name);
      if (cached) return cached;
      const created = await domainActions.createCategory({
        portfolioId,
        name: category.name,
        kind: "expense",
        icon: category.icon,
        color: category.color,
        sortOrder: category.sortOrder
      });
      createdCategoryIds.set(category.name, created.id);
      return created.id;
    }

    const singleCategory = categoryId
      ? categories.find((category) => category.id === categoryId)
      : inferPodCategory(description, categories);
    const baseExpense = {
      podId: pod.id,
      paidByMemberId: paidById,
      paidByCard: card.trim() || undefined,
      currency: pod.currency,
      categoryId: await ensurePersistedCategory(singleCategory),
      splitMode,
      participantMemberIds: participantList,
      // Integer percents × 100 = bps; the 100-sum guard above means these
      // always total exactly 10000, which the server validates strictly.
      customSplits:
        splitMode === "custom"
          ? submitShareEntries.map(([memberId, pct]) => ({ memberId, bps: pct * 100 }))
          : undefined,
      coveredGroupId: splitMode === "covered_group" ? coveredGroupId : undefined
    };
    setSaving(true);
    try {
      if (expense) {
        const nextExpense: Omit<PodExpense, "id"> = {
          ...baseExpense,
          amount: numericAmount,
          description: description.trim(),
          occurredAt: expense.occurredAt
        };
        await actions.updatePodExpense(expense, nextExpense);
      } else if (isBatchSave) {
        const createdAt = Date.now();
        for (const [index, entry] of batchEntries.entries()) {
          const entryDescription = entry.description.trim();
          const entryAmount = entry.amount!;
          await actions.addPodExpense({
            ...baseExpense,
            amount: entryAmount,
            description: entryDescription,
            categoryId: await ensurePersistedCategory(
              inferPodCategory(entry.description, categories)
            ),
            occurredAt: createdAt + index,
            // Content-derived so an unchanged entry replays (deduped by
            // mutation receipts) while an edited entry inserts fresh.
            clientMutationId: `moneyPods.addExpense:${batchSaveKeyRef.current}:${index}:${entryDescription}:${entryAmount}`
          });
        }
      } else {
        await actions.addPodExpense({
          ...baseExpense,
          amount: numericAmount,
          description: description.trim(),
          occurredAt: Date.now()
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errorSave);
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense() {
    if (!expense) return;
    setError(null);
    setSaving(true);
    try {
      await actions.deletePodExpense(expense);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errorDelete);
    } finally {
      setSaving(false);
    }
  }

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyQuickText(next: string) {
    setQuickText(next);
    const parsedList = parseQuickExpenseList(next);
    if (parsedList.length > 1) {
      const total = parsedList.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      setDescription(copy.batchDescription(parsedList.length));
      if (total > 0) setAmount(formatCompactAmount(total));
      return;
    }
    const parsed = parsedList[0] ?? parseQuickExpense(next);
    if (parsed.description) setDescription(parsed.description);
    if (parsed.amount !== null) setAmount(formatCompactAmount(parsed.amount));
  }

  function pickCategory(next: string) {
    categoryTouchedRef.current = true;
    setCategoryId(next);
  }

  // Even integer percentages that always total exactly 100 — the remainder
  // after flooring goes to the first members, one point each.
  function evenShares(ids: string[]): Record<string, number> {
    if (ids.length === 0) return {};
    const base = Math.floor(100 / ids.length);
    const remainder = 100 - base * ids.length;
    return Object.fromEntries(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
  }

  function applyScenario(next: ExpenseScenario) {
    if (next === "shared_groups" && hasPairGroups) {
      setSplitMode("equal_groups");
      setSelectedParticipants(new Set(activeMembers.map((m) => m.id)));
      return;
    }
    if (next === "covered_group") {
      setSplitMode("covered_group");
      const otherGroup = payer?.groupId
        ? groups.find((group) => group.id !== payer.groupId)
        : undefined;
      setCoveredGroupId((current) => current || otherGroup?.id || groups[0]?.id || "");
      return;
    }
    if (next === "custom_split") {
      setSplitMode("custom");
      setCustomShares((current) =>
        Object.keys(current).length > 0
          ? current
          : evenShares(
              (selectedParticipants.size > 0
                ? activeMembers.filter((m) => selectedParticipants.has(m.id))
                : activeMembers
              ).map((m) => m.id)
            )
      );
      return;
    }
    setSplitMode("equal_people");
    if (selectedParticipants.size === 0) {
      setSelectedParticipants(new Set(activeMembers.map((m) => m.id)));
    }
  }

  const numericAmount = Number(amount.replace(",", "."));
  const quickEntries = parseQuickExpenseList(quickText);
  const batchEntries = !expense && quickEntries.length > 1 ? quickEntries : [];
  const batchTotal = batchEntries.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const isBatchQuickAdd =
    batchEntries.length > 1 &&
    batchEntries.every((item) => item.description.trim() && item.amount !== null);
  const customShareEntries = Object.entries(customShares).filter(([, pct]) => pct > 0);
  const customShareSum = customShareEntries.reduce((sum, [, pct]) => sum + pct, 0);
  const participantList =
    splitMode === "covered_group"
      ? activeMembers.filter((m) => m.groupId === coveredGroupId).map((m) => m.id)
      : splitMode === "custom"
        ? customShareEntries.map(([id]) => id)
        : Array.from(selectedParticipants);
  const scenario: ExpenseScenario =
    splitMode === "covered_group"
      ? "covered_group"
      : splitMode === "equal_groups"
        ? "shared_groups"
        : splitMode === "custom"
          ? "custom_split"
          : "selected_people";
  const coveredGroup = groups.find((group) => group.id === coveredGroupId);
  const payerGroup = payer?.groupId ? groups.find((group) => group.id === payer.groupId) : undefined;
  const coveredMembers = coveredGroup
    ? activeMembers.filter((member) => member.groupId === coveredGroup.id)
    : [];
  const amountPreview =
    isBatchQuickAdd
      ? formatMoneyDecimal(batchTotal, pod.currency)
      : Number.isFinite(numericAmount) && numericAmount > 0
      ? formatMoneyDecimal(numericAmount, pod.currency)
      : formatMoneyDecimal(0, pod.currency);
  const canSave =
    (isBatchQuickAdd ||
      (Number.isFinite(numericAmount) &&
        numericAmount > 0 &&
        description.trim().length > 0)) &&
    Boolean(paidById) &&
    participantList.length > 0 &&
    (splitMode !== "custom" || customShareSum === 100);
  const splitSummary =
    splitMode === "covered_group"
      ? coveredGroup?.name ?? copy.chooseGroup
      : splitMode === "equal_groups"
        ? copy.groupCount(groups.length || 1)
        : splitMode === "custom"
          ? copy.customSummary(customShareEntries.length)
          : copy.participantCount(participantList.length);
  const settlementPreview = buildExpenseEffectCopy({
    copy,
    scenario,
    amount: amountPreview,
    payerName: payer?.displayName,
    payerGroupName: payerGroup?.name,
    coveredGroupName: coveredGroup?.name,
    participantCount: participantList.length,
    groupCount: groups.length
  });
  const presets = buildExpensePresets(pod.currency, copy);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const categoryLabel = selectedCategory
    ? localizeCategoryName(selectedCategory.name, t)
    : copy.uncategorized;
  const categoryIsSmart = Boolean(selectedCategory && !categoryTouchedRef.current);

  return (
      <Sheet open={open} onClose={onClose} title={expense ? copy.editTitle : copy.addTitle} width={920}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div className="min-w-0 space-y-4">
            <QuickAddBlock
              quickText={quickText}
              onQuickText={applyQuickText}
              quickInputRef={quickInputRef}
              presets={presets}
              batchEntries={batchEntries}
              categories={categories}
              podCurrency={pod.currency}
              copy={copy}
              t={t}
            />

            <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-3">
              <label className="block min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
                  {copy.amount}
                </span>
                <div className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4">
                  <span className="text-[20px] font-bold text-[color:var(--color-ink-3)]">
                    {pod.currency === "USD" ? "$" : "€"}
                  </span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="min-w-0 flex-1 bg-transparent border-0 outline-none text-[26px] font-bold tracking-[-0.04em] text-[color:var(--color-ink)] nm-num"
                    style={{ fontFamily: "var(--font-display)" }}
                  />
                </div>
              </label>

              <label className="block min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
                  {copy.description}
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={copy.descriptionPlaceholder}
                  className="mt-2 w-full h-12 px-4 rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[15px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                />
              </label>
            </div>

            <label className="block min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
                {copy.category}
              </span>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-2">
                <div className="min-h-12 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-2 flex items-center">
                  <CategoryPill
                    category={selectedCategory}
                    label={categoryLabel}
                    inferred={categoryIsSmart}
                  />
                </div>
                <select
                  value={categoryId}
                  onChange={(event) => pickCategory(event.target.value)}
                  className="h-12 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[16px] sm:text-[14px] font-semibold text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                >
                  <option value="">{copy.uncategorized}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {localizeCategoryName(category.name, t)}
                    </option>
                  ))}
                </select>
              </div>
              <span className="mt-1 block text-[11.5px] text-[color:var(--color-ink-3)]">
                {copy.categoryHint}
              </span>
            </label>

            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="lg:hidden w-full rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 py-3 text-left"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
                {copy.detailsTitle}
              </span>
              <span className="mt-1 block text-[13px] font-semibold text-[color:var(--color-ink)]">
                {payer?.displayName ?? copy.choosePayer} · {splitSummary}
                {card ? ` · ${card}` : ""}
              </span>
              <span className="mt-0.5 block text-[12px] text-[color:var(--color-ink-3)]">
                {detailsOpen ? copy.hideOptions : copy.tapToAdjust}
              </span>
            </button>

            <div className={cn("space-y-4", detailsOpen ? "block" : "hidden lg:block")}>
              <SplitScenarioBlock
                copy={copy}
                hasPairGroups={hasPairGroups}
                scenario={scenario}
                groups={groups}
                onScenario={applyScenario}
                settlementPreview={settlementPreview}
              />

              {splitMode === "covered_group" ? (
                <Block label={copy.whoUsedIt}>
                  <ChipScroller>
                    {groups.map((g) => (
                      <Chip
                        key={g.id}
                        selected={coveredGroupId === g.id}
                        onClick={() => setCoveredGroupId(g.id)}
                      >
                        {g.name}
                        <span className="ml-1 text-[11px] font-normal opacity-65">
                          {activeMembers.filter((m) => m.groupId === g.id).length || 1}
                        </span>
                      </Chip>
                    ))}
                  </ChipScroller>
                  <p className="mt-2 text-[12px] leading-snug text-[color:var(--color-ink-3)]">
                    {coveredMembers.length > 0
                      ? copy.coveredHint(coveredGroup?.name ?? copy.chooseGroup, coveredMembers.map((m) => m.displayName).join(", "))
                      : copy.coveredEmpty}
                  </p>
                </Block>
              ) : splitMode === "equal_people" ? (
                <Block label={copy.participants}>
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipants(new Set(activeMembers.map((m) => m.id)))}
                      className="h-8 rounded-full bg-[color:var(--color-brand-soft)] px-3 text-[12px] font-semibold text-[color:var(--color-ink)]"
                    >
                      {copy.all}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedParticipants(new Set([paidById].filter(Boolean)))}
                      className="h-8 rounded-full border border-[color:var(--color-line)] px-3 text-[12px] font-semibold text-[color:var(--color-ink-2)]"
                    >
                      {copy.onlyPayer}
                    </button>
                  </div>
                  <ChipScroller>
                    {pickerMembers.map((m) => (
                      <Chip
                        key={m.id}
                        selected={selectedParticipants.has(m.id)}
                        onClick={() => toggleParticipant(m.id)}
                      >
                        {m.displayName}
                      </Chip>
                    ))}
                  </ChipScroller>
                </Block>
              ) : splitMode === "custom" ? (
                <CustomSplitBlock
                  copy={copy}
                  pickerMembers={pickerMembers}
                  customShares={customShares}
                  customShareSum={customShareSum}
                  onApplyEven={() => setCustomShares(evenShares(pickerMembers.map((m) => m.id)))}
                  onShare={(memberId, next) =>
                    setCustomShares((current) => ({ ...current, [memberId]: next }))
                  }
                />
              ) : null}
            </div>
          </div>

          <aside
            className={cn(
              "min-w-0 space-y-3 rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-3 sm:p-4 lg:flex lg:flex-col",
              detailsOpen ? "block" : "hidden lg:block"
            )}
          >
            <PayerPickerBlock
              copy={copy}
              t={t}
              paidById={paidById}
              onPayer={setPaidById}
              paidBySections={paidBySections}
              pickerMembers={pickerMembers}
            />

            <Block label={copy.card}>
              {payerCards.length > 0 ? (
                <ChipScroller>
                  {payerCards.map((c) => (
                    <Chip key={c} selected={card === c} onClick={() => setCard(c)}>
                      {c}
                    </Chip>
                  ))}
                  <Chip selected={card === ""} onClick={() => setCard("")}>
                    {copy.cash}
                  </Chip>
                </ChipScroller>
              ) : (
                <input
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  placeholder={copy.cashOrCard}
                  className="w-full h-11 px-4 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[16px] sm:text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)]"
                />
              )}
            </Block>

            <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-[color:var(--color-ink-3)]">
                {copy.readyToSave}
              </p>
              <p className="mt-2 text-[20px] font-bold nm-num text-[color:var(--color-ink)]">
                {amountPreview}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[color:var(--color-ink-3)]">
                {description.trim() || copy.addDescription} · {payer?.displayName ?? copy.choosePayer} · {splitSummary}
              </p>
            </div>

            <div className="hidden lg:flex lg:flex-col gap-2 pt-1">
              {expense ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="h-11 px-4 text-[color:var(--color-negative)]"
                >
                  <Trash2 size={14} />
                  {copy.delete}
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !canSave}
                className="h-12 text-[14px]"
              >
                <ReceiptText size={14} />
                {saving
                  ? copy.saving
                  : isBatchQuickAdd
                    ? copy.saveExpenses(batchEntries.length)
                    : copy.saveExpense}
              </Button>
            </div>
          </aside>
        </div>

        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}

        {confirmDelete && expense ? (
          <div className="rounded-2xl border border-[color:var(--color-negative)]/25 bg-[color:var(--color-negative)]/8 p-3">
            <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">
              {copy.deleteConfirmTitle(expense.description)}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-[color:var(--color-ink-3)]">
              {copy.deleteConfirmDetail}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
                className="h-10"
              >
                {copy.cancel}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={deleteExpense}
                disabled={saving}
                className="h-10"
              >
                {copy.deleteExpense}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-1 flex items-center gap-2 border-t border-[color:var(--color-line)] bg-[color:var(--color-paper)]/95 px-4 sm:px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur-xl lg:hidden">
          {expense ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="h-12 px-4 text-[color:var(--color-negative)]"
            >
              <Trash2 size={14} />
              {copy.delete}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !canSave}
            className="flex-1 h-12 text-[14px]"
          >
            <ReceiptText size={14} />
            {saving
              ? copy.saving
              : isBatchQuickAdd
                ? copy.saveExpenses(batchEntries.length)
                : copy.saveExpense}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
