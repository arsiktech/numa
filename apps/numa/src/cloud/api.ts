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
  /** Where it is kept, like a bank or a safe. Older servers leave it out. */
  location?: string | null;
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
  /** Where it is kept, like a broker or a hardware wallet. Older servers leave it out. */
  location?: string | null;
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

/** One entry Claude proposed in Ask. The app turns it into a draft; nothing is saved until the person presses Save. */
export type AskProposal = {
  kind: 'expense' | 'income' | 'account' | 'debt' | 'holding';
  name: string;
  amount: number | null;
  currency: CloudCurrency | null;
  date: string | null;
  category: string | null;
  assetKind: CloudAsset['kind'] | null;
  debtKind: CloudLiability['kind'] | null;
  holdingKind: CloudHolding['kind'] | null;
  symbol: string | null;
  quantity: number | null;
  holdingMode: 'add' | 'set' | null;
};
export type AskTurn = { role: 'user' | 'assistant'; text: string };
export type AskReply = { status: 'ok'; text: string; proposals: AskProposal[] } | { status: 'unavailable' | 'busy' | 'limited' | 'declined' };

export type CloudGoal = { id: string; scope: 'net_worth' | 'monthly_income' | 'income_category' | 'asset_value' | 'holding_value'; target: number; currency: CloudCurrency; startAt: number; deadline: number | null; label: string | null; categoryId: string | null; assetId: string | null; holdingId: string | null; createdAt: number };

export type SnapshotLine = { group: 'liquid' | 'crypto' | 'stocks' | 'hard' | 'debt'; name: string; amount: number };
export type CloudWealthSnapshot = { id?: string; takenAt: number; netWorth: number; liquid?: number; invested?: number; hardAssets?: number; liabilities?: number; currency: CloudCurrency; label?: string | null; lines?: SnapshotLine[] | null };

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
  /** Tracked public wallets, loaded beside the snapshot. */
  wallets?: CloudWallet[];
};

/** A tracked public address. Balances come from public explorers; values are in US dollars. */
export type CloudWallet = {
  id: string;
  label: string;
  address: string;
  addressType: 'bitcoin' | 'evm' | 'solana';
  includeInNetWorth: boolean;
  createdAt: number;
  snapshot: {
    provider: 'public' | 'moralis';
    totalValueUsd: number;
    /** What the wallet owes through lending protocols; counted under What you owe. */
    debtValueUsd?: number;
    tokens: { id: string; chainName: string; symbol: string; name: string; quantity: string; valueUsd?: number }[];
    defiPositions?: { id: string; chainName: string; protocol: string; label: string; kind?: string; assetValueUsd: number; debtValueUsd: number; healthFactor?: number; symbols?: string[] }[];
    chains: string[];
    failedChains: string[];
    tokenFailedChains?: string[];
    /** Explorer down: only the main tokens on these chains were read from the chain itself. */
    tokenFallbackChains?: string[];
    defiFailedChains?: string[];
    updatedAt: number;
    partial: boolean;
  } | null;
};
export type CloudWalletDoc = Omit<CloudWallet, 'id' | 'snapshot'> & { _id: string; snapshot?: CloudWallet['snapshot'] };

export type AgentAccess = 'full' | 'read';
/** An AI agent the user connected to their account. */
export type CloudAgent = { id: string; name: string; access: AgentAccess; hint: string; createdAt: number; lastUsedAt: number | null; active: boolean };
export type CloudAgentActivity = { id: string; agent: string; tool: string; write: boolean; ok: boolean; error: string | null; at: number };

export type CloudBootstrap = {
  profile: CloudProfile;
  portfolios: CloudPortfolio[];
  selectedPortfolioId: string | null;
};

/** A space is one isolated portfolio: personal or business, with its own currency. */
export type CloudSpace = { id: string; name: string; spaceKind: 'personal' | 'business' | 'legacy_shared'; defaultCurrency: CloudCurrency; role: 'owner' | 'editor' | 'viewer' | string; createdAt: number };

export type CloudMe = { id: string; email: string | null; displayName: string; deletionScheduledAt: number | null; deletionStartedAt: number | null };

export type ExportScope = { expectedUserId: string; portfolioId: string; requestId: string };
export type ExportManifest = { format: string; name: string; currency: CloudCurrency; startedAt: number; sections: string[]; consistency: string; interpretation: string; exclusions: string[] };
export type ExportPage = { rowsJSON: string; rowCount: number; isDone: boolean; continueCursor: string | null; sampledAt: number; retryLimit: 8 | 1 | null };
export type ExportLimit = 32 | 8 | 1;

type Receipt = { id: string; replayed: boolean };
type WithReceipt<T> = T & { clientMutationId: string };

export const cloud = {
  authFlags: makeFunctionReference<'query', Record<string, never>, { passwordReset: boolean; emailVerification: boolean; googleOAuth: boolean; appleOAuth: boolean }>('authConfig:flags'),
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
  upsertAsset: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; name: string; kind: CloudAsset['kind']; balance: number; currency: CloudCurrency; location?: string }>, Receipt>('mobile:upsertAsset'),
  deleteAsset: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteAsset'),
  upsertLiability: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; name: string; kind: CloudLiability['kind']; balance: number; currency: CloudCurrency; dueDate?: number }>, Receipt>('mobile:upsertLiability'),
  deleteLiability: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteLiability'),
  upsertHolding: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; symbol: string; name: string; kind: CloudHolding['kind']; quantity: number; costBasis: number; currency: CloudCurrency; acquiredAt: number; location?: string }>, Receipt>('mobile:upsertHolding'),
  upsertGoal: makeFunctionReference<'mutation', WithReceipt<{ id?: string; portfolioId: string; scope: CloudGoal['scope']; target: number; currency: CloudCurrency; startAt: number; deadline?: number; label?: string; categoryId?: string; assetId?: string; holdingId?: string; createdAt: number }>, Receipt>('mobile:upsertGoal'),
  addSnapshot: makeFunctionReference<'mutation', WithReceipt<{ portfolioId: string; takenAt: number; netWorth: number; liquid: number; invested: number; hardAssets: number; liabilities: number; currency: CloudCurrency; label?: string; isAuto: boolean; lines?: SnapshotLine[] }>, string | Receipt>('wealthSnapshots:add'),
  updateSnapshot: makeFunctionReference<'mutation', WithReceipt<{ id: string; patch: { netWorth?: number; liquid?: number; invested?: number; hardAssets?: number; liabilities?: number; lines?: SnapshotLine[] } }>, string | Receipt>('wealthSnapshots:update'),
  removeSnapshot: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, unknown>('wealthSnapshots:remove'),
  removeGoal: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('goals:remove'),
  updateCategory: makeFunctionReference<'mutation', WithReceipt<{ id: string; patch: { monthlyLimit?: number | null } }>, Receipt>('categories:update'),
  deleteHolding: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, Receipt>('mobile:deleteHolding'),

  // Spaces and account.
  me: makeFunctionReference<'query', Record<string, never>, CloudMe | null>('profiles:me'),
  listSpaces: makeFunctionReference<'query', Record<string, never>, CloudSpace[]>('spaces:listMine'),
  createSpace: makeFunctionReference<'mutation', WithReceipt<{ name: string; spaceKind: 'personal' | 'business'; currency: CloudCurrency }>, Receipt>('spaces:create'),
  updatePortfolio: makeFunctionReference<'mutation', WithReceipt<{ id: string; patch: { name?: string; defaultCurrency?: CloudCurrency } }>, Receipt>('portfolios:update'),
  listWallets: makeFunctionReference<'query', { portfolioId: string }, CloudWalletDoc[]>('cryptoWallets:listForPortfolio'),
  addWallet: makeFunctionReference<'mutation', WithReceipt<{ portfolioId: string; address: string; addressType: 'bitcoin' | 'evm'; label: string; includeInNetWorth: boolean }>, string | Receipt>('cryptoWallets:add'),
  removeWallet: makeFunctionReference<'mutation', WithReceipt<{ id: string }>, unknown>('cryptoWallets:remove'),
  refreshWallet: makeFunctionReference<'action', { walletId: string }, { status: 'ok' | 'partial' | 'failed' | 'recent' | 'unsupported' }>('walletSync:refresh'),
  registerDevice: makeFunctionReference<'mutation', { token: string; platform: 'ios' | 'android'; timeZone: string }, null>('pushAlerts:registerDevice'),
  unregisterDevice: makeFunctionReference<'mutation', { token: string }, null>('pushAlerts:unregisterDevice'),
  deviceRegistered: makeFunctionReference<'query', { token: string }, boolean>('pushAlerts:deviceRegistered'),
  readSheet: makeFunctionReference<'action', { link: string }, { status: 'ok'; csv: string } | { status: 'ok'; xlsx: string } | { status: 'private' | 'missing' | 'tooBig' | 'failed' | 'badLink' | 'limited' }>('sheetsImport:readSheet'),
  askReply: makeFunctionReference<'action', { message: string; context: string; history: AskTurn[] }, AskReply>('ask:reply'),
  changePassword: makeFunctionReference<'action', { currentPassword: string; newPassword: string }, { ok: true }>('authManagement:changePassword'),
  signInMethods: makeFunctionReference<'query', Record<string, never>, { email: string | null; privateRelay: boolean; apple: boolean; google: boolean; password: boolean } | null>('signInMethods:mine'),
  setPassword: makeFunctionReference<'action', { password: string }, { email: string }>('signInMethods:setPassword'),
  connectAgent: makeFunctionReference<'mutation', { name: string; access: AgentAccess }, { id: string; name: string; access: AgentAccess; endpoint: string; secret: string; link: string }>('agentAccess:connect'),
  agents: makeFunctionReference<'query', Record<string, never>, CloudAgent[]>('agentAccess:listMine'),
  disconnectAgent: makeFunctionReference<'mutation', { id: string }, null>('agentAccess:disconnect'),
  agentActivity: makeFunctionReference<'query', { limit?: number }, CloudAgentActivity[]>('agentAccess:recentActivity'),
  priceSeries: makeFunctionReference<'action', { range: '1D' | '1W' | '1M' | '1Y'; symbols: { symbol: string; kind: 'crypto' | 'stock' }[] }, Record<string, { t: number[]; p: number[] }>>('priceHistory:series'),
  deleteMyAccount: makeFunctionReference<'mutation', Record<string, never>, null>('users:deleteMyAccount'),
  cancelMyDeletion: makeFunctionReference<'mutation', Record<string, never>, { ok: true } | { ok: false; reason: 'already-started' | 'already-deleted' | string }>('users:cancelMyDeletion'),
  exportManifest: makeFunctionReference<'query', ExportScope, ExportManifest>('dataExport:manifest'),
  exportPage: makeFunctionReference<'query', ExportScope & { section: string; cursor: string | null; limit: ExportLimit }, ExportPage>('dataExport:page'),
};
