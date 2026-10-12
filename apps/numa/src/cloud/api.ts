import { makeFunctionReference } from 'convex/server';

/**
 * The Convex functions this app calls. They are the same ones the iOS app uses, so the
 * new app needs no backend change. Only the fields the app reads are typed here; the
 * server returns more.
 */
export type CloudCurrency = 'EUR' | 'USD';

export type CloudProfile = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string;
  defaultCurrency: CloudCurrency;
};

export type CloudPortfolio = { id: string; name: string; defaultCurrency: CloudCurrency };

export type CloudAsset = {
  id: string;
  name: string;
  kind: 'cash' | 'real_estate' | 'vehicle' | 'collectible' | 'other';
  balance: number;
  currency: CloudCurrency;
  updatedAt: number;
};

export type CloudLiability = {
  id: string;
  name: string;
  kind: 'credit_card' | 'loan' | 'mortgage' | 'other';
  balance: number;
  currency: CloudCurrency;
  dueDate: number | null;
  updatedAt: number;
};

export type CloudHolding = {
  id: string;
  acquiredAt: number;
  symbol: string;
  name: string;
  kind: 'stock' | 'etf' | 'crypto' | 'index';
  quantity: number;
  /** Total cost in `currency`. */
  costBasis: number;
  currency: CloudCurrency;
  /** Unit price from the quote, in USD, when `quoteProvider` is set. */
  marketPrice: number;
  changePercent: number;
  quoteProvider: 'coingecko' | 'alpha-vantage' | 'stooq' | 'finnhub' | 'mock' | null;
  quoteUpdatedAt: number | null;
  quoteStale: boolean;
};

export type CloudTransaction = {
  id: string;
  occurredAt: number;
  description: string;
  categoryId: string | null;
  kind: 'income' | 'expense';
  /** Integer minor units (cents). */
  amountMinor: number;
  currency: CloudCurrency;
  accountId: string | null;
  notes: string | null;
};

export type CloudRecurring = {
  id: string;
  description: string;
  kind: 'income' | 'expense';
  amount: number;
  currency: CloudCurrency;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startAt: number;
  nextRunAt: number;
  endAt: number | null;
  active: boolean;
  revenueType: 'subscription' | 'retainer' | null;
  incomeSource: string | null;
};

export type CloudRevenue = { currency: CloudCurrency; mrr: number; arr: number } | null;

export type CloudCategory = { id: string; name: string; kind: 'income' | 'expense'; monthlyLimit?: number | null; budgetCurrency?: CloudCurrency };

export type CloudGoal = { id: string; scope: 'net_worth' | 'monthly_income' | 'income_category' | 'asset_value' | 'holding_value'; target: number; currency: CloudCurrency; startAt: number; deadline: number | null; label: string | null; categoryId: string | null; assetId: string | null; holdingId: string | null; createdAt: number };

export type CloudWealthSnapshot = { takenAt: number; netWorth: number; currency: CloudCurrency };

export type CloudSnapshot = {
  portfolio: CloudPortfolio;
  categories: CloudCategory[];
  transactions: CloudTransaction[];
  assets: CloudAsset[];
  liabilities: CloudLiability[];
  holdings: CloudHolding[];
  wealthSnapshots: CloudWealthSnapshot[];
  recurring?: CloudRecurring[];
  goals?: CloudGoal[];
  revenue?: CloudRevenue;
};

export type CloudBootstrap = {
  profile: CloudProfile;
  portfolios: CloudPortfolio[];
  selectedPortfolioId: string | null;
};

type Receipt = { id: string; replayed: boolean };
type WithReceipt<T> = T & { clientMutationId: string };

export const cloud = {
  bootstrap: makeFunctionReference<'mutation', Record<string, never>, CloudBootstrap>('mobile:bootstrap'),
  portfolioSnapshot: makeFunctionReference<'query', { portfolioId: string }, CloudSnapshot>('mobile:portfolioSnapshot'),
  createPortfolio: makeFunctionReference<
    'mutation',
    { name: string; type: 'personal'; tagline: string; defaultCurrency: CloudCurrency; seedDefaults: boolean; clientMutationId: string },
    { id: string; replayed: boolean }
  >('portfolios:create'),
  // Writes from Ask. Each carries a clientMutationId, so a retried request never saves twice.
  createTransaction: makeFunctionReference<'mutation', WithReceipt<{ portfolioId: string; occurredAt: number; description: string; categoryId?: string; kind: 'income' | 'expense'; amount: number; currency: CloudCurrency }>, Receipt>('mobile:createTransaction'),
  updateTransaction: makeFunctionReference<'mutation', WithReceipt<{ id: string; occurredAt?: number; description?: string; categoryId?: string | null; kind?: 'income' | 'expense'; amount?: number; currency?: CloudCurrency }>, Receipt>('mobile:updateTransaction'),
  deleteTransaction: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteTransaction'),
  upsertAsset: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; name: string; kind: CloudAsset['kind']; balance: number; currency: CloudCurrency }>, Receipt>('mobile:upsertAsset'),
  deleteAsset: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteAsset'),
  upsertLiability: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; name: string; kind: CloudLiability['kind']; balance: number; currency: CloudCurrency; dueDate?: number }>, Receipt>('mobile:upsertLiability'),
  deleteLiability: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteLiability'),
  upsertHolding: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; symbol: string; name: string; kind: CloudHolding['kind']; quantity: number; costBasis: number; currency: CloudCurrency; acquiredAt: number }>, Receipt>('mobile:upsertHolding'),
  upsertGoal: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; scope: CloudGoal['scope']; target: number; currency: CloudCurrency; startAt: number; deadline?: number; label?: string; categoryId?: string; assetId?: string; holdingId?: string; createdAt: number }>, Receipt>('mobile:upsertGoal'),
  removeGoal: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('goals:remove'),
  updateCategory: makeFunctionReference<'mutation', WithReceipt<{ id: string; patch: { monthlyLimit?: number | null } }>, Receipt>('categories:update'),
  deleteHolding: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteHolding'),
};
