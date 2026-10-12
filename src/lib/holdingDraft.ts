import type { CurrencyCode, HoldingKind } from "./types";

export const HOLDING_CURRENCIES = ["EUR", "USD"] as const;
export const HOLDING_KINDS: { value: HoldingKind; label: string }[] = [
  { value: "stock", label: "Stock" }, { value: "etf", label: "ETF" },
  { value: "crypto", label: "Crypto" }, { value: "index", label: "Index" }
];

export interface HoldingDraft {
  symbol: string;
  name: string;
  kind: HoldingKind;
  quantity: string;
  costBasis: string;
  currency: CurrencyCode;
}

/** Accept one decimal separator, never guess grouping or silently round money. */
function decimal(raw: string, allowExponent = false): number {
  const text = raw.trim();
  // JavaScript serializes very small existing quantities as e.g. "1e-8".
  const pattern = allowExponent ? /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i : /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
  return pattern.test(text)
    ? Number(text.replace(",", ".")) : NaN;
}

export function validateHoldingDraft(draft: HoldingDraft) {
  const quantity = decimal(draft.quantity, true);
  const costBasis = decimal(draft.costBasis);
  const errors: Partial<Record<keyof HoldingDraft, string>> = {};
  if (!draft.symbol.trim()) errors.symbol = "Enter the investment's ticker symbol.";
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = "Enter a quantity greater than zero. Fractions are welcome.";
  if (!Number.isFinite(costBasis) || costBasis < 0 || costBasis > 90_000_000_000 ||
      Number(costBasis.toFixed(2)) !== costBasis) {
    errors.costBasis = "Enter the total paid, with at most two decimal places.";
  }
  if (!errors.quantity && !errors.costBasis && !Number.isFinite(costBasis / quantity)) {
    errors.quantity = "This quantity is too small for the cost entered.";
  }
  if (!HOLDING_CURRENCIES.some(code => code === draft.currency)) errors.currency = "Choose EUR or USD.";
  return { errors, valid: Object.keys(errors).length === 0, quantity, costBasis };
}
