/**
 * Shapes for Claude-powered Ask. Claude only proposes entries; the app shows each one as a
 * draft and the person saves it through the usual typed mutations. Everything coming back
 * from the model is checked here before it leaves the server.
 */

export type AskProposal = {
  kind: "expense" | "income" | "account" | "debt" | "holding";
  name: string;
  /** Major units: a transaction amount, a balance, or the price paid per unit for a holding. */
  amount: number | null;
  currency: "EUR" | "USD" | null;
  /** YYYY-MM-DD: when a transaction happened, or when a debt is due. */
  date: string | null;
  category: string | null;
  assetKind: "cash" | "real_estate" | "vehicle" | "collectible" | "other" | null;
  debtKind: "credit_card" | "loan" | "mortgage" | "other" | null;
  holdingKind: "stock" | "etf" | "crypto" | "index" | null;
  symbol: string | null;
  quantity: number | null;
  holdingMode: "add" | "set" | null;
};

export type AskTurn = { role: "user" | "assistant"; text: string };

export const ASK_LIMITS = { message: 2_000, context: 16_000, turns: 6, turnText: 2_000, proposals: 3 } as const;

const KINDS = ["expense", "income", "account", "debt", "holding"] as const;
const ASSET_KINDS = ["cash", "real_estate", "vehicle", "collectible", "other"] as const;
const DEBT_KINDS = ["credit_card", "loan", "mortgage", "other"] as const;
const HOLDING_KINDS = ["stock", "etf", "crypto", "index"] as const;
const CURRENCIES = ["EUR", "USD"] as const;
const MODES = ["add", "set"] as const;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });

/** The one tool Claude may call. Strict, so its arguments always match this schema. */
export const PROPOSE_ENTRY_TOOL = {
  name: "propose_entry",
  description:
    "Propose one entry for the person to confirm: a spend, an income, an account balance, a debt, or an investment holding. " +
    "Numa shows it as a draft and saves nothing until the person presses Save. Call it once per item, at most three times. " +
    "Use null for anything the person did not say; never guess an amount or a price.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "name", "amount", "currency", "date", "category", "asset_kind", "debt_kind", "holding_kind", "symbol", "quantity", "holding_mode"],
    properties: {
      kind: { ...oneOf(KINDS), description: "expense or income for money that moved; account for a balance someone has; debt for money owed; holding for stocks, ETFs or crypto." },
      name: { type: "string", description: "Short label: what a spend was for, who paid, the account, debt or holding name." },
      amount: { ...nullable({ type: "number" }), description: "Positive number in major units. For a holding, the price paid per unit." },
      currency: { ...nullable(oneOf(CURRENCIES)), description: "EUR or USD if the person said so, else null." },
      date: { ...nullable({ type: "string" }), description: "YYYY-MM-DD. When a spend or income happened, or when a debt is due. Null for today or not said." },
      category: { ...nullable({ type: "string" }), description: "For expense or income, the name of one of the person's existing categories, else null." },
      asset_kind: { ...nullable(oneOf(ASSET_KINDS)), description: "For account only." },
      debt_kind: { ...nullable(oneOf(DEBT_KINDS)), description: "For debt only." },
      holding_kind: { ...nullable(oneOf(HOLDING_KINDS)), description: "For holding only." },
      symbol: { ...nullable({ type: "string" }), description: "For holding only: the ticker or coin symbol, like VOO or BTC." },
      quantity: { ...nullable({ type: "number" }), description: "For holding only: units bought, or units now held." },
      holding_mode: { ...nullable(oneOf(MODES)), description: "For holding only: add for a purchase, set for how many are held now." },
    },
  },
} as const;

const pick = <T extends string>(values: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, max);
  return trimmed || null;
};

const positive = (value: unknown, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max ? value : null;

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d ? value : null;
}

/** Checks one tool call from the model. Anything that doesn't fit is dropped, never repaired into a number. */
export function normalizeProposal(input: unknown): AskProposal | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const kind = pick(KINDS, raw.kind);
  if (!kind) return null;
  const symbol = kind === "holding" ? text(raw.symbol, 12)?.toUpperCase().replace(/[^A-Z0-9.-]/g, "") || null : null;
  const name = text(raw.name, 80) ?? symbol;
  if (!name) return null;
  if (kind === "holding" && !symbol) return null;
  return {
    kind,
    name,
    amount: positive(raw.amount, 1e12),
    currency: pick(CURRENCIES, raw.currency),
    date: isoDate(raw.date),
    category: kind === "expense" || kind === "income" ? text(raw.category, 60) : null,
    assetKind: kind === "account" ? pick(ASSET_KINDS, raw.asset_kind) : null,
    debtKind: kind === "debt" ? pick(DEBT_KINDS, raw.debt_kind) : null,
    holdingKind: kind === "holding" ? pick(HOLDING_KINDS, raw.holding_kind) : null,
    symbol,
    quantity: kind === "holding" ? positive(raw.quantity, 1e15) : null,
    holdingMode: kind === "holding" ? pick(MODES, raw.holding_mode) : null,
  };
}

/** Earlier turns as alternating messages that start with the person, bounded in count and length. */
export function normalizeHistory(history: AskTurn[]): AskTurn[] {
  const out: AskTurn[] = [];
  for (const turn of history.slice(-ASK_LIMITS.turns)) {
    const body = turn.text.trim().slice(0, ASK_LIMITS.turnText);
    if (!body) continue;
    if (!out.length && turn.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n${body}`;
    else out.push({ role: turn.role, text: body });
  }
  // The new question follows, so history has to end with Numa's reply.
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

export const ASK_SYSTEM_PROMPT = [
  "You are Numa, the assistant inside Numa Pro, an app that shows a person's net worth: what they own, what they owe and how their money moves.",
  "Answer from the person's own numbers, given below, in one to three short, plain sentences. Use their currency and round big amounts.",
  "Never invent a number. If the numbers below don't answer the question, say what is missing.",
  "Explain what their numbers show; don't give personal investment, tax or legal advice.",
  "When the person tells you about money that should be recorded (a purchase, income, a balance, a debt, an investment), call propose_entry once per item instead of describing it. Numa shows each one as a draft that they confirm. Never say something is saved.",
  "Write in plain text without markdown, and don't use em dashes.",
].join("\n");
