import { newId } from "@/lib/ids";
import type {
  Asset,
  Category,
  CryptoWallet,
  CurrencyCode,
  Holding,
  Liability,
  MarketQuote,
  NetWorthGoal,
  Transaction
} from "@/lib/types";
import { rollupNetWorth } from "@/lib/analytics";
import {
  cryptoCapitalAmounts,
  cryptoWalletLabelForAi,
  walletSnapshotIsFresh
} from "@/lib/cryptoWallets";
import { UNKNOWN_FX_RATES } from "@/lib/fx";
import {
  AI_CONTEXT_CHAIN_LIMIT,
  AI_CONTEXT_CODE_LIMIT,
  AI_CONTEXT_DESCRIPTION_LIMIT,
  AI_CONTEXT_ID_LIMIT,
  AI_CONTEXT_NAME_LIMIT,
  AI_CONTEXT_SHORT_LIMIT
} from "@/lib/aiRequestLimits";

/**
 * The Numa Pro conversation engine — context building, local draft parsing, and
 * calm error copy. Extracted from AIChatDialog so the full-screen Numa Pro OS
 * surface (`src/features/numa/NumaOS.tsx`) and the quick chat dialog share ONE
 * implementation of the Notice → Propose → Execute contract. Pure module: no
 * React, no network — callers own fetch/stream/state.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Epoch ms — lets day threads interleave messages with money entries. */
  at?: number;
}

export type DraftStatus = "draft" | "executing" | "confirmed" | "queued" | "cancelled" | "failed";

export type LocalActionDraft =
  | {
      id?: string;
      actionType: "transaction.create";
      status: DraftStatus;
      prompt: string;
      payload: Omit<Transaction, "id">;
    }
  | {
      id?: string;
      actionType: "category.create";
      status: DraftStatus;
      prompt: string;
      payload: Omit<Category, "id">;
    }
  | {
      id?: string;
      actionType: "budget.update";
      status: DraftStatus;
      prompt: string;
      payload: { portfolioId: string; categoryId: string; name: string; monthlyLimit: number };
    }
  | {
      id?: string;
      actionType: "goal.upsert";
      status: DraftStatus;
      prompt: string;
      payload: NetWorthGoal;
    };

export interface NumaChatContextInput {
  portfolio: { name: string; defaultCurrency: CurrencyCode };
  transactions: Transaction[];
  categories: Category[];
  assets: Asset[];
  liabilities: Liability[];
  holdings: Holding[];
  cryptoWallets?: CryptoWallet[];
  quotes: Record<string, MarketQuote>;
  /** Optional deeper grounding — goals, pod names, FX. Absent stays valid. */
  goals?: NetWorthGoal[];
  pods?: Array<{ name: string; currency: CurrencyCode }>;
  fxRates?: Record<string, number>;
}

function boundedContextString(value: string, max: number) {
  return value.slice(0, max);
}

export function buildContext({
  portfolio,
  transactions,
  categories,
  assets,
  liabilities,
  holdings,
  cryptoWallets,
  quotes,
  goals,
  pods,
  fxRates
}: NumaChatContextInput) {
  const rates = fxRates ?? UNKNOWN_FX_RATES;
  const breakdown = rollupNetWorth(assets, holdings, liabilities, quotes, {
    rates,
    currency: portfolio.defaultCurrency
  });
  const cryptoCapital = cryptoCapitalAmounts(
    cryptoWallets ?? [],
    rates,
    portfolio.defaultCurrency
  );
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // The chat API still validates with z.enum(["EUR","USD"]); narrow non-supported
  // currencies down to EUR for the chat context so the user gets a useful reply
  // instead of a 400. Numbers themselves are already converted by the rollup.
  const apiCurrency: "EUR" | "USD" = portfolio.defaultCurrency === "USD" ? "USD" : "EUR";
  return {
    portfolio: {
      name: boundedContextString(portfolio.name, AI_CONTEXT_NAME_LIMIT),
      defaultCurrency: apiCurrency
    },
    netWorth: Math.round(breakdown.netWorth + cryptoCapital.net),
    liquid: Math.round(breakdown.liquid),
    invested: Math.round(breakdown.invested + cryptoCapital.assets),
    liabilities: Math.round(breakdown.liabilities + cryptoCapital.debts),
    categories: categories.slice(0, 100).map((c) => ({
      id: boundedContextString(c.id, AI_CONTEXT_ID_LIMIT),
      name: boundedContextString(c.name, AI_CONTEXT_NAME_LIMIT),
      kind: c.kind,
      monthlyLimit: c.monthlyLimit
    })),
    recentTransactions: transactions.slice(0, 80).map((tx) => ({
      date: new Date(tx.occurredAt).toISOString().slice(0, 10),
      description: boundedContextString(tx.description, AI_CONTEXT_DESCRIPTION_LIMIT),
      amount: tx.amount,
      currency: boundedContextString(tx.currency, AI_CONTEXT_CODE_LIMIT),
      kind: tx.kind,
      categoryName: tx.categoryId
        ? boundedContextString(
            categoryById.get(tx.categoryId)?.name ?? "",
            AI_CONTEXT_NAME_LIMIT
          ) || undefined
        : undefined
    })),
    assets: assets.slice(0, 100).map((a) => ({
      name: boundedContextString(a.name, AI_CONTEXT_NAME_LIMIT),
      balance: a.balance,
      currency: boundedContextString(a.currency, AI_CONTEXT_CODE_LIMIT),
      kind: boundedContextString(a.kind, AI_CONTEXT_SHORT_LIMIT)
    })),
    liabilitiesDetail: liabilities.slice(0, 100).map((l) => ({
      name: boundedContextString(l.name, AI_CONTEXT_NAME_LIMIT),
      balance: l.balance,
      currency: boundedContextString(l.currency, AI_CONTEXT_CODE_LIMIT),
      kind: boundedContextString(l.kind, AI_CONTEXT_SHORT_LIMIT),
      interestRate: l.interestRate
    })),
    onChainWallets: (cryptoWallets ?? []).slice(0, 8).map((wallet) => ({
      label: boundedContextString(cryptoWalletLabelForAi(wallet), AI_CONTEXT_NAME_LIMIT),
      addressType: wallet.addressType,
      includedInNetWorth: wallet.includeInNetWorth,
      totalUsd: wallet.snapshot?.totalValueUsd ?? 0,
      tokenValueUsd: wallet.snapshot?.tokenValueUsd ?? 0,
      defiValueUsd: wallet.snapshot?.defiValueUsd ?? 0,
      debtValueUsd: wallet.snapshot?.debtValueUsd ?? 0,
      chains: wallet.snapshot?.chains
        .slice(0, 12)
        .map((chain) => boundedContextString(chain, AI_CONTEXT_CHAIN_LIMIT)) ?? [],
      tokens: wallet.snapshot?.tokens
        .filter((token) => !token.suspectedSpam)
        .slice(0, 12)
        .map((token) => boundedContextString(token.symbol, AI_CONTEXT_CHAIN_LIMIT)) ?? [],
      protocols: [...new Set(
        wallet.snapshot?.defiPositions.map((position) => position.protocol) ?? []
      )]
        .slice(0, 12)
        .map((protocol) => boundedContextString(protocol, AI_CONTEXT_NAME_LIMIT)),
      partial: wallet.snapshot?.partial ?? true,
      stale: !walletSnapshotIsFresh(wallet.snapshot),
      updatedAt: wallet.snapshot
        ? new Date(wallet.snapshot.updatedAt).toISOString()
        : undefined
    })),
    goals: (goals ?? []).slice(0, 12).map((goal) => ({
      label: boundedContextString(goal.label ?? "Goal", AI_CONTEXT_NAME_LIMIT),
      target: goal.target,
      currency: boundedContextString(goal.currency, AI_CONTEXT_CODE_LIMIT),
      scope: boundedContextString(goal.scope, AI_CONTEXT_SHORT_LIMIT),
      deadline: goal.deadline ? new Date(goal.deadline).toISOString().slice(0, 10) : undefined
    })),
    pods: (pods ?? []).slice(0, 8).map((pod) => ({
      name: boundedContextString(pod.name, AI_CONTEXT_NAME_LIMIT),
      currency: boundedContextString(pod.currency, AI_CONTEXT_CODE_LIMIT)
    })),
    // A handful of rates so "how much is $120 in euros" gets a grounded answer.
    fx: fxRates
      ? Object.fromEntries(
          Object.entries(fxRates)
            .filter(([code]) => ["EUR", "USD", "GBP", "CHF", "RUB", "PLN"].includes(code))
            .slice(0, 6)
        )
      : undefined
  };
}

/* ------------------------------------------------------------------------- */
/* Local action-draft parsing (Propose step happens before any provider call) */
/* ------------------------------------------------------------------------- */

function parseTransactionDraft({
  text,
  portfolioId,
  defaultCurrency,
  createdByUserId,
  categories
}: {
  text: string;
  portfolioId: string;
  defaultCurrency: CurrencyCode;
  createdByUserId: string;
  categories: Category[];
}): LocalActionDraft | null {
  const lower = text.toLowerCase();
  // Bare quick-add — "coffee 3.50", "mercadona 24,80", "7eleven 8" — the
  // fastest capture path the composer explicitly invites. Short, no question
  // mark, must contain a letter, and END with the amount (digits inside the
  // merchant name are fine — the trailing number wins).
  const bareQuickAdd =
    !text.includes("?") &&
    /^\s*(?=.*\p{L})[\p{L}\d][\p{L}\d\s.'’&()-]{0,48}\s\d+(?:[.,]\d{1,2})?\s*(?:€|\$|eur|usd)?\s*$/iu.test(
      text
    );
  const looksAction =
    bareQuickAdd ||
    /\b(add|record|create|log|spent|paid|earned|salary|income)\b/i.test(text) ||
    /(?:добавь|запиши|потратил|потратила|купил|купила|получил|получила)/i.test(text);
  if (!looksAction) return null;
  // Bare form: the amount is the LAST token ("e2e espresso 99 4.20" → 4.20).
  // Verb form keeps first-number semantics ("add 20 for lunch" → 20).
  const amountMatch = bareQuickAdd
    ? text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|eur|usd)?\s*$/i)
    : text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]!.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency: CurrencyCode = /(\$|usd|dollar)/i.test(text)
    ? "USD"
    : /(€|eur|euro)/i.test(text)
      ? "EUR"
      : defaultCurrency;
  const kind =
    /\b(earned|salary|income|paid me)\b/i.test(text) || /получил|получила/i.test(text)
      ? "income"
      : "expense";
  const category = categories.find((candidate) => {
    const name = candidate.name.toLowerCase();
    return candidate.kind === kind && lower.includes(name);
  });
  const stripped = text
    .replace(amountMatch[0], "")
    .replace(/\b(add|record|create|log|spent|paid|earned|salary|income)\b/gi, "")
    .replace(/(?:добавь|запиши|потратил|потратила|купил|купила|получил|получила)/gi, "")
    .replace(/(\$|usd|dollar|€|eur|euro)/gi, "")
    .trim()
    .replace(/^on\s+/i, "")
    .slice(0, 80);
  // "earned salary 2100" strips to nothing (salary is a verb-list word) —
  // fall back to the matched category name so the draft survives.
  const description =
    stripped || category?.name || (kind === "income" ? "Income" : "");

  if (!description) return null;
  return {
    actionType: "transaction.create",
    status: "draft",
    prompt: text,
    payload: {
      portfolioId,
      occurredAt: Date.now(),
      description,
      categoryId: category?.id,
      kind,
      amount,
      currency,
      createdByUserId
    }
  };
}

function parseCategoryDraft({
  text,
  portfolioId,
  categories
}: {
  text: string;
  portfolioId: string;
  categories: Category[];
}): LocalActionDraft | null {
  const match =
    text.match(
      /(?:add|create|new)\s+(?:(income|expense)\s+)?category\s+(?:called|named\s+)?["']?([^"',.]+)["']?/i
    ) ?? text.match(/(?:добавь|создай)\s+(?:категори[юя])\s+["']?([^"',.]+)["']?/i);
  if (!match) return null;
  const explicitKind = match.length > 2 ? match[1]?.toLowerCase() : undefined;
  const name = (match.length > 2 ? match[2] : match[1])?.trim();
  if (!name || name.length < 2) return null;
  const lower = text.toLowerCase();
  const kind =
    explicitKind === "income" ||
    /\b(income|salary|revenue|earning)\b/i.test(text) ||
    /доход|зарплат/i.test(text)
      ? "income"
      : "expense";
  const limitMatch = text.match(/(?:limit|budget|лимит|бюджет)\D*(\d+(?:[.,]\d{1,2})?)/i);
  const monthlyLimit = limitMatch ? Number(limitMatch[1]!.replace(",", ".")) : undefined;
  const color = kind === "income" ? "mint" : "peach";
  const icon =
    lower.includes("rent") || lower.includes("home") || lower.includes("дом")
      ? "home"
      : kind === "income"
        ? "briefcase"
        : "tag";
  return {
    actionType: "category.create",
    status: "draft",
    prompt: text,
    payload: {
      portfolioId,
      name: name.slice(0, 48),
      kind,
      icon,
      color,
      sortOrder: categories.length,
      monthlyLimit: Number.isFinite(monthlyLimit) ? monthlyLimit : undefined
    }
  };
}

function parseGoalDraft({
  text,
  portfolioId,
  defaultCurrency
}: {
  text: string;
  portfolioId: string;
  defaultCurrency: CurrencyCode;
}): LocalActionDraft | null {
  if (!/\b(goal|target|save|net worth)\b/i.test(text) && !/цель|накоп|капитал/i.test(text)) {
    return null;
  }
  const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!amountMatch) return null;
  const target = Number(amountMatch[1]!.replace(",", "."));
  if (!Number.isFinite(target) || target <= 0) return null;
  const currency: CurrencyCode = /(\$|usd|dollar)/i.test(text)
    ? "USD"
    : /(€|eur|euro)/i.test(text)
      ? "EUR"
      : defaultCurrency;
  const dateMatch = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const deadline = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])).getTime()
    : undefined;
  return {
    actionType: "goal.upsert",
    status: "draft",
    prompt: text,
    payload: {
      id: newId("goal"),
      portfolioId,
      scope: "net_worth",
      target,
      currency,
      startAt: Date.now(),
      deadline: Number.isFinite(deadline) ? deadline : undefined,
      label: "Net worth goal",
      createdAt: Date.now()
    }
  };
}

function parseBudgetDraft({
  text,
  portfolioId,
  categories
}: {
  text: string;
  portfolioId: string;
  categories: Category[];
}): LocalActionDraft | null {
  if (!/\b(budget|limit)\b/i.test(text) && !/бюджет|лимит/i.test(text)) return null;
  const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!amountMatch) return null;
  const monthlyLimit = Number(amountMatch[1]!.replace(",", "."));
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return null;
  const lower = text.toLowerCase();
  // The category must be one the user actually has — a budget draft against a
  // guessed category would be a silent miss at execute time.
  const category = categories.find(
    (candidate) => candidate.kind === "expense" && lower.includes(candidate.name.toLowerCase())
  );
  if (!category) return null;
  return {
    actionType: "budget.update",
    status: "draft",
    prompt: text,
    payload: {
      portfolioId,
      categoryId: category.id,
      name: category.name,
      monthlyLimit
    }
  };
}

export function parseActionDraft(input: {
  text: string;
  portfolioId: string;
  defaultCurrency: CurrencyCode;
  createdByUserId: string;
  categories: Category[];
}) {
  return (
    // Budget first: "set groceries budget to 450" also matches the bare
    // quick-add shape, and a limit change must never be logged as an expense.
    parseBudgetDraft(input) ??
    parseTransactionDraft(input) ??
    parseCategoryDraft(input) ??
    parseGoalDraft(input)
  );
}

export function draftTitle(draft: LocalActionDraft) {
  if (draft.actionType === "transaction.create") return draft.payload.description;
  if (draft.actionType === "category.create") return `Category: ${draft.payload.name}`;
  if (draft.actionType === "budget.update") return `${draft.payload.name} budget`;
  return draft.payload.label ?? "Net worth goal";
}

export function draftSubtitle(draft: LocalActionDraft) {
  if (draft.actionType === "transaction.create") {
    return `${draft.payload.kind} · ${draft.payload.amount} ${draft.payload.currency}`;
  }
  if (draft.actionType === "category.create") {
    const limit = draft.payload.monthlyLimit
      ? ` · monthly limit ${draft.payload.monthlyLimit}`
      : "";
    return `${draft.payload.kind} category${limit}`;
  }
  if (draft.actionType === "budget.update") {
    return `monthly limit → ${draft.payload.monthlyLimit}`;
  }
  return `target · ${draft.payload.target} ${draft.payload.currency}`;
}

export function draftDoneMessage(draft: LocalActionDraft) {
  if (draft.actionType === "transaction.create") {
    return `Done. ${draft.payload.amount} ${draft.payload.currency} to ${draft.payload.description}.`;
  }
  if (draft.actionType === "category.create") {
    return `Done. Created ${draft.payload.name}.`;
  }
  if (draft.actionType === "budget.update") {
    return `Done. ${draft.payload.name} caps at ${draft.payload.monthlyLimit} a month.`;
  }
  return `Done. Saved goal for ${draft.payload.target} ${draft.payload.currency}.`;
}

export function draftCompletionMessage(draft: LocalActionDraft, queued: boolean) {
  if (queued) return "Saved for sync. Numa Pro will finish this when your connection is ready.";
  return draftDoneMessage(draft);
}

export function draftPortfolioId(draft: LocalActionDraft) {
  return draft.payload.portfolioId;
}

export function aiDraftMutationOperation(draft: LocalActionDraft) {
  switch (draft.actionType) {
    case "transaction.create":
      return "transactions.add";
    case "category.create":
      return "categories.add";
    case "budget.update":
      return "categories.update";
    case "goal.upsert":
      return "goals.upsert";
  }
}

/** Execute a confirmed draft through the typed action layer. One switch, both surfaces. */
export async function executeDraft(
  draft: LocalActionDraft,
  actions: {
    createTransaction: (payload: Omit<Transaction, "id">, options?: { clientMutationId?: string; auditDraftId?: string }) => Promise<{ id: string; clientMutationId?: string; queued?: boolean }>;
    createCategory: (payload: Omit<Category, "id">, options?: { clientMutationId?: string; auditDraftId?: string }) => Promise<{ id: string; clientMutationId?: string; queued?: boolean }>;
    updateCategory: (
      id: string,
      patch: { monthlyLimit?: number },
      portfolioId?: string,
      options?: { clientMutationId?: string; auditDraftId?: string }
    ) => Promise<{ id: string; clientMutationId?: string; queued?: boolean }>;
    upsertGoal: (payload: NetWorthGoal, options?: { clientMutationId?: string; auditDraftId?: string }) => Promise<{ id: string; clientMutationId?: string; queued?: boolean }>;
  },
  clientMutationId?: string,
  auditDraftId?: string
): Promise<{ id: string; clientMutationId?: string; queued?: boolean }> {
  const options = clientMutationId ? { clientMutationId, auditDraftId } : undefined;
  switch (draft.actionType) {
    case "transaction.create":
      return actions.createTransaction(draft.payload, options);
    case "category.create":
      return actions.createCategory(draft.payload, options);
    case "budget.update":
      return actions.updateCategory(
        draft.payload.categoryId,
        { monthlyLimit: draft.payload.monthlyLimit },
        draft.payload.portfolioId,
        options
      );
    case "goal.upsert":
      return actions.upsertGoal(draft.payload, options);
  }
}

/* --------------------------------------------------------------------- */
/* Calm error copy                                                        */
/* --------------------------------------------------------------------- */

/**
 * Error whose message is already calm, user-facing copy (safe to render).
 * Anything else that reaches a catch block is a raw technical failure and
 * gets replaced with generic copy; the detail goes to console.warn only.
 */
export class FriendlyChatError extends Error {}

export const GENERIC_CHAT_ERROR = "Numa Pro couldn't answer just now. Try again in a moment.";

export function friendlyChatErrorForStatus(status: number): string {
  if (status === 429) return "You've hit today's AI limit — it resets tomorrow.";
  if (status === 401 || status === 403) {
    return "Your session needs a refresh — please sign in again, then retry.";
  }
  return GENERIC_CHAT_ERROR;
}
