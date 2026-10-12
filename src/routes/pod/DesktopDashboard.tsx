import { balanceStatusForRow } from "@/lib/podPageHelpers";
export type PodDashboardBlockId = "balance" | "settlements" | "categories" | "recent" | "people";
/**
 * Desktop (lg+) two-column dashboard for a shared pod, plus the rail buttons,
 * avatars and dock pieces it shares with the mobile surface. Extracted from
 * the former `page.tsx`.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  HandCoins,
  Home,
  ListChecks,
  Plus,
  Scale,
  Settings2,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { NumaCoinLogo } from "@/components/brand/NumaCoinLogo";
import { AnimatedAmount } from "@/components/ui/AnimatedAmount";
import { cn } from "@/lib/cn";
import { formatMoneyDecimal } from "@/lib/money";
import { revealDelay } from "@/lib/motion";
import { splitPodRailName } from "@/lib/podRailName";
import {
  inferSharedExpenseEmoji,
  initialsFor,
  memberDisplayName,
  settlementTransferKey,
  template
} from "@/lib/podPageHelpers";
import { useLocale } from "@/lib/i18n";
import {
  buildMyPodSettlementView,
  buildPartySettlementTransfers
} from "@/lib/podSettlementView";
import type { PodBalanceRow } from "@/lib/podSettlement";
import type {
  MoneyPod,
  PodExpense,
  PodGroup,
  PodMember,
  User
} from "@/lib/types";
import { PodSwitcher } from "./PodSwitcher";

/**
 * Display row shown in the balances lists: either one member or an entire
 * (group) of members with their summed balance.
 */
export type PodBalanceDisplayRow = PodBalanceRow & {
  id: string;
  label: string;
  caption: string;
  memberIds: string[];
  color?: string;
  kind: "group" | "member";
  member?: PodMember;
};

export function SharedDesktopDashboard({
  pod,
  switchablePods,
  members,
  expenses,
  settlementView,
  actionableTransfers,
  memberLabels,
  balanceDisplayRows,
  me,
  usersById,
  onSwitch,
  onAddExpense,
  onOpenHistory,
  onOpenPeople,
  onSettle,
  onCreatePot,
  onEditExpense
}: {
  pod: MoneyPod;
  switchablePods: MoneyPod[];
  members: PodMember[];
  expenses: PodExpense[];
  settlementView: ReturnType<typeof buildMyPodSettlementView>;
  actionableTransfers: ReturnType<typeof buildPartySettlementTransfers>;
  memberLabels: Map<string, string>;
  balanceDisplayRows: PodBalanceDisplayRow[];
  me: User;
  usersById: Map<string, User>;
  onSwitch: (id: string) => void;
  onAddExpense: () => void;
  onOpenHistory: () => void;
  onOpenPeople: (memberId?: string) => void;
  onSettle: () => void;
  onCreatePot: () => void;
  onEditExpense: (expense: PodExpense) => void;
}) {
  const { t } = useLocale();
  const heroLabel =
    settlementView.state === "settled"
      ? "all square"
      : settlementView.state === "user_owes"
        ? "you owe"
        : "you're owed";
  const heroAmount =
    settlementView.state === "settled"
      ? formatMoneyDecimal(0, pod.currency)
      : formatMoneyDecimal(settlementView.amount, pod.currency);
  const heroDetail =
    settlementView.state === "settled"
      ? "No transfers needed right now."
      : `${actionableTransfers.length || 1} transfer${actionableTransfers.length === 1 ? "" : "s"} clear the pot · settled to ${new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date())}`;
  const railAmount =
    settlementView.state === "user_owes" ? -settlementView.amount : settlementView.amount;
  const visibleMembers = members.slice(0, 5);
  const activityRows = expenses.slice(0, 5);
  const railName = splitPodRailName(pod.name);

  return (
    <div className="grid min-h-[100dvh] w-full bg-[color:var(--color-bg)] text-[color:var(--color-ink)] lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 py-6">
        <div className="flex items-center gap-3 px-2 pb-[22px]">
          <NumaCoinLogo size={34} />
          <div className="min-w-0">
            <p
              className="truncate text-[20px] font-bold leading-none tracking-[-0.04em] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Numa Pro
            </p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
              shared pot
            </p>
          </div>
        </div>

        <div className="mb-[18px]">
          {switchablePods.length > 1 ? (
            <PodSwitcher pod={pod} pods={switchablePods} onSwitch={onSwitch} />
          ) : (
            <div className="rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-3 py-3 shadow-[var(--shadow-sm)]">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)]">
                  <HandCoins size={17} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  {railName.context ? (
                    <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
                      {railName.context}
                    </span>
                  ) : null}
                  <span
                    className="mt-1 block overflow-hidden break-words py-px text-[14.5px] font-bold leading-[1.28] tracking-[-0.01em] text-[color:var(--color-ink)]"
                    style={{
                      display: "-webkit-box",
                      fontFamily: "var(--font-display)",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2
                    }}
                    title={pod.name}
                  >
                    {railName.label}
                  </span>
                  <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
                    {members.length} people · {pod.currency}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1" aria-label="Shared pot">
          <Link
            to="/"
            viewTransition
            className="nm-interactive flex h-11 items-center gap-3 rounded-[11px] bg-[color:var(--color-cta)] px-3 text-[14px] font-semibold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          >
            <Home size={18} strokeWidth={1.95} />
            Pot
          </Link>
          <SharedRailButton icon={ListChecks} label="Activity" onClick={onOpenHistory} />
          <SharedRailButton icon={Scale} label="Settle" onClick={onSettle} />
          <SharedRailButton icon={UsersRound} label="People" onClick={() => onOpenPeople()} />
          <Link
            to="/settings"
            viewTransition
            className="nm-interactive flex h-11 items-center gap-3 rounded-[11px] px-3 text-[14px] font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-glass)]"
          >
            <Settings2 size={18} strokeWidth={1.8} />
            Settings
          </Link>
        </nav>

        <div
          className="nm-reveal mt-auto rounded-[15px] bg-[color:var(--color-cta)] p-4 text-[color:var(--color-cta-ink)]"
          style={revealDelay(1, 60)}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
            {railAmount < -0.005 ? "you owe" : railAmount > 0.005 ? "you're owed" : "all square"}
          </p>
          <p
            className="mt-1 text-[26px] font-bold tracking-[-0.045em] nm-num"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <AnimatedAmount
              value={Math.abs(railAmount)}
              currency={pod.currency}
              formatter={formatMoneyDecimal}
            />
          </p>
        </div>
      </aside>

      <div className="flex min-h-0 flex-col overflow-hidden px-[30px] py-[26px]">
        <header className="mb-[22px] flex items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
              shared pot · {new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date())}
            </p>
            <h1
              className="mt-1.5 truncate text-[30px] font-bold leading-[1.08] tracking-[-0.04em] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {pod.name}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex" aria-label={`${members.length} members`}>
              {visibleMembers.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onOpenPeople(member.id)}
                  aria-label={template(t("pod.openMember"), { name: member.displayName })}
                  className="rounded-full border-2 border-[color:var(--color-bg)]"
                  style={{ marginLeft: index ? -10 : 0 }}
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
              onClick={onCreatePot}
              aria-label={t("pod.createSharedPot")}
              className="nm-interactive grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)] shadow-[var(--shadow-sm)]"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={onAddExpense}
              className="nm-interactive inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--color-cta)] px-[18px] text-[14px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
            >
              <Plus size={16} strokeWidth={2.4} />
              Add split
            </button>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <div
            className="nm-reveal rounded-[20px] bg-[color:var(--color-cta)] p-[26px] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-md)]"
            style={revealDelay(0, 60)}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">
              {heroLabel}
            </p>
            <p
              className="mt-2 text-[64px] font-bold leading-none tracking-[-0.065em] nm-num"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {settlementView.state === "settled" ? (
                heroAmount
              ) : (
                <AnimatedAmount
                  value={settlementView.amount}
                  currency={pod.currency}
                  formatter={formatMoneyDecimal}
                />
              )}
            </p>
            <p
              className="mt-2.5 text-[13.5px]"
              style={{ color: "color-mix(in oklab, var(--color-cta-ink) 80%, transparent)" }}
            >
              {heroDetail}
            </p>
            <button
              type="button"
              onClick={onSettle}
              disabled={actionableTransfers.length === 0}
              className="nm-interactive mt-[18px] h-11 rounded-xl bg-[color:var(--color-cta-ink)] px-5 text-[14px] font-bold text-[color:var(--color-cta)] disabled:opacity-45"
            >
              Settle up →
            </button>
          </div>

          <div className="rounded-[20px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-[22px] shadow-[var(--shadow-sm)]">
            <h2
              className="text-[17px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Balances
            </h2>
            <div className="mt-3.5 flex flex-col gap-3">
              {balanceDisplayRows.slice(0, 5).map((row, index) => {
                const status = balanceStatusForRow(row, pod.currency);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onOpenPeople(row.kind === "member" ? row.memberIds[0] : undefined)}
                    className="nm-interactive flex items-center gap-3 rounded-xl p-1.5 text-left hover:bg-[color:var(--color-bg)]"
                  >
                    <DesktopBalanceAvatar row={row} me={me} usersById={usersById} index={index} size={36} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[color:var(--color-ink)]">
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "text-[14.5px] font-bold tabular-nums",
                        status.tone === "brand"
                          ? "text-[color:var(--color-positive)]"
                          : status.tone === "info"
                            ? "text-[color:var(--color-negative)]"
                            : "text-[color:var(--color-positive)]"
                      )}
                    >
                      {status.tone === "brand"
                        ? `gets back ${formatMoneyDecimal(status.amount, pod.currency)}`
                        : status.tone === "info"
                          ? `owes ${formatMoneyDecimal(status.amount, pod.currency)}`
                          : "square"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-4">
          <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            fewest transfers to settle
          </p>
          <div className="grid grid-cols-2 gap-3">
            {actionableTransfers.length ? (
              actionableTransfers.slice(0, 2).map((transfer) => (
                <button
                  key={settlementTransferKey(transfer)}
                  type="button"
                  onClick={onSettle}
                  className="nm-interactive flex items-center gap-3 rounded-[14px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 text-left shadow-[var(--shadow-sm)]"
                >
                  <DesktopInitialAvatar label={transfer.fromName} index={1} size={34} />
                  <ArrowRightGlyph />
                  <DesktopInitialAvatar label={transfer.toName} index={0} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[color:var(--color-ink-3)]">
                      {transfer.fromName} → {transfer.toName}
                    </span>
                    <span
                      className="mt-0.5 block text-[18px] font-bold tracking-[-0.025em] text-[color:var(--color-ink)] nm-num"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {formatMoneyDecimal(transfer.amount, pod.currency)}
                    </span>
                  </span>
                  <span className="rounded-[10px] bg-[color:var(--color-cta)] px-3.5 py-2 text-[12.5px] font-semibold text-[color:var(--color-cta-ink)]">
                    Mark settled
                  </span>
                </button>
              ))
            ) : (
              <div className="col-span-2 rounded-[14px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 text-[13px] text-[color:var(--color-ink-3)]">
                Everyone is square. Add a split when shared money moves again.
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-[22px] py-[18px] shadow-[var(--shadow-sm)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              className="text-[17px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Activity
            </h2>
            <button
              type="button"
              onClick={onOpenHistory}
              className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]"
            >
              who paid · which card · split
            </button>
          </div>
          <div className="mt-1 divide-y divide-[color:var(--color-line)]">
            {activityRows.length ? (
              activityRows.map((expense, index) => {
                const payerName = memberLabels.get(expense.paidByMemberId) ?? t("pod.someone");
                const participants = expense.participantMemberIds.length
                  ? expense.participantMemberIds
                  : members.map((member) => member.id);
                const splitLabel =
                  participants.length === members.length
                    ? `÷${Math.max(1, participants.length)}`
                    : `${participants.length}/${Math.max(1, members.length)}`;
                return (
                  <button
                    key={expense.id}
                    type="button"
                    onClick={() => onEditExpense(expense)}
                    className="nm-interactive nm-reveal grid w-full grid-cols-[36px_minmax(0,1.4fr)_minmax(110px,1fr)_minmax(110px,1fr)_auto_auto] items-center gap-3.5 py-3 text-left text-[13.5px]"
                    style={revealDelay(Math.min(index, 8), 50)}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-brand-mist)] text-[17px]">
                      {inferSharedExpenseEmoji(expense.description)}
                    </span>
                    <span className="truncate font-medium text-[color:var(--color-ink)]">
                      {expense.description}
                    </span>
                    <span className="truncate text-[color:var(--color-ink-3)]">
                      paid by <b className="font-semibold text-[color:var(--color-ink)]">{payerName}</b>
                    </span>
                    <span className="truncate font-mono text-[12px] text-[color:var(--color-ink-3)]">
                      {expense.paidByCard || "No card"}
                    </span>
                    <span className="rounded-full bg-[color:var(--color-brand-mist)] px-2.5 py-1 font-mono text-[10px] font-semibold text-[color:var(--color-ink-2)]">
                      {splitLabel}
                    </span>
                    <span className="w-[80px] text-right font-bold tabular-nums text-[color:var(--color-ink)]">
                      {formatMoneyDecimal(expense.amount, expense.currency)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-[13px] text-[color:var(--color-ink-3)]">
                Add the first shared expense to see who paid, which card, and how it splits.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function SharedRailButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "nm-interactive flex h-11 items-center gap-3 rounded-[11px] px-3 text-[14px] font-medium",
        active
          ? "bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-glass)]"
      )}
    >
      <Icon size={18} strokeWidth={active ? 1.95 : 1.75} />
      {label}
    </button>
  );
}

export function DesktopMemberAvatar({
  member,
  me,
  usersById,
  index,
  size
}: {
  member: PodMember;
  me: User;
  usersById: Map<string, User>;
  index: number;
  size: number;
}) {
  const avatarSrc =
    usersById.get(member.linkedUserId ?? "")?.avatarUrl ??
    (member.linkedUserId === me.id ? me.avatarUrl : undefined);
  if (avatarSrc) {
    return <Avatar name={member.displayName} src={avatarSrc} size={size} />;
  }
  return (
    <DesktopInitialAvatar label={member.displayName} index={index} size={size} />
  );
}

export function DesktopBalanceAvatar({
  row,
  me,
  usersById,
  index,
  size
}: {
  row: PodBalanceDisplayRow;
  me: User;
  usersById: Map<string, User>;
  index: number;
  size: number;
}) {
  if (row.kind === "member" && row.member) {
    return (
      <DesktopMemberAvatar
        member={row.member}
        me={me}
        usersById={usersById}
        index={index}
        size={size}
      />
    );
  }
  return (
    <DesktopInitialAvatar
      label={row.label}
      index={index}
      size={size}
      color={row.color}
    />
  );
}

export function DesktopInitialAvatar({
  label,
  index,
  size,
  color
}: {
  label: string;
  index: number;
  size: number;
  color?: string;
}) {
  const colors = ["var(--color-cta-ink)", "var(--color-accent-1)", "var(--color-accent-2)", "var(--color-accent-3)", "var(--color-accent-4)"];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-[color:var(--color-cta)]"
      style={{
        width: size,
        height: size,
        background: color ?? colors[index % colors.length],
        fontSize: Math.max(11, size * 0.36)
      }}
      aria-hidden
    >
      {initialsFor(label)}
    </span>
  );
}

export function ArrowRightGlyph() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
      <path
        d="M1 7H19M14 2L20 7L14 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[color:var(--color-ink-3)]"
      />
    </svg>
  );
}

export function PodDashboardBlock({
  children,
  slotId,
  className
}: {
  children: ReactNode;
  slotId?: PodDashboardBlockId;
  className?: string;
}) {
  return (
    <div
      data-pod-dashboard-slot={slotId}
      className={cn("min-w-0 rounded-[28px] [&>section]:h-full", className)}
    >
      {children}
    </div>
  );
}

export function SharedPodDockButton({
  icon: Icon,
  label,
  ariaLabel,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  ariaLabel?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "nm-interactive flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[11.5px] font-semibold tracking-[-0.005em] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
        active
          ? "text-[color:var(--color-ink)]"
          : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-2xl transition-all",
          active
            ? "bg-[color:var(--color-brand-mist)] text-[color:var(--color-brand-strong)] shadow-[var(--shadow-sm)]"
            : "text-[color:var(--color-ink-3)]"
        )}
      >
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function buildBalanceDisplayRows(
  members: PodMember[],
  groups: PodGroup[],
  balanceRowsByMemberId: Map<string, PodBalanceRow>,
  me: User
): PodBalanceDisplayRow[] {
  const memberRow = (member: PodMember): PodBalanceDisplayRow => {
    const row = balanceRowsByMemberId.get(member.id);
    return {
      ...zeroBalanceRow(member.id, member.displayName),
      ...row,
      id: member.id,
      label: memberDisplayName(member, me),
      caption: member.role,
      memberIds: [member.id],
      kind: "member",
      member
    };
  };

  const groupsWithMembers = groups
    .map((group) => ({
      group,
      members: members.filter((member) => member.groupId === group.id)
    }))
    .filter(({ members: groupMembers }) => groupMembers.length > 0);

  if (groupsWithMembers.length === 0) {
    return members.map(memberRow);
  }

  const groupedRows = groupsWithMembers.map(({ group, members: groupMembers }) => {
    const row = groupMembers.reduce(
      (total, member) => sumBalanceRows(total, balanceRowsByMemberId.get(member.id)),
      zeroBalanceRow(group.id, group.name)
    );
    return {
      ...row,
      id: group.id,
      label: group.name,
      caption: `${groupMembers.length} ${groupMembers.length === 1 ? "member" : "members"}`,
      memberIds: groupMembers.map((member) => member.id),
      color: group.color,
      kind: "group" as const
    };
  });

  const ungroupedRows = members
    .filter((member) => !member.groupId || !groups.some((group) => group.id === member.groupId))
    .map(memberRow);

  return [...groupedRows, ...ungroupedRows];
}

export function zeroBalanceRow(memberId: string, displayName: string): PodBalanceRow {
  return {
    memberId,
    displayName,
    paid: 0,
    share: 0,
    settledOut: 0,
    settledIn: 0,
    net: 0
  };
}

export function sumBalanceRows(total: PodBalanceRow, row: PodBalanceRow | undefined): PodBalanceRow {
  if (!row) return total;
  return {
    ...total,
    paid: total.paid + row.paid,
    share: total.share + row.share,
    settledOut: total.settledOut + row.settledOut,
    settledIn: total.settledIn + row.settledIn,
    net: total.net + row.net
  };
}

