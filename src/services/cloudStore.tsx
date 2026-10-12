import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useLocation } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  mapAsset,
  mapCategory,
  mapCryptoWallet,
  mapGoal,
  mapHolding,
  mapHoldingEvent,
  mapLiability,
  mapMembership,
  mapPodExpense,
  mapPodGroup,
  mapPodMember,
  mapPodSettlement,
  mapRecurring,
  mapSettlement,
  mapSnapshot,
  mapTransaction
} from "./cloudMappers";
import type {
  Asset,
  Category,
  CryptoWallet,
  Holding,
  HoldingEvent,
  Liability,
  Membership,
  MoneyPod,
  NetWorthGoal,
  NumaState,
  PodExpense,
  PodGroup,
  PodMember,
  PodSettlement,
  Portfolio,
  RecurringTransaction,
  Settlement,
  Transaction,
  WealthSnapshot
} from "@/lib/types";
import {
  listenForActiveMoneyPodChange,
  readActiveMoneyPodId
} from "@/lib/activeMoneyPod";
import { useAppMode } from "@/lib/appMode";
import {
  readCloudSnapshotCache,
  writeCloudSnapshotCache
} from "@/lib/cloudSnapshotCache";
import {
  cloudSnapshotScopeForAccount,
  shouldShowCloudLoading
} from "@/lib/cloudStartup";
import { AUTH_SESSION_TRANSITION_EVENT, convex, useAuth } from "./auth";

/**
 * Cloud-data sync layer.
 *
 * Mirrors every cloud portfolio (and its memberships / transactions / categories
 * / assets / liabilities / settlements) into a React context. The existing local
 * store hooks merge in cloud data on top. Mutations on cloud-backed portfolios
 * are intercepted and routed to Convex; Convex's reactive queries then push
 * fresh data back through this provider.
 *
 * When cloud is disabled, this context stays empty and no queries run.
 */

export interface CloudPortfolioData {
  portfolio: Portfolio;
  memberships: Membership[];
  categories: Category[];
  transactions: Transaction[];
  holdings: Holding[];
  holdingEvents: HoldingEvent[];
  cryptoWallets: CryptoWallet[];
  assets: Asset[];
  liabilities: Liability[];
  snapshots: WealthSnapshot[];
  settlements: Settlement[];
  recurring: RecurringTransaction[];
  goals: NetWorthGoal[];
}

export interface CloudPodData {
  pod: MoneyPod;
  members: PodMember[];
  groups: PodGroup[];
  expenses: PodExpense[];
  settlements: PodSettlement[];
}

export interface CloudState {
  enabled: boolean;
  authTransitioning?: boolean;
  loading: boolean;
  portfolios: Portfolio[];
  byPortfolio: Record<string, CloudPortfolioData>;
  moneyPods: MoneyPod[];
  byPod: Record<string, CloudPodData>;
  pendingInvites: Array<{
    inviteId: string;
    portfolioName: string;
    portfolioId: string;
    invitedByUserId: string;
    ownershipBps: number;
    role: "editor" | "viewer";
    displayName: string;
  }>;
  /**
   * Legacy hook retained so the local store can keep the same wrapper shape.
   * Product writes now go through typed actions instead of reducer interception.
   */
  bridge: (
    action: { type: string } & Record<string, unknown>,
    state: import("@/lib/types").NumaState
  ) => boolean;
}

const empty: CloudState = {
  enabled: false,
  loading: false,
  portfolios: [],
  byPortfolio: {},
  moneyPods: [],
  byPod: {},
  pendingInvites: [],
  bridge: () => false
};

function pruneRecordByKeys<T>(record: Record<string, T>, allowedKeys: Set<string>) {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowedKeys.has(key)) {
      next[key] = value;
    } else {
      changed = true;
    }
  }
  return changed ? next : record;
}

const CloudCtx = createContext<CloudState>(empty);
const cloudCacheDeployment =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() || "unknown-convex";

/** True when cloud auth + Convex client are available in this env. */
export const cloudAvailable = !!convex;

/**
 * Wraps the app's authenticated section. When cloud mode is on and a user is
 * signed in, fetches lightweight portfolio/pod lists first, then only the
 * detail payloads needed by the current route/app mode.
 */
export function CloudDataProvider({ children }: { children: ReactNode }) {
  if (!cloudAvailable) {
    return <CloudCtx.Provider value={empty}>{children}</CloudCtx.Provider>;
  }
  return <CloudDataProviderInner>{children}</CloudDataProviderInner>;
}

function CloudDataProviderInner({ children }: { children: ReactNode }) {
  // Don't fire any Convex queries until the user is actually authenticated
  // — unauthenticated users and the brief loading window after sign-in must
  // not hit `portfolios:listMine` or it throws "Called by client".
  const { isAuthenticated } = useConvexAuth();
  const { currentAccount } = useAuth();
  const [appMode] = useAppMode();
  const location = useLocation();
  const profileLoading = currentAccount?.id === "cloud-loading";
  const isPodSurface =
    location.pathname === "/pod" ||
    (location.pathname === "/" && appMode === "shared");
  const fetchPodDetails = isPodSurface;
  const fetchPortfolioDetails =
    location.pathname === "/money" ||
    location.pathname === "/buckets" ||
    location.pathname === "/wealth" ||
    location.pathname === "/numa" ||
    location.pathname === "/goals" ||
    location.pathname === "/insights" ||
    location.pathname === "/shared" ||
    location.pathname === "/settings" ||
    (location.pathname === "/" &&
      appMode !== "shared" &&
      !profileLoading);
  const portfoliosRaw = useQuery(
    api.portfolios.listMine,
    isAuthenticated ? {} : "skip"
  );
  const podsRaw = useQuery(api.moneyPods.listMine, isAuthenticated ? {} : "skip");
  const pendingInvitesRaw = useQuery(
    api.memberships.listPendingInvitesFor,
    isAuthenticated ? {} : "skip"
  );
  const [byPortfolio, setByPortfolio] = useState<Record<string, CloudPortfolioData>>({});
  const [byPod, setByPod] = useState<Record<string, CloudPodData>>({});
  const [cachedMoneyPods, setCachedMoneyPods] = useState<MoneyPod[]>([]);
  const [activePodId, setActivePodId] = useState<string | null>(() =>
    readActiveMoneyPodId()
  );
  const [authTransitioning, setAuthTransitioning] = useState(false);
  const cloudCacheScope = useMemo(
    () => cloudSnapshotScopeForAccount(cloudCacheDeployment, currentAccount),
    [currentAccount]
  );

  useEffect(() => {
    function handleAuthTransition(event: Event) {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      setAuthTransitioning(state === "leaving");
    }
    window.addEventListener(AUTH_SESSION_TRANSITION_EVENT, handleAuthTransition);
    return () => window.removeEventListener(AUTH_SESSION_TRANSITION_EVENT, handleAuthTransition);
  }, []);

  useEffect(() => {
    if (currentAccount?.id && currentAccount.id !== "cloud-loading") {
      setAuthTransitioning(false);
    }
  }, [currentAccount?.id]);

  useEffect(() => {
    return listenForActiveMoneyPodChange(setActivePodId);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || (profileLoading && !cloudCacheScope)) {
      setByPortfolio({});
      setByPod({});
      setCachedMoneyPods([]);
    }
  }, [cloudCacheScope, currentAccount?.id, isAuthenticated, profileLoading]);

  useEffect(() => {
    if (!isAuthenticated || !cloudCacheScope) return;
    const cached = readCloudSnapshotCache(cloudCacheScope);
    if (!cached) return;
    setCachedMoneyPods(cached.moneyPods);
    setByPod(cached.byPod as Record<string, CloudPodData>);
  }, [cloudCacheScope, isAuthenticated]);

  // Auto-redeem any matching invites once we have a profile loaded. The
  // mutation is idempotent — calling it twice is safe.
  const redeem = useMutation(api.memberships.redeemInvitesForMe);
  const materializeRecurring = useMutation(api.recurring.materializeForPortfolio);
  useEffect(() => {
    if (!pendingInvitesRaw || pendingInvitesRaw.length === 0) return;
    // Don't auto-redeem — leave it as an explicit user choice so the banner
    // can stay informative. (Auto-redemption would clear it before the user
    // sees what they accepted.)
    void redeem;
  }, [pendingInvitesRaw, redeem]);

  const portfolios = useMemo<Portfolio[]>(() => {
    if (!portfoliosRaw) return [];
    return portfoliosRaw.map((row) => ({
      id: String(row.portfolio._id),
      name: row.portfolio.name,
      type: row.portfolio.type,
      spaceKind: row.portfolio.spaceKind,
      tagline: row.portfolio.tagline,
      ownerId: String(row.portfolio.ownerId),
      defaultCurrency: row.portfolio.defaultCurrency,
      createdAt: row.portfolio.createdAt
    }));
  }, [portfoliosRaw]);

  useEffect(() => {
    if (!portfoliosRaw) return;
    const ids = new Set(portfolios.map((portfolio) => portfolio.id));
    setByPortfolio((prev) => pruneRecordByKeys(prev, ids));
  }, [portfolios, portfoliosRaw]);

  useEffect(() => {
    if (!isAuthenticated || !fetchPortfolioDetails || portfolios.length === 0) return;
    function tick() {
      const now = Date.now();
      for (const portfolio of portfolios) {
        materializeRecurring({
          portfolioId: portfolio.id as unknown as Id<"portfolios">,
          now
        }).catch(() => {
          /* Viewer-only memberships cannot materialize rules; ignore. */
        });
      }
    }
    tick();
    const interval = window.setInterval(tick, 1000 * 60 * 60);
    return () => window.clearInterval(interval);
  }, [fetchPortfolioDetails, isAuthenticated, materializeRecurring, portfolios]);

  const pendingInvites = useMemo<CloudState["pendingInvites"]>(() => {
    if (!pendingInvitesRaw) return [];
    return pendingInvitesRaw.map((row) => ({
      inviteId: String(row.invite._id),
      portfolioName: row.portfolio?.name ?? "a portfolio",
      portfolioId: String(row.invite.portfolioId),
      invitedByUserId: String(row.invite.invitedByUserId),
      ownershipBps: row.invite.ownershipBps,
      role: row.invite.role,
      displayName: row.invite.displayName
    }));
  }, [pendingInvitesRaw]);

  const moneyPods = useMemo<MoneyPod[]>(() => {
    if (podsRaw === undefined) return cachedMoneyPods;
    return podsRaw.map((pod) => ({
      id: String(pod._id),
      name: pod.name,
      currency: pod.currency,
      ownerUserId: String(pod.ownerUserId),
      createdAt: pod.createdAt
    }));
  }, [cachedMoneyPods, podsRaw]);

  useEffect(() => {
    if (!podsRaw) return;
    const ids = new Set(moneyPods.map((pod) => pod.id));
    setByPod((prev) => pruneRecordByKeys(prev, ids));
  }, [moneyPods, podsRaw]);

  useEffect(() => {
    if (!cloudCacheScope || podsRaw === undefined) return;
    if (Object.keys(byPod).length === 0) return;
    const timeout = window.setTimeout(() => {
      writeCloudSnapshotCache(cloudCacheScope, {
        moneyPods,
        byPod
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [byPod, cloudCacheScope, moneyPods, podsRaw]);
  const activePod = useMemo(() => {
    if (!fetchPodDetails || moneyPods.length === 0) return null;
    return moneyPods.find((pod) => pod.id === activePodId) ?? moneyPods[0] ?? null;
  }, [activePodId, fetchPodDetails, moneyPods]);

  const bridge = useCallback(() => false, []);

  const cachedPodDataCount = Object.keys(byPod).length;
  const value = useMemo<CloudState>(
    () => ({
      enabled: true,
      authTransitioning,
      loading: shouldShowCloudLoading({
        isPodSurface,
        portfoliosReady: portfoliosRaw !== undefined,
        podsReady: podsRaw !== undefined,
        cachedPodCount: moneyPods.length,
        cachedPodDataCount
      }),
      portfolios,
      byPortfolio,
      moneyPods,
      byPod,
      pendingInvites,
      bridge
    }),
    [
      authTransitioning,
      cachedPodDataCount,
      isPodSurface,
      portfoliosRaw,
      podsRaw,
      portfolios,
      byPortfolio,
      moneyPods,
      byPod,
      pendingInvites,
      bridge
    ]
  );

  return (
    <CloudCtx.Provider value={value}>
      {fetchPodDetails
        ? activePod && podsRaw !== undefined ? (
            <PodFetcher
              key={activePod.id}
              pod={activePod}
              onData={(data) =>
                setByPod((prev) => ({
                  ...prev,
                  [activePod.id]: data
                }))
              }
            />
          ) : null
        : null}
      {fetchPortfolioDetails
        ? portfolios.map((p) => (
            <PortfolioFetcher
              key={p.id}
              portfolio={p}
              onData={(data) =>
                setByPortfolio((prev) => ({
                  ...prev,
                  [p.id]: data
                }))
              }
            />
          ))
        : null}
      {children}
    </CloudCtx.Provider>
  );
}

export function useCloudPortfolioData(
  portfolio: Portfolio | null | undefined,
  enabled = true
): CloudPortfolioData | undefined {
  const shouldFetch = cloudAvailable && enabled && !!portfolio;
  const args = shouldFetch
    ? { portfolioId: portfolio.id as unknown as Id<"portfolios"> }
    : "skip";
  const memberships = useQuery(api.memberships.listForPortfolio, args);
  const categories = useQuery(api.categories.listForPortfolio, args);
  const transactions = useQuery(api.transactions.listForPortfolio, args);
  const holdings = useQuery(api.holdings.listForPortfolio, args);
  const holdingEvents = useQuery(api.holdings.listEventsForPortfolio, args);
  const cryptoWallets = useQuery(api.cryptoWallets.listForPortfolio, args);
  const assets = useQuery(api.assets.listForPortfolio, args);
  const liabilities = useQuery(api.liabilities.listForPortfolio, args);
  const snapshots = useQuery(api.wealthSnapshots.listForPortfolio, args);
  const settlements = useQuery(api.settlements.listForPortfolio, args);
  const recurring = useQuery(api.recurring.listForPortfolio, args);
  const goals = useQuery(api.goals.listForPortfolio, args);

  const ready =
    shouldFetch &&
    memberships !== undefined &&
    categories !== undefined &&
    transactions !== undefined &&
    holdings !== undefined &&
    holdingEvents !== undefined &&
    cryptoWallets !== undefined &&
    assets !== undefined &&
    liabilities !== undefined &&
    snapshots !== undefined &&
    settlements !== undefined &&
    recurring !== undefined &&
    goals !== undefined;

  return useMemo(() => {
    if (!ready || !portfolio) return undefined;
    return {
      portfolio,
      memberships: (memberships ?? []).map(mapMembership),
      categories: (categories ?? []).map((c) => mapCategory(c, portfolio.id)),
      transactions: (transactions ?? []).map((t) => mapTransaction(t, portfolio.id)),
      holdings: (holdings ?? []).map((h) => mapHolding(h, portfolio.id)),
      holdingEvents: (holdingEvents ?? []).map((h) => mapHoldingEvent(h, portfolio.id)),
      cryptoWallets: (cryptoWallets ?? []).map((wallet) =>
        mapCryptoWallet(wallet, portfolio.id)
      ),
      assets: (assets ?? []).map((a) => mapAsset(a, portfolio.id)),
      liabilities: (liabilities ?? []).map((l) => mapLiability(l, portfolio.id)),
      snapshots: (snapshots ?? []).map((s) => mapSnapshot(s, portfolio.id)),
      settlements: (settlements ?? []).map((s) => mapSettlement(s, portfolio.id)),
      recurring: (recurring ?? []).map((r) => mapRecurring(r, portfolio.id)),
      goals: (goals ?? []).map((g) => mapGoal(g, portfolio.id))
    };
  }, [
    ready,
    portfolio,
    memberships,
    categories,
    transactions,
    holdings,
    holdingEvents,
    cryptoWallets,
    assets,
    liabilities,
    snapshots,
    settlements,
    recurring,
    goals
  ]);
}

export function useCloudPodData(
  pod: MoneyPod | null | undefined,
  enabled = true
): CloudPodData | undefined {
  const shouldFetch = cloudAvailable && enabled && !!pod;
  const bundle = useQuery(
    api.moneyPods.getBundle,
    shouldFetch ? { podId: pod.id as unknown as Id<"moneyPods"> } : "skip"
  );

  return useMemo(() => {
    if (!shouldFetch || !pod || bundle === undefined) return undefined;
    return {
      pod,
      members: bundle.members.map(mapPodMember),
      groups: bundle.groups.map(mapPodGroup),
      expenses: bundle.expenses.map(mapPodExpense),
      settlements: bundle.settlements.map(mapPodSettlement)
    };
  }, [bundle, pod, shouldFetch]);
}

/** A tiny hidden component per portfolio that pulls its child entities. */
function PortfolioFetcher({
  portfolio,
  onData
}: {
  portfolio: Portfolio;
  onData: (data: CloudPortfolioData) => void;
}) {
  const data = useCloudPortfolioData(portfolio);
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    if (!data) return;
    onDataRef.current(data);
  }, [data]);

  return null;
}

function PodFetcher({
  pod,
  onData
}: {
  pod: MoneyPod;
  onData: (data: CloudPodData) => void;
}) {
  const data = useCloudPodData(pod);
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    if (!data) return;
    onDataRef.current(data);
  }, [data]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Mappers — Convex docs → local-typed entities                        */
/* ------------------------------------------------------------------ */

export function useCloudState(): CloudState {
  return useContext(CloudCtx);
}

/** Set of cloud portfolio ids — used by the store to know what's cloud-backed. */
export function isCloudId(state: CloudState, portfolioId: string): boolean {
  return state.portfolios.some((p) => p.id === portfolioId);
}

/** Convex mutation hooks bundled for typed client actions and the write queue. */
export function useCloudMutations() {
  return {
    createPortfolio: useMutation(api.portfolios.create),
    updatePortfolio: useMutation(api.portfolios.update),
    removePortfolio: useMutation(api.portfolios.remove),
    inviteByEmail: useMutation(api.memberships.inviteByEmail),
    updateMembership: useMutation(api.memberships.updateMembership),
    removeMembership: useMutation(api.memberships.removeMembership),
    redeemInvites: useMutation(api.memberships.redeemInvitesForMe),
    addCategory: useMutation(api.categories.add),
    updateCategory: useMutation(api.categories.update),
    removeCategory: useMutation(api.categories.remove),
    addTransaction: useMutation(api.transactions.add),
    updateTransaction: useMutation(api.transactions.update),
    removeTransaction: useMutation(api.transactions.remove),
    addHolding: useMutation(api.holdings.add),
    updateHolding: useMutation(api.holdings.update),
    removeHolding: useMutation(api.holdings.remove),
    addHoldingEvent: useMutation(api.holdings.addEvent),
    addCryptoWallet: useMutation(api.cryptoWallets.add),
    updateCryptoWallet: useMutation(api.cryptoWallets.update),
    removeCryptoWallet: useMutation(api.cryptoWallets.remove),
    addAsset: useMutation(api.assets.add),
    updateAsset: useMutation(api.assets.update),
    adjustAssetBalance: useMutation(api.assets.adjustBalance),
    removeAsset: useMutation(api.assets.remove),
    addLiability: useMutation(api.liabilities.add),
    updateLiability: useMutation(api.liabilities.update),
    removeLiability: useMutation(api.liabilities.remove),
    addSettlement: useMutation(api.settlements.add),
    removeSettlement: useMutation(api.settlements.remove),
    addRecurring: useMutation(api.recurring.add),
    updateRecurring: useMutation(api.recurring.update),
    removeRecurring: useMutation(api.recurring.remove),
    materializeRecurring: useMutation(api.recurring.materializeForPortfolio),
    upsertGoal: useMutation(api.goals.upsert),
    removeGoal: useMutation(api.goals.remove),
    addSnapshot: useMutation(api.wealthSnapshots.add),
    updateSnapshot: useMutation(api.wealthSnapshots.update),
    removeSnapshot: useMutation(api.wealthSnapshots.remove),
    upsertLedgerAccount: useMutation(api.ledger.upsertAccount),
    recordLedgerTransaction: useMutation(api.ledger.recordTransaction),
    removeLedgerTransaction: useMutation(api.ledger.removeTransaction),
    createAiActionDraft: useMutation(api.aiActions.createDraft),
    cancelAiActionDraft: useMutation(api.aiActions.cancelDraft),
    markAiActionFailed: useMutation(api.aiActions.markFailed),
    redraftFailedAiAction: useMutation(api.aiActions.redraftFailed),
    createMoneyPod: useMutation(api.moneyPods.create),
    updateMoneyPod: useMutation(api.moneyPods.update),
    addPodMember: useMutation(api.moneyPods.addMember),
    updatePodMember: useMutation(api.moneyPods.updateMember),
    removePodMember: useMutation(api.moneyPods.removeMember),
    addPodGroup: useMutation(api.moneyPods.addGroup),
    updatePodGroup: useMutation(api.moneyPods.updateGroup),
    removePodGroup: useMutation(api.moneyPods.removeGroup),
    addPodExpense: useMutation(api.moneyPods.addExpense),
    updatePodExpense: useMutation(api.moneyPods.updateExpense),
    removePodExpense: useMutation(api.moneyPods.removeExpense),
    addPodSettlement: useMutation(api.moneyPods.addSettlement),
    updatePodSettlement: useMutation(api.moneyPods.updateSettlement),
    removePodSettlement: useMutation(api.moneyPods.removeSettlement),
    removeMoneyPod: useMutation(api.moneyPods.remove),
    leaveMoneyPod: useMutation(api.moneyPods.leaveMoneyPod),
    createPodInviteCode: useMutation(api.moneyPods.createInviteCode),
    revokePodInviteCodes: useMutation(api.moneyPods.revokeInviteCodes),
    joinPodByCode: useMutation(api.moneyPods.joinPodByCode)
  };
}
