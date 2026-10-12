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
};

export type CloudCategory = { id: string; name: string };

export type CloudWealthSnapshot = { takenAt: number; netWorth: number; currency: CloudCurrency };

export type CloudSnapshot = {
  portfolio: CloudPortfolio;
  categories: CloudCategory[];
  transactions: CloudTransaction[];
  assets: CloudAsset[];
  liabilities: CloudLiability[];
  holdings: CloudHolding[];
  wealthSnapshots: CloudWealthSnapshot[];
};

export type CloudBootstrap = {
  profile: CloudProfile;
  portfolios: CloudPortfolio[];
  selectedPortfolioId: string | null;
};

export const cloud = {
  bootstrap: makeFunctionReference<'mutation', Record<string, never>, CloudBootstrap>('mobile:bootstrap'),
  portfolioSnapshot: makeFunctionReference<'query', { portfolioId: string }, CloudSnapshot>('mobile:portfolioSnapshot'),
  createPortfolio: makeFunctionReference<
    'mutation',
    { name: string; type: 'personal'; tagline: string; defaultCurrency: CloudCurrency; seedDefaults: boolean; clientMutationId: string },
    { id: string; replayed: boolean }
  >('portfolios:create'),
};
