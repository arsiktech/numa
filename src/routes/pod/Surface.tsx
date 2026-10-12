/**
 * PodSurface: state-holding orchestrator for one selected pod — renders the
 * desktop dashboard, the mobile surface and every inline sheet. Extracted
 * from the former `page.tsx`; behavior unchanged.
 *
 * Load-bearing notes: the mobile dock is portaled to <body> because the route
 * surface uses `contain: layout paint`, which would otherwise resolve the
 * dock's position:fixed against the surface instead of the viewport.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  HandCoins,
  Home,
  ListChecks,
  Plus,
  ReceiptText,
  Scale,
  Settings2,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { NumaCoinLogo } from "@/components/brand/NumaCoinLogo";
import { AnimatedAmount } from "@/components/ui/AnimatedAmount";
import { QuoteTypewriter } from "@/components/features/QuoteTypewriter";

import { cn } from "@/lib/cn";
import { convertCurrency } from "@/lib/fx";
import { localizeCategoryName, useLocale } from "@/lib/i18n";
import { formatMoneyDecimal } from "@/lib/money";
import { pageEnter, revealDelay } from "@/lib/motion";
import {
  addCardTaskLabel,
  balanceStatusForRow,
  buildMemberLabelMap,
  inferSharedExpenseEmoji,
  localizedSettlementDetail,
  statusToneClass,
  template
} from "@/lib/podPageHelpers";
import { computePodSettlement } from "@/lib/podSettlement";
import {
  buildMyPodSettlementView,
  buildPartySettlementTransfers
} from "@/lib/podSettlementView";
import { getPodExpenseCategories } from "@/lib/podCategories";
import { useFxRates } from "@/services/fxSync";
import {
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  useNuma,
  usePodExpenses,
  usePodGroups,
  usePodMembers,
  usePodSettlements
} from "@/services/store";
import type { MoneyPod, PodExpense, PodSettlement } from "@/lib/types";
import {
  buildBalanceDisplayRows,
  DesktopMemberAvatar,
  DesktopBalanceAvatar,
  SharedDesktopDashboard,
  SharedPodDockButton,
} from "./DesktopDashboard";
import { CreatePotSheet } from "./CreatePotSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { HistorySheet } from "./HistorySheet";
import { PeopleSheet } from "./PeopleSheet";
import { PodSwitcher } from "./PodSwitcher";
import { EditSettlementSheet, SettleSheet } from "./SettleSheets";
import { PodDashboardBlock } from "./DesktopDashboard";

export function PodSurface({
  pod,
  switchablePods,
  onSwitch
}: {
  pod: MoneyPod;
  switchablePods: MoneyPod[];
  onSwitch: (id: string) => void;
}) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const { state } = useNuma();
  const members = usePodMembers(pod.id);
  // `members` keeps every row (including tombstoned leavers) so the settlement
  // math nets to zero and departed members' names still resolve. `activeMembers`
  // drives pickers, rosters and headcounts where a departed member shouldn't show.
  const activeMembers = useMemo(() => members.filter((m) => m.active !== false), [members]);
  const groups = usePodGroups(pod.id);
  const expenses = usePodExpenses(pod.id);
  const settlements = usePodSettlements(pod.id);
  const { rates } = useFxRates();
  const [portfolioId] = useCurrentPortfolioId();
  const allCategories = useCategories(portfolioId);
  const categories = useMemo(
    () => getPodExpenseCategories(allCategories),
    [allCategories]
  );
  const { t } = useLocale();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PodExpense | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<PodSettlement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [balanceCurrency, setBalanceCurrency] = useState<"EUR" | "USD">(
    pod.currency === "USD" ? "USD" : "EUR"
  );

  useEffect(() => {
    setBalanceCurrency(pod.currency === "USD" ? "USD" : "EUR");
  }, [pod.currency]);

  const summary = useMemo(
    () =>
      computePodSettlement(members, groups, expenses, settlements, {
        rates,
        currency: pod.currency
      }),
    [members, groups, expenses, settlements, rates, pod.currency]
  );

  const meMember = useMemo(
    () =>
      members.find((m) => m.linkedUserId === me.id) ??
      members.find(
        (m) => me.email && m.email?.trim().toLowerCase() === me.email.trim().toLowerCase()
      ) ??
      members[0],
    [members, me.email, me.id]
  );
  const headerMembers = useMemo(() => {
    if (!meMember) return activeMembers;
    return [meMember, ...activeMembers.filter((member) => member.id !== meMember.id)];
  }, [activeMembers, meMember]);
  const settlementView = buildMyPodSettlementView(summary, meMember?.id, pod.currency);
  const settlementDetail = localizedSettlementDetail(settlementView, t);
  const actionableTransfers = useMemo(() => buildPartySettlementTransfers(summary), [summary]);
  const memberLabels = useMemo(
    () => buildMemberLabelMap(members, groups),
    [members, groups]
  );
  const balanceRowsByMemberId = useMemo(
    () => new Map(summary.rows.map((row) => [row.memberId, row])),
    [summary.rows]
  );
  const balanceDisplayRows = useMemo(
    // Active members always show; a tombstoned member still appears while they
    // carry a non-zero balance, so a debt owed to/from a leaver stays visible
    // until it's settled, then their row drops out.
    () =>
      buildBalanceDisplayRows(
        members.filter(
          (m) =>
            m.active !== false ||
            Math.abs(balanceRowsByMemberId.get(m.id)?.net ?? 0) > 0.005
        ),
        groups,
        balanceRowsByMemberId,
        me
      ),
    [members, groups, balanceRowsByMemberId, me]
  );
  const usersById = useMemo(
    () => new Map(state.users.map((user) => [user.id, user])),
    [state.users]
  );
  const displayedBalanceAmount = convertCurrency(
    settlementView.amount,
    pod.currency,
    balanceCurrency,
    rates
  );
  const recentExpenses = useMemo(() => expenses.slice(0, 80), [expenses]);

  const nextBalanceCurrency = balanceCurrency === "EUR" ? "USD" : "EUR";
  const settlementAmountCopy =
    settlementView.state === "settled"
      ? "All square"
      : formatMoneyDecimal(displayedBalanceAmount, balanceCurrency);
  const settlementHeroLabel =
    settlementView.state === "settled"
      ? "All square"
      : settlementView.state === "user_owes"
        ? "You owe"
        : "You're owed";
  const setupTasks = [
    activeMembers.length < 2
      ? {
          label: "Invite someone into this pod",
          detail: "Start splitting with friends or family.",
          icon: UsersRound,
          action: () => openPeople()
        }
      : null,
    activeMembers.find((member) => !(member.cards ?? []).length)
      ? {
          label: addCardTaskLabel(
            activeMembers.find((member) => !(member.cards ?? []).length)!,
            me
          ),
          detail: "Card labels keep shared expenses easy to audit.",
          icon: CreditCard,
          action: () => openPeople(activeMembers.find((member) => !(member.cards ?? []).length)?.id)
        }
      : null,
    expenses.length === 0
      ? {
          label: "Add the first shared expense",
          detail: "This only records what happened; no money moves until you settle.",
          icon: ReceiptText,
          action: () => setExpenseOpen(true)
        }
      : null,
    actionableTransfers.length > 0 && settlements.length === 0
      ? {
          label: "Record the first settlement",
          detail: "Close the loop when someone pays back.",
          icon: HandCoins,
          action: () => setSettleOpen(true)
        }
      : null
  ].filter((task): task is {
    label: string;
    detail: string;
    icon: LucideIcon;
    action: () => void;
  } => Boolean(task));
  const firstSetupTask = setupTasks[0];

  function openPeople(memberId?: string) {
    setFocusedMemberId(memberId ?? null);
    setPeopleOpen(true);
  }

  const sharedSheetOpen =
    expenseOpen ||
    Boolean(editingExpense) ||
    settleOpen ||
    historyOpen ||
    createOpen ||
    Boolean(editingSettlement) ||
    peopleOpen;

  const sharedSheets = (
    <>
      {expenseOpen || editingExpense ? (
        <ExpenseSheet
          open={expenseOpen}
          onClose={() => {
            setExpenseOpen(false);
            setEditingExpense(null);
          }}
          pod={pod}
          expense={editingExpense}
          categories={categories}
          portfolioId={portfolioId}
        />
      ) : null}
      {settleOpen ? (
        <SettleSheet
          open={settleOpen}
          onClose={() => setSettleOpen(false)}
          pod={pod}
          transfers={actionableTransfers}
        />
      ) : null}
      {historyOpen ? (
        <HistorySheet
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          pod={pod}
          members={members}
          groups={groups}
          expenses={expenses}
          settlements={settlements}
          categories={categories}
          labelForCategory={(category) => localizeCategoryName(category.name, t)}
          onEditExpense={(expense) => {
            setHistoryOpen(false);
            setEditingExpense(expense);
            setExpenseOpen(true);
          }}
          onEditSettlement={(settlement) => {
            setHistoryOpen(false);
            setEditingSettlement(settlement);
          }}
        />
      ) : null}
      {createOpen ? (
        <CreatePotSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultCurrency={pod.currency}
          onCreated={(id) => {
            setCreateOpen(false);
            onSwitch(id);
          }}
        />
      ) : null}
      {editingSettlement ? (
        <EditSettlementSheet
          open={editingSettlement !== null}
          onClose={() => setEditingSettlement(null)}
          settlement={editingSettlement}
          members={members}
          groups={groups}
        />
      ) : null}
      {peopleOpen ? (
        <PeopleSheet
          open={peopleOpen}
          onClose={() => setPeopleOpen(false)}
          pod={pod}
          focusedMemberId={focusedMemberId}
        />
      ) : null}
    </>
  );

  if (!Number.isFinite(summary.totalExpenses) || summary.rows.some(row => !Number.isFinite(row.net))) {
    return <div role="status" className="p-6 space-y-2">
      <h1 className="text-lg font-semibold">{pod.name}</h1>
      <p>Balances and settlement suggestions are unavailable until verified exchange rates can convert every entry.</p>
      <p>Your saved expenses and payments have been retained.</p>
    </div>;
  }

  return (
    <>
      <div className="hidden lg:block">
        <SharedDesktopDashboard
          pod={pod}
          switchablePods={switchablePods}
          members={activeMembers}
          expenses={expenses}
          settlementView={settlementView}
          actionableTransfers={actionableTransfers}
          memberLabels={memberLabels}
          balanceDisplayRows={balanceDisplayRows}
          me={me}
          usersById={usersById}
          onSwitch={onSwitch}
          onAddExpense={() => setExpenseOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenPeople={(memberId) => openPeople(memberId)}
          onSettle={() => setSettleOpen(true)}
          onCreatePot={() => setCreateOpen(true)}
          onEditExpense={(expense) => {
            setEditingExpense(expense);
            setExpenseOpen(true);
          }}
        />
      </div>
    <motion.div
      {...pageEnter}
      className="mx-auto w-full max-w-[430px] space-y-3 pb-28 lg:hidden"
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="nm-eyebrow">
              {t("pod.sharedPot")} · {activeMembers.length}{" "}
              {activeMembers.length === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="flex shrink-0 items-start justify-end">
            <div
              className="flex max-w-[164px] justify-end overflow-x-auto pb-1"
              aria-label={`${activeMembers.length} members`}
            >
              {headerMembers.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => openPeople(member.id)}
                  aria-label={template(t("pod.openMember"), { name: member.displayName })}
                  className="shrink-0 rounded-full border-2 border-[color:var(--color-bg)]"
                  style={{ marginLeft: index ? -8 : 0 }}
                >
                  <DesktopMemberAvatar
                    member={member}
                    me={me}
                    usersById={usersById}
                    index={index}
                    size={34}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => openPeople()}
              aria-label={t("pod.peopleCardsAria")}
              title={t("pod.peopleCards")}
              className="ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] nm-interactive"
            >
              <UsersRound size={16} />
            </button>
          </div>
        </div>
        <div className="min-w-0">
          {switchablePods.length > 1 ? (
            <div>
              <PodSwitcher pod={pod} pods={switchablePods} onSwitch={onSwitch} />
            </div>
          ) : (
            <h1
              className="truncate text-[30px] font-bold leading-[1.08] tracking-[-0.04em] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pod.name}
            </h1>
          )}
        </div>
      </header>

      <QuoteTypewriter />

      <PodDashboardBlock slotId="balance">
        <section
          className="nm-reveal relative overflow-hidden rounded-[24px] p-5 shadow-[0_22px_52px_-30px_rgba(0,0,0,0.72)]"
          style={{
            background: "var(--color-cta)",
            color: "var(--color-cta-ink)",
            ...revealDelay(0, 60)
          }}
        >
          <NumaCoinLogo size={44} className="absolute right-4 top-4 opacity-85" />
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "color-mix(in oklab, var(--color-cta-ink) 72%, transparent)" }}
          >
            {settlementHeroLabel}
          </p>
          <button
            type="button"
            onClick={() => setBalanceCurrency(nextBalanceCurrency)}
            aria-label={template(t("pod.showBalanceIn"), { currency: nextBalanceCurrency })}
            className="nm-interactive mt-2 rounded-2xl text-left text-[clamp(34px,13vw,56px)] font-bold leading-none tracking-[-0.055em] nm-num focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--color-brand-soft)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {settlementView.state === "settled" ? (
              settlementAmountCopy
            ) : (
              <AnimatedAmount
                value={displayedBalanceAmount}
                currency={balanceCurrency}
                formatter={formatMoneyDecimal}
              />
            )}
          </button>
          <p
            className="mt-2 text-[13px] leading-snug"
            style={{ color: "color-mix(in oklab, var(--color-cta-ink) 78%, transparent)" }}
          >
            {settlementDetail}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSettleOpen(true)}
              disabled={actionableTransfers.length === 0}
              className="nm-interactive h-12 rounded-[14px] px-4 text-[14px] font-bold disabled:opacity-45"
              style={{
                background: "var(--color-cta-ink)",
                color: "var(--color-cta)"
              }}
            >
              {t("pod.settle")}
            </button>
            <button
              type="button"
              onClick={() => setExpenseOpen(true)}
              className="nm-interactive h-12 rounded-[14px] border px-4 text-[14px] font-bold"
              style={{
                borderColor: "color-mix(in oklab, var(--color-cta-ink) 38%, transparent)",
                color: "var(--color-cta-ink)"
              }}
            >
              {t("pod.addExpense")}
            </button>
          </div>
        </section>
      </PodDashboardBlock>

      <section className="space-y-2" aria-label="Balances">
        {balanceDisplayRows.slice(0, 5).map((row, index) => {
          const status = balanceStatusForRow(row, pod.currency);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => openPeople(row.kind === "member" ? row.memberIds[0] : undefined)}
              className="nm-interactive flex w-full items-center gap-3 rounded-[16px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-3 text-left shadow-[var(--shadow-sm)]"
              aria-label={row.kind === "group" ? row.label : template(t("pod.openMember"), { name: row.label })}
            >
              <DesktopBalanceAvatar row={row} me={me} usersById={usersById} index={index} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[color:var(--color-ink)]">
                  {row.label}
                </span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
                  {row.caption}
                </span>
              </span>
              <span className={cn("shrink-0 text-right text-[14px] font-bold tabular-nums", statusToneClass(status.tone))}>
                {status.label}
              </span>
            </button>
          );
        })}
      </section>

      <section className="rounded-[20px] bg-[color:var(--color-bg)] px-1">
        <header className="flex items-end justify-between pb-1 pt-1">
          <h2
            className="text-[20px] font-bold tracking-[-0.025em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("pod.recent")}
          </h2>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]"
          >
            {t("pod.allHistory")}
          </button>
        </header>
        {expenses.length === 0 ? (
          <div className="rounded-[16px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 py-5 text-[13px] text-[color:var(--color-ink-3)] shadow-[var(--shadow-sm)]">
            {t("pod.noExpenses")}
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--color-line)]">
            {recentExpenses.slice(0, 5).map((expense) => {
              const payer = members.find((m) => m.id === expense.paidByMemberId);
              const payerLabel =
                memberLabels.get(expense.paidByMemberId) ?? payer?.displayName ?? t("pod.someone");
              const participants = expense.participantMemberIds.length
                ? expense.participantMemberIds
                : members.map((member) => member.id);
              const splitCopy =
                participants.length === members.length
                  ? `÷${Math.max(1, participants.length)}`
                  : `${participants.length}/${Math.max(1, members.length)}`;
              return (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExpense(expense);
                      setExpenseOpen(true);
                    }}
                    className="nm-interactive flex w-full items-center gap-3 py-3 text-left"
                    aria-label={template(t("pod.editExpense"), { name: expense.description })}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[color:var(--color-brand-mist)] text-[18px]">
                      {inferSharedExpenseEmoji(expense.description)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-[color:var(--color-ink)]">
                        {expense.description}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[color:var(--color-ink-3)]">
                        {payerLabel} paid{expense.paidByCard ? ` · ${expense.paidByCard}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-bold tabular-nums text-[color:var(--color-ink)]">
                        {formatMoneyDecimal(expense.amount, expense.currency)}
                      </span>
                      <span className="mt-0.5 inline-flex rounded-full bg-[color:var(--color-brand-mist)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[color:var(--color-ink-2)]">
                        {splitCopy}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {firstSetupTask ? (() => {
        const SetupIcon = firstSetupTask.icon;
        return (
          <button
            type="button"
            onClick={firstSetupTask.action}
            className="nm-interactive flex w-full items-center gap-3 rounded-[18px] border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-3 text-left text-[13px] text-[color:var(--color-ink-2)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-[color:var(--color-positive-mist)] text-[color:var(--color-positive)]">
              <SetupIcon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-[color:var(--color-ink)]">
                {firstSetupTask.label}
              </span>
              <span className="block truncate text-[12px] text-[color:var(--color-ink-3)]">
                {firstSetupTask.detail}
              </span>
            </span>
          </button>
        );
      })() : null}

      {/* Portaled to <body>: the route surface uses `contain: layout paint`,
          which would otherwise make this dock's position:fixed resolve
          against the surface instead of the viewport (wrong rect, can end up
          below the fold). */}
      {sharedSheetOpen ? null : createPortal(
        <nav
          aria-label="Shared pod actions"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-[0_-18px_50px_-34px_rgba(0,0,0,0.65)]"
        >
          <a
            href="/"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-10 focus:rounded-xl focus:bg-[color:var(--color-paper)] focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold"
          >
            Pot
          </a>
          <a
            href="/settings"
            className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-2 focus:z-10 focus:rounded-xl focus:bg-[color:var(--color-paper)] focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold"
          >
            Settings
          </a>
          <div className="grid grid-cols-[1fr_1fr_72px_1fr_1fr] items-end gap-1 max-w-md mx-auto">
            <SharedPodDockButton
              icon={Home}
              label="Pot"
              active
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            />
            <SharedPodDockButton
              icon={ListChecks}
              label="Activity"
              onClick={() => setHistoryOpen(true)}
            />
            <button
              type="button"
              onClick={() => setExpenseOpen(true)}
              aria-label={t("pod.addExpense")}
              className="nm-interactive mx-auto mb-1 grid h-16 w-16 place-items-center rounded-[22px] bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-lg)] active:scale-95"
            >
              <Plus size={28} strokeWidth={2.2} />
            </button>
            <SharedPodDockButton
              icon={Scale}
              label="Settle"
              onClick={() => setSettleOpen(true)}
            />
            <SharedPodDockButton
              icon={Settings2}
              label={t("settings.eyebrow")}
              ariaLabel={t("settings.eyebrow")}
              onClick={() => navigate("/settings")}
            />
          </div>
        </nav>,
        document.body
      )}

    </motion.div>
    {sharedSheets}
    </>
  );
}
