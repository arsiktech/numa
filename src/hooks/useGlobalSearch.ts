import { useMemo } from "react";
import { useNuma } from "@/services/store";
import { useCloudState } from "@/services/cloudStore";
import { useAppMode } from "@/lib/appMode";
import type {
  Asset,
  Category,
  Holding,
  Liability,
  Membership,
  Portfolio,
  Transaction
} from "@/lib/types";

const MAX_PER_GROUP = 8;

export interface SearchGroups {
  transactions: Transaction[];
  holdings: Holding[];
  assets: Asset[];
  liabilities: Liability[];
  categories: Category[];
  portfolios: Portfolio[];
  collaborators: Membership[];
  total: number;
}

function score(haystack: string, needle: string): number {
  const text = haystack.toLowerCase();
  if (text === needle) return 3;
  if (text.startsWith(needle)) return 2;
  if (text.includes(needle)) return 1;
  return 0;
}

function matches(haystack: string | undefined | null, needle: string) {
  if (!haystack) return 0;
  return score(haystack, needle);
}

export function useGlobalSearch(rawQuery: string): SearchGroups | null {
  const { state } = useNuma();
  const cloud = useCloudState();
  const [appMode] = useAppMode();
  const cloudRows = useMemo(() => Object.values(cloud.byPortfolio), [cloud.byPortfolio]);
  return useMemo(() => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return null;
    if (appMode === "shared") {
      return {
        transactions: [],
        holdings: [],
        assets: [],
        liabilities: [],
        categories: [],
        portfolios: [],
        collaborators: [],
        total: 0
      };
    }

    const scored = <T,>(items: T[], rank: (item: T) => number, limit = MAX_PER_GROUP) =>
      items
        .map((item) => ({ item, rank: rank(item) }))
        .filter((entry) => entry.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, limit)
        .map((entry) => entry.item);

    const transactionsSource = [
      ...cloudRows.flatMap((row) => row.transactions),
      ...state.transactions
    ];
    const holdingsSource = [
      ...cloudRows.flatMap((row) => row.holdings),
      ...state.holdings
    ];
    const assetsSource = [
      ...cloudRows.flatMap((row) => row.assets),
      ...state.assets
    ];
    const liabilitiesSource = [
      ...cloudRows.flatMap((row) => row.liabilities),
      ...state.liabilities
    ];
    const categoriesSource = [
      ...cloudRows.flatMap((row) => row.categories),
      ...state.categories
    ];
    const portfoliosSource = [...cloud.portfolios, ...state.portfolios];
    const membershipsSource = [
      ...cloudRows.flatMap((row) => row.memberships),
      ...state.memberships
    ];

    const transactions = scored(transactionsSource, (tx) =>
      Math.max(
        matches(tx.description, query) * 2,
        matches(tx.notes, query),
        matches(tx.amount.toFixed(2), query)
      )
    );

    const holdings = scored(holdingsSource, (h) =>
      Math.max(matches(h.symbol, query) * 2, matches(h.name, query))
    );
    const assets = scored(assetsSource, (a) => matches(a.name, query));
    const liabilities = scored(liabilitiesSource, (l) => matches(l.name, query));
    const categories = scored(categoriesSource, (c) => matches(c.name, query));
    const portfolios = scored(portfoliosSource, (p) =>
      Math.max(matches(p.name, query) * 2, matches(p.tagline, query))
    );
    const collaborators = scored(membershipsSource, (m) => matches(m.displayName, query));

    const total =
      transactions.length +
      holdings.length +
      assets.length +
      liabilities.length +
      categories.length +
      portfolios.length +
      collaborators.length;

    return {
      transactions,
      holdings,
      assets,
      liabilities,
      categories,
      portfolios,
      collaborators,
      total
    };
  }, [
    rawQuery,
    appMode,
    cloudRows,
    cloud.portfolios,
    state.assets,
    state.categories,
    state.holdings,
    state.liabilities,
    state.memberships,
    state.portfolios,
    state.transactions
  ]);
}
