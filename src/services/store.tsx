import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from "react";
import { newId } from "@/lib/ids";
import { migrateGoalShape } from "@/lib/goals";
import { getPushPermission, showLocalNotification } from "@/lib/push";
import type {
  CurrencyCode,
  NumaState,
} from "@/lib/types";

import { userStateKey } from "@/lib/auth";
import { useAuth } from "./auth";
import { useCloudState } from "./cloudStore";
import { detectLocale, reducer, type Action } from "./storeReducer";
export { nextRunAfter } from "./storeReducer";

const STORAGE_KEY = "numa:state:v2.2";

const STARTER_CATEGORIES: Array<{
  name: string;
  kind: "income" | "expense";
  icon: string;
  color: string;
}> = [
  { name: "Groceries", kind: "expense", icon: "shopping-basket", color: "mint" },
  { name: "Dining", kind: "expense", icon: "utensils", color: "peach" },
  { name: "Transport", kind: "expense", icon: "car", color: "sand" },
  { name: "Rent", kind: "expense", icon: "home", color: "lavender" },
  { name: "Utilities", kind: "expense", icon: "zap", color: "sky" },
  { name: "Subscriptions", kind: "expense", icon: "repeat", color: "blush" },
  { name: "Salary", kind: "income", icon: "briefcase", color: "mint" },
  { name: "Freelance", kind: "income", icon: "sparkles", color: "lavender" }
];

function emptyStateForOwner(
  displayName: string,
  currency: CurrencyCode,
  ownerUserId?: string,
  email?: string | null,
  avatarUrl?: string
): NumaState {
  const userId = ownerUserId ?? newId("user");
  const portfolioId = newId("pf");
  const now = Date.now();
  return {
    users: [
      {
        id: userId,
        displayName,
        email: email ?? undefined,
        avatarUrl,
        defaultCurrency: currency,
        theme: "auto",
        locale: detectLocale()
      }
    ],
    currentUserId: userId,
    activePortfolioId: portfolioId,
    portfolios: [
      {
        id: portfolioId,
        name: "Personal",
        type: "personal",
        tagline: "Just you",
        ownerId: userId,
        defaultCurrency: currency,
        createdAt: now
      }
    ],
    memberships: [
      {
        id: newId("mb"),
        portfolioId,
        userId,
        ownershipBps: 10000,
        role: "owner",
        displayName,
        joinedAt: now
      }
    ],
    categories: STARTER_CATEGORIES.map((category, index) => ({
      id: newId("cat"),
      portfolioId,
      ...category,
      sortOrder: index
    })),
    transactions: [],
    holdings: [],
    holdingEvents: [],
    cryptoWallets: [],
    assets: [
      {
        id: newId("as"),
        portfolioId,
        name: "Cash",
        kind: "cash",
        balance: 0,
        currency,
        notes: "Starter account — every transaction debits/credits its balance",
        updatedAt: now
      }
    ],
    liabilities: [],
    snapshots: [],
    settlements: [],
    moneyPods: [],
    podMembers: [],
    podGroups: [],
    podExpenses: [],
    podSettlements: [],
    recurring: [],
    goals: [],
    marketQuotes: {}
  };
}

interface StoreContext {
  state: NumaState;
  dispatch: React.Dispatch<Action>;
}

const Ctx = createContext<StoreContext | null>(null);

function loadInitial(
  storageKey: string,
  fallback: NumaState,
  allowProductStorage: boolean
): NumaState {
  if (!allowProductStorage) return fallback;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      // Try migrating from the previous storage version on the same account slot.
      const legacy = window.localStorage.getItem(storageKey.replace("v2.2", "v2.1"));
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<NumaState>;
        return migrate(parsed, fallback);
      }
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<NumaState>;
    return migrate(parsed, fallback);
  } catch {
    return fallback;
  }
}

function migrate(parsed: Partial<NumaState>, fallback: NumaState): NumaState {
  if (!parsed.portfolios || !parsed.users) return fallback;
  const next: NumaState = {
    ...fallback,
    ...parsed,
    users: parsed.users ?? fallback.users,
    portfolios: parsed.portfolios ?? fallback.portfolios,
    memberships: parsed.memberships ?? [],
    categories: parsed.categories ?? [],
    transactions: parsed.transactions ?? [],
    holdings: parsed.holdings ?? [],
    holdingEvents: parsed.holdingEvents ?? [],
    cryptoWallets: parsed.cryptoWallets ?? [],
    assets: parsed.assets ?? [],
    liabilities: parsed.liabilities ?? [],
    snapshots: parsed.snapshots ?? [],
    settlements: parsed.settlements ?? [],
    moneyPods: parsed.moneyPods ?? [],
    podMembers: parsed.podMembers ?? [],
    podGroups: parsed.podGroups ?? [],
    podExpenses: parsed.podExpenses ?? [],
    podSettlements: parsed.podSettlements ?? [],
    recurring: parsed.recurring ?? [],
    goals: (parsed.goals ?? []).map((g) => migrateGoalShape(g)),
    marketQuotes: parsed.marketQuotes ?? {},
    currentUserId: parsed.currentUserId ?? fallback.currentUserId,
    activePortfolioId:
      parsed.activePortfolioId ?? parsed.portfolios?.[0]?.id ?? fallback.activePortfolioId
  };
  return next;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { currentAccount } = useAuth();
  const accountId = currentAccount?.id ?? "anonymous";
  const allowProductStorage = !currentAccount?.isCloud;
  const storageKey = currentAccount ? userStateKey(currentAccount.id) : STORAGE_KEY;
  const fallback = useMemo(
    () =>
      emptyStateForOwner(
        currentAccount?.displayName ?? "You",
        currentAccount?.defaultCurrency ?? "EUR",
        currentAccount?.id,
        currentAccount?.email,
        currentAccount?.avatarUrl
      ),
    [
      currentAccount?.avatarUrl,
      currentAccount?.displayName,
      currentAccount?.defaultCurrency,
      currentAccount?.email,
      currentAccount?.id
    ]
  );
  const [state, dispatch] = useReducer(reducer, accountId, () =>
    loadInitial(storageKey, fallback, allowProductStorage)
  );

  useEffect(() => {
    // when account changes, rehydrate state from that account's storage slot
    const next = loadInitial(storageKey, fallback, allowProductStorage);
    dispatch({ type: "hydrate", state: next });
  }, [accountId, storageKey, fallback, allowProductStorage]);

  useEffect(() => {
    if (!allowProductStorage) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore quota */
    }
  }, [state, storageKey, allowProductStorage]);

  // Snapshot the state synchronously for the tick — useReducer returns the
  // most recent state on every render, but inside setInterval we'd capture
  // a stale closure. A ref kept in sync sidesteps that.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Materialize recurring transactions on every boot + once an hour. As a
  // side effect, fire a local browser notification for each recurring row
  // that is about to be emitted — proves the SW plumbing end-to-end without
  // needing the server-side fanout.
  useEffect(() => {
    if (!currentAccount) return;
    function tick() {
      const now = Date.now();
      const snapshot = stateRef.current;
      // Notify for every recurring row whose nextRunAt is overdue. Cap the
      // count to a small number so a long-stale install doesn't spam the
      // user with a flood of notifications on first boot.
      if (getPushPermission() === "granted") {
        const due = snapshot.recurring
          .filter((r) => r.active && r.nextRunAt <= now && (!r.endAt || r.nextRunAt <= r.endAt))
          .slice(0, 5);
        for (const r of due) {
          const sign = r.kind === "income" ? "+" : "";
          const currencySymbol = r.currency === "USD" ? "$" : "€";
          const amount = `${currencySymbol}${r.amount.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
          })}`;
          showLocalNotification(
            "Recurring fired",
            `${r.description} (${sign}${amount})`
          ).catch(() => {
            /* swallow — local push is best-effort */
          });
        }
      }
      dispatch({
        type: "materializeRecurring",
        now,
        createdByUserId: currentAccount!.id
      });
    }
    tick();
    const interval = window.setInterval(tick, 1000 * 60 * 60);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------- selector glue

Nearly every list hook below is the same shape: "cloud slice if present, else
local rows filtered to this portfolio/pod, optionally sorted". One helper keeps
them honest; the module-level comparators/filters stay referentially stable so
useMemo caching behaves exactly like the hand-written versions did.
*/

const portfolioOf = (x: { portfolioId: string }) => x.portfolioId;
const podOf = (x: { podId: string }) => x.podId;
const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;
const byOccurredAtDesc = (a: { occurredAt: number }, b: { occurredAt: number }) => b.occurredAt - a.occurredAt;
const byCreatedAtAsc = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;
const byTakenAtAsc = (a: { takenAt: number }, b: { takenAt: number }) => a.takenAt - b.takenAt;
const byNextRunAtAsc = (a: { nextRunAt: number }, b: { nextRunAt: number }) => a.nextRunAt - b.nextRunAt;

function useScopedList<T extends { portfolioId?: string; podId?: string }>(
  cloudList: T[] | undefined,
  localList: T[],
  filterOf: (item: T) => string | undefined,
  id: string,
  sort?: (a: T, b: T) => number
) {
  return useMemo(() => {
    const src = cloudList ?? localList.filter((item) => filterOf(item) === id);
    return sort ? [...src].sort(sort) : src;
  }, [cloudList, localList, id, sort, filterOf]);
}

export function useNuma() {
  const ctx = useContext(Ctx);
  // Cloud bridge is OPTIONAL. The default CloudCtx value has bridge=() => false,
  // so local mode just falls through to the local reducer every time.
  const cloud = useCloudState();
  if (!ctx) throw new Error("useNuma must be used inside <StoreProvider>");
  const { state, dispatch: baseDispatch } = ctx;
  const { bridge } = cloud;

  const wrappedDispatch = useCallback(
    (action: Parameters<typeof baseDispatch>[0]) => {
      const handled = bridge(
        action as { type: string } & Record<string, unknown>,
        state
      );
      if (handled) return;
      baseDispatch(action);
    },
    [baseDispatch, bridge, state]
  );

  return { state, dispatch: wrappedDispatch };
}

export function useCurrentUser() {
  const { state } = useNuma();
  return state.users.find((u) => u.id === state.currentUserId)!;
}

export function usePortfolios() {
  const { state } = useNuma();
  const cloud = useCloudState();
  // Cloud-backed accounts must NOT see the local in-memory seed next to their
  // cloud rows — emptyStateForOwner seeds a "Personal" for every account, and
  // concatenating both rendered a phantom duplicate in Settings. The seed only
  // belongs on screen while cloud is disabled (local mode) or still empty
  // (first paint before the subscription arrives).
  return useMemo(
    () =>
      cloud.enabled && cloud.portfolios.length > 0
        ? cloud.portfolios
        : [...cloud.portfolios, ...state.portfolios],
    [cloud.enabled, cloud.portfolios, state.portfolios]
  );
}

export function usePortfolio(portfolioId: string | undefined) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return (
    cloud.portfolios.find((p) => p.id === portfolioId) ??
    state.portfolios.find((p) => p.id === portfolioId) ??
    cloud.portfolios[0] ??
    state.portfolios[0]!
  );
}

export function useMemberships(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.memberships, state.memberships, portfolioOf, portfolioId);
}

export function useCategories(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.categories, state.categories, portfolioOf, portfolioId, bySortOrder);
}

export function useTransactions(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.transactions, state.transactions, portfolioOf, portfolioId, byOccurredAtDesc);
}

export function useHoldings(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.holdings, state.holdings, portfolioOf, portfolioId);
}

export function useHoldingEvents(portfolioId: string, holdingId?: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  const cloudHoldingEvents = cloud.byPortfolio[portfolioId]?.holdingEvents;
  return useMemo(() => {
    const src = cloudHoldingEvents ?? state.holdingEvents.filter((e) => e.portfolioId === portfolioId);
    return src
      .filter((e) => e.portfolioId === portfolioId && (!holdingId || e.holdingId === holdingId))
      .sort((a, b) => b.occurredAt - a.occurredAt);
  }, [cloudHoldingEvents, holdingId, portfolioId, state.holdingEvents]);
}

export function useCryptoWallets(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.cryptoWallets, state.cryptoWallets, portfolioOf, portfolioId, byCreatedAtAsc);
}

export function useAssets(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.assets, state.assets, portfolioOf, portfolioId);
}

export function useLiabilities(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.liabilities, state.liabilities, portfolioOf, portfolioId);
}

export function useSnapshots(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.snapshots, state.snapshots, portfolioOf, portfolioId, byTakenAtAsc);
}

export function useMoneyPods() {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useMemo(() => {
    const cloudIds = new Set(cloud.moneyPods.map((p) => p.id));
    return [...cloud.moneyPods, ...state.moneyPods.filter((p) => !cloudIds.has(p.id))].sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }, [cloud.moneyPods, state.moneyPods]);
}

export function usePodMembers(podId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPod[podId]?.members, state.podMembers, podOf, podId);
}

export function usePodGroups(podId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPod[podId]?.groups, state.podGroups, podOf, podId);
}

export function usePodExpenses(podId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPod[podId]?.expenses, state.podExpenses, podOf, podId, byOccurredAtDesc);
}

export function usePodSettlements(podId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPod[podId]?.settlements, state.podSettlements, podOf, podId, byOccurredAtDesc);
}

export function useRecurring(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.recurring, state.recurring, portfolioOf, portfolioId, byNextRunAtAsc);
}

export function useGoals(portfolioId: string) {
  const { state } = useNuma();
  const cloud = useCloudState();
  return useScopedList(cloud.byPortfolio[portfolioId]?.goals, state.goals, portfolioOf, portfolioId, byCreatedAtAsc);
}

export function useMarketQuotes() {
  const { state } = useNuma();
  return state.marketQuotes;
}

export function useCurrentPortfolioId() {
  const { state, dispatch } = useNuma();
  const cloud = useCloudState();
  // Mirrors usePortfolios: hide the local seed once cloud rows exist.
  const portfolios = useMemo(
    () =>
      cloud.enabled && cloud.portfolios.length > 0
        ? cloud.portfolios
        : [...cloud.portfolios, ...state.portfolios],
    [cloud.enabled, cloud.portfolios, state.portfolios]
  );
  const cloudActive = cloud.portfolios.some((portfolio) => portfolio.id === state.activePortfolioId);
  const activeExists = portfolios.some((portfolio) => portfolio.id === state.activePortfolioId);
  const id =
    cloud.enabled && cloud.portfolios.length > 0
      ? cloudActive
        ? state.activePortfolioId
        : cloud.portfolios[0]!.id
      : activeExists
        ? state.activePortfolioId
        : portfolios[0]?.id ?? state.portfolios[0]!.id;
  const setId = useCallback(
    (next: string) => {
      dispatch({ type: "setActivePortfolio", portfolioId: next });
    },
    [dispatch]
  );
  return [id, setId] as const;
}
