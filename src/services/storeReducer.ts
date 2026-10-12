import { newId } from "@/lib/ids";
import { goalScope, migrateGoalShape } from "@/lib/goals";
import type {
  Asset,
  Category,
  CryptoWallet,
  Holding,
  HoldingEvent,
  Liability,
  MarketQuote,
  Membership,
  NetWorthGoal,
  MoneyPod,
  NumaState,
  PodExpense,
  PodGroup,
  PodMember,
  PodSettlement,
  Portfolio,
  RecurrenceCadence,
  RecurringTransaction,
  Settlement,
  Transaction,
  WealthSnapshot
} from "@/lib/types";

/**
 * The local-first reducer that backs StoreProvider: pure state transitions for
 * every domain action (add/update/delete across portfolios, transactions,
 * budgets, shared pods, ...). Extracted from store.tsx so the provider file
 * owns subscription plumbing while this file owns state math.
 */

export function detectLocale(): "en" | "ru" | "es" {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  // Match the browser's PRIMARY language (en included) rather than the first
  // ru/es anywhere in the list — see detectAppLocale in lib/i18n.ts.
  for (const lang of languages) {
    const code = lang.toLowerCase().slice(0, 2);
    if (code === "en" || code === "ru" || code === "es") return code;
  }
  return "en";
}

/** Advance a timestamp by one cadence step. */
export function nextRunAfter(ts: number, cadence: RecurrenceCadence): number {
  const d = new Date(ts);
  switch (cadence) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.getTime();
}

export function applyDelta(assets: Asset[], accountId: string | undefined, delta: number) {
  if (!accountId || delta === 0) return assets;
  return assets.map((asset) =>
    asset.id === accountId
      ? {
          ...asset,
          balance: asset.balance + delta,
          updatedAt: Date.now()
        }
      : asset
  );
}

export type Action =
  | { type: "hydrate"; state: NumaState }
  | { type: "setActivePortfolio"; portfolioId: string }
  | { type: "addTransaction"; tx: Transaction }
  | { type: "updateTransaction"; id: string; patch: Partial<Transaction> }
  | { type: "deleteTransaction"; id: string }
  | { type: "addCategory"; category: Category }
  | { type: "updateCategory"; id: string; patch: Partial<Category> }
  | { type: "deleteCategory"; id: string }
  | { type: "addPortfolio"; portfolio: Portfolio }
  | { type: "deletePortfolio"; id: string }
  | { type: "addHolding"; holding: Holding }
  | { type: "updateHolding"; id: string; patch: Partial<Holding> }
  | { type: "deleteHolding"; id: string }
  | { type: "addHoldingEvent"; event: HoldingEvent }
  | { type: "addCryptoWallet"; wallet: CryptoWallet }
  | { type: "updateCryptoWallet"; id: string; patch: Partial<CryptoWallet> }
  | { type: "deleteCryptoWallet"; id: string }
  | { type: "updateUser"; id: string; patch: Partial<NumaState["users"][number]> }
  | { type: "addAsset"; asset: Asset }
  | { type: "updateAsset"; id: string; patch: Partial<Asset> }
  | { type: "deleteAsset"; id: string }
  | { type: "addLiability"; liability: Liability }
  | { type: "updateLiability"; id: string; patch: Partial<Liability> }
  | { type: "deleteLiability"; id: string }
  | { type: "addSnapshot"; snapshot: WealthSnapshot }
  | { type: "addSettlement"; settlement: Settlement }
  | { type: "deleteSettlement"; id: string }
  | { type: "addMoneyPod"; pod: MoneyPod; members?: PodMember[]; groups?: PodGroup[] }
  | { type: "updateMoneyPod"; id: string; patch: Partial<MoneyPod> }
  | { type: "deleteMoneyPod"; id: string }
  | { type: "addPodMember"; member: PodMember }
  | { type: "updatePodMember"; id: string; patch: Partial<PodMember> }
  | { type: "deletePodMember"; id: string }
  | { type: "addPodGroup"; group: PodGroup }
  | { type: "updatePodGroup"; id: string; patch: Partial<PodGroup> }
  | { type: "deletePodGroup"; id: string }
  | { type: "addPodExpense"; expense: PodExpense }
  | { type: "updatePodExpense"; id: string; patch: Partial<PodExpense> }
  | { type: "deletePodExpense"; id: string }
  | { type: "addPodSettlement"; settlement: PodSettlement }
  | { type: "updatePodSettlement"; id: string; patch: Partial<PodSettlement> }
  | { type: "deletePodSettlement"; id: string }
  | { type: "addMembership"; membership: Membership; userToCreate?: { id: string; displayName: string; email?: string } }
  | { type: "updateMembership"; id: string; patch: Partial<Membership> }
  | { type: "removeMembership"; id: string }
  | { type: "addRecurring"; recurring: RecurringTransaction }
  | { type: "updateRecurring"; id: string; patch: Partial<RecurringTransaction> }
  | { type: "deleteRecurring"; id: string }
  | { type: "setGoal"; goal: NetWorthGoal }
  | { type: "deleteGoal"; id: string }
  | {
      type: "materializeRecurring";
      now: number;
      createdByUserId: string;
    }
  | { type: "patchMarketQuotes"; quotes: MarketQuote[] };

export function reducer(state: NumaState, action: Action): NumaState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "setActivePortfolio": {
      return { ...state, activePortfolioId: action.portfolioId };
    }
    case "addTransaction": {
      const tx = action.tx;
      const delta = tx.kind === "income" ? tx.amount : -tx.amount;
      return {
        ...state,
        transactions: [tx, ...state.transactions],
        assets: applyDelta(state.assets, tx.accountId, delta)
      };
    }
    case "updateTransaction": {
      const before = state.transactions.find((t) => t.id === action.id);
      if (!before) return state;
      const after: Transaction = { ...before, ...action.patch };
      const beforeDelta = before.kind === "income" ? before.amount : -before.amount;
      const afterDelta = after.kind === "income" ? after.amount : -after.amount;
      let assets = applyDelta(state.assets, before.accountId, -beforeDelta);
      assets = applyDelta(assets, after.accountId, afterDelta);
      return {
        ...state,
        transactions: state.transactions.map((t) => (t.id === action.id ? after : t)),
        assets
      };
    }
    case "deleteTransaction": {
      const before = state.transactions.find((t) => t.id === action.id);
      if (!before) return state;
      const delta = before.kind === "income" ? -before.amount : before.amount;
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
        assets: applyDelta(state.assets, before.accountId, delta)
      };
    }
    case "addCategory":
      return { ...state, categories: [...state.categories, action.category] };
    case "updateCategory":
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c
        )
      };
    case "deleteCategory":
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        transactions: state.transactions.map((t) =>
          t.categoryId === action.id ? { ...t, categoryId: undefined } : t
        ),
        goals: state.goals.filter((g) => g.categoryId !== action.id)
      };
    case "addPortfolio":
      return {
        ...state,
        portfolios: [...state.portfolios, action.portfolio],
        activePortfolioId: action.portfolio.id,
        memberships: [
          ...state.memberships,
          {
            id: newId("mb"),
            portfolioId: action.portfolio.id,
            userId: state.currentUserId,
            ownershipBps: 10000,
            role: "owner",
            displayName:
              state.users.find((u) => u.id === state.currentUserId)?.displayName ?? "You",
            joinedAt: Date.now()
          }
        ]
      };
    case "deletePortfolio": {
      if (state.portfolios.length <= 1) return state; // never delete the last one
      const remaining = state.portfolios.filter((p) => p.id !== action.id);
      const nextActive =
        state.activePortfolioId === action.id
          ? remaining[0]!.id
          : state.activePortfolioId;
      return {
        ...state,
        portfolios: remaining,
        activePortfolioId: nextActive,
        memberships: state.memberships.filter((m) => m.portfolioId !== action.id),
        categories: state.categories.filter((c) => c.portfolioId !== action.id),
        transactions: state.transactions.filter((t) => t.portfolioId !== action.id),
        holdings: state.holdings.filter((h) => h.portfolioId !== action.id),
        cryptoWallets: state.cryptoWallets.filter((wallet) => wallet.portfolioId !== action.id),
        assets: state.assets.filter((a) => a.portfolioId !== action.id),
        liabilities: state.liabilities.filter((l) => l.portfolioId !== action.id),
        snapshots: state.snapshots.filter((s) => s.portfolioId !== action.id),
        settlements: state.settlements.filter((s) => s.portfolioId !== action.id)
      };
    }
    case "addHolding":
      return { ...state, holdings: [...state.holdings, action.holding] };
    case "updateHolding":
      return {
        ...state,
        holdings: state.holdings.map((h) =>
          h.id === action.id ? { ...h, ...action.patch } : h
        )
      };
    case "deleteHolding":
      return {
        ...state,
        holdings: state.holdings.filter((h) => h.id !== action.id),
        holdingEvents: state.holdingEvents.filter((e) => e.holdingId !== action.id),
        goals: state.goals.filter((g) => g.holdingId !== action.id)
      };
    case "addHoldingEvent":
      return { ...state, holdingEvents: [...state.holdingEvents, action.event] };
    case "addCryptoWallet":
      return { ...state, cryptoWallets: [...state.cryptoWallets, action.wallet] };
    case "updateCryptoWallet":
      return {
        ...state,
        cryptoWallets: state.cryptoWallets.map((wallet) =>
          wallet.id === action.id
            ? { ...wallet, ...action.patch, updatedAt: Date.now() }
            : wallet
        )
      };
    case "deleteCryptoWallet":
      return {
        ...state,
        cryptoWallets: state.cryptoWallets.filter((wallet) => wallet.id !== action.id)
      };
    case "updateUser":
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u))
      };
    case "addAsset":
      return { ...state, assets: [...state.assets, action.asset] };
    case "updateAsset":
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.id ? { ...a, ...action.patch, updatedAt: Date.now() } : a
        )
      };
    case "deleteAsset":
      return {
        ...state,
        assets: state.assets.filter((a) => a.id !== action.id),
        transactions: state.transactions.map((t) =>
          t.accountId === action.id ? { ...t, accountId: undefined } : t
        ),
        goals: state.goals.filter((g) => g.assetId !== action.id)
      };
    case "addLiability":
      return { ...state, liabilities: [...state.liabilities, action.liability] };
    case "updateLiability":
      return {
        ...state,
        liabilities: state.liabilities.map((l) =>
          l.id === action.id ? { ...l, ...action.patch, updatedAt: Date.now() } : l
        )
      };
    case "deleteLiability":
      return { ...state, liabilities: state.liabilities.filter((l) => l.id !== action.id) };
    case "addSnapshot":
      return { ...state, snapshots: [...state.snapshots, action.snapshot] };
    case "addSettlement":
      return { ...state, settlements: [...state.settlements, action.settlement] };
    case "deleteSettlement":
      return { ...state, settlements: state.settlements.filter((s) => s.id !== action.id) };
    case "addMoneyPod":
      return {
        ...state,
        moneyPods: [...state.moneyPods, action.pod],
        podMembers: [...state.podMembers, ...(action.members ?? [])],
        podGroups: [...state.podGroups, ...(action.groups ?? [])]
      };
    case "updateMoneyPod":
      return {
        ...state,
        moneyPods: state.moneyPods.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p))
      };
    case "deleteMoneyPod":
      return {
        ...state,
        moneyPods: state.moneyPods.filter((p) => p.id !== action.id),
        podMembers: state.podMembers.filter((m) => m.podId !== action.id),
        podGroups: state.podGroups.filter((g) => g.podId !== action.id),
        podExpenses: state.podExpenses.filter((e) => e.podId !== action.id),
        podSettlements: state.podSettlements.filter((s) => s.podId !== action.id)
      };
    case "addPodMember":
      return { ...state, podMembers: [...state.podMembers, action.member] };
    case "updatePodMember":
      return {
        ...state,
        podMembers: state.podMembers.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m))
      };
    case "deletePodMember":
      return {
        ...state,
        podMembers: state.podMembers.filter((m) => m.id !== action.id),
        podExpenses: state.podExpenses.map((e) => ({
          ...e,
          participantMemberIds: e.participantMemberIds.filter((id) => id !== action.id),
          customSplits: e.customSplits?.filter((s) => s.memberId !== action.id)
        })),
        podSettlements: state.podSettlements.filter(
          (s) => s.fromMemberId !== action.id && s.toMemberId !== action.id
        )
      };
    case "addPodGroup":
      return { ...state, podGroups: [...state.podGroups, action.group] };
    case "updatePodGroup":
      return {
        ...state,
        podGroups: state.podGroups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g))
      };
    case "deletePodGroup":
      return {
        ...state,
        podGroups: state.podGroups.filter((g) => g.id !== action.id),
        podMembers: state.podMembers.map((m) =>
          m.groupId === action.id ? { ...m, groupId: undefined } : m
        ),
        podExpenses: state.podExpenses.map((e) =>
          e.coveredGroupId === action.id
            ? { ...e, coveredGroupId: undefined, splitMode: "equal_people" }
            : e
        )
      };
    case "addPodExpense":
      return { ...state, podExpenses: [action.expense, ...state.podExpenses] };
    case "updatePodExpense":
      return {
        ...state,
        podExpenses: state.podExpenses.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e
        )
      };
    case "deletePodExpense":
      return { ...state, podExpenses: state.podExpenses.filter((e) => e.id !== action.id) };
    case "addPodSettlement":
      return { ...state, podSettlements: [action.settlement, ...state.podSettlements] };
    case "updatePodSettlement":
      return {
        ...state,
        podSettlements: state.podSettlements.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s
        )
      };
    case "deletePodSettlement":
      return {
        ...state,
        podSettlements: state.podSettlements.filter((s) => s.id !== action.id)
      };
    case "addMembership": {
      const users = action.userToCreate
        ? [
            ...state.users,
            {
              id: action.userToCreate.id,
              displayName: action.userToCreate.displayName,
              email: action.userToCreate.email,
              defaultCurrency: "EUR" as const,
              theme: "auto" as const,
              locale: detectLocale()
            }
          ]
        : state.users;
      return {
        ...state,
        users,
        memberships: [...state.memberships, action.membership]
      };
    }
    case "updateMembership":
      return {
        ...state,
        memberships: state.memberships.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m
        )
      };
    case "removeMembership":
      return {
        ...state,
        memberships: state.memberships.filter((m) => m.id !== action.id)
      };
    case "addRecurring":
      return { ...state, recurring: [...state.recurring, action.recurring] };
    case "updateRecurring":
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r
        )
      };
    case "deleteRecurring":
      return { ...state, recurring: state.recurring.filter((r) => r.id !== action.id) };
    case "setGoal": {
      const goal = migrateGoalShape(action.goal);
      const shouldDedupeScope = goalScope(goal) === "net_worth" || goalScope(goal) === "monthly_income";
      const others =
        shouldDedupeScope
          ? state.goals.filter(
              (g) => g.portfolioId !== goal.portfolioId || goalScope(g) !== goalScope(goal)
            )
          : state.goals.filter((g) => g.id !== goal.id);
      return { ...state, goals: [...others, goal] };
    }
    case "deleteGoal":
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "materializeRecurring": {
      // For every active recurring whose nextRunAt is in the past, emit transactions for
      // each missed occurrence up to `now`, then update its nextRunAt.
      const newTxs: Transaction[] = [];
      let assets = state.assets;
      const updated = state.recurring.map((r) => {
        if (!r.active) return r;
        if (r.endAt && r.endAt < r.nextRunAt) return r;
        let nextRunAt = r.nextRunAt;
        // Safety cap: never emit more than 60 missed runs in one tick.
        for (let i = 0; i < 60 && nextRunAt <= action.now; i++) {
          if (r.endAt && nextRunAt > r.endAt) break;
          const tx: Transaction = {
            id: newId("tx"),
            portfolioId: r.portfolioId,
            occurredAt: nextRunAt,
            description: r.description,
            categoryId: r.categoryId,
            accountId: r.accountId,
            kind: r.kind,
            amount: r.amount,
            currency: r.currency,
            createdByUserId: action.createdByUserId,
            notes: r.notes
          };
          newTxs.push(tx);
          const delta = r.kind === "income" ? r.amount : -r.amount;
          assets = applyDelta(assets, r.accountId, delta);
          nextRunAt = nextRunAfter(nextRunAt, r.cadence);
        }
        return { ...r, nextRunAt };
      });
      if (newTxs.length === 0) return state;
      return {
        ...state,
        transactions: [...newTxs, ...state.transactions],
        recurring: updated,
        assets
      };
    }
    case "patchMarketQuotes": {
      const next = { ...state.marketQuotes };
      for (const quote of action.quotes) next[quote.symbol] = quote;
      return { ...state, marketQuotes: next };
    }
    default:
      return state;
  }
}

