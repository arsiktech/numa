/** Management-finance v1. Stored/wire amounts are major units, USD or EUR.
 * Calculations use integer cents; decimal ties round away from zero. New writes
 * require whole cents. Historical amounts are rounded per row, never migrated.
 * Unsupported, missing, non-finite or unsafe amounts fail closed, never zero.
 */
export type FinanceCurrency = "USD" | "EUR";
export type FinanceClassification =
  | "earned_income" | "expense" | "transfer" | "opening_balance"
  | "loan_advance" | "principal_repayment" | "funding_distribution";
export type FinanceSide = "debit" | "credit";
export type FinanceAccountKind = "asset" | "liability" | "income" | "expense" | "equity" | "pod";
export const MAX_MINOR_UNITS = 9_000_000_000_000;

export function assertCurrency(currency: string): asserts currency is FinanceCurrency {
  if (currency !== "USD" && currency !== "EUR") throw new Error("Unsupported finance currency");
}

export function minorUnits(amount: number): number {
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_MINOR_UNITS / 100) {
    throw new Error("Financial amount is unavailable or outside the supported range");
  }
  // Parse the number's decimal representation, not amount * 100 (1.005 is a
  // classic binary floating-point tie). No locale-dependent parsing here.
  const [mantissa, exponent = "0"] = Math.abs(amount).toString().split("e");
  const [whole, fraction = ""] = mantissa!.split(".");
  const digits = BigInt(whole! + fraction);
  const shift = 2 + Number(exponent) - fraction.length;
  const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  const rounded = shift >= 0 ? digits * 10n ** BigInt(shift) : (digits + divisor / 2n) / divisor;
  const result = Number(rounded) * (amount < 0 ? -1 : 1);
  if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_MINOR_UNITS) throw new Error("Financial total exceeds supported precision");
  return result === 0 ? 0 : result;
}

export function majorUnits(minor: number): number {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MINOR_UNITS) throw new Error("Financial total exceeds supported precision");
  return minor / 100;
}

export function exactPositiveMoney(amount: number): number {
  const rounded = majorUnits(minorUnits(amount));
  if (amount <= 0 || rounded !== amount) throw new Error("Amount must be positive and use at most two decimal places");
  return amount;
}

export function addMoney(...amounts: number[]): number {
  return majorUnits(amounts.reduce((sum, amount) => sum + minorUnits(amount), 0));
}

export function assertTimestamp(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw new Error("Invalid financial timestamp");
}

/** UTC calendar month, start inclusive/end exclusive. No device/server TZ drift. */
export function financeMonth(nowMs: number) {
  assertTimestamp(nowMs);
  const now = new Date(nowMs);
  const start = new Date(nowMs);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(now.getUTCMonth() + 1);
  return { start: start.getTime(), end: end.getTime(), timezone: "UTC" as const };
}

export function assertClassifiedAccounts(classification: FinanceClassification, debit: FinanceAccountKind, credit: FinanceAccountKind) {
  const allowed: Record<FinanceClassification, readonly string[]> = {
    earned_income: ["asset:income"], expense: ["expense:asset"], transfer: ["asset:asset"],
    opening_balance: ["asset:equity", "equity:liability"], loan_advance: ["asset:liability"],
    principal_repayment: ["liability:asset"], funding_distribution: ["equity:asset"]
  };
  if (!allowed[classification]?.includes(`${debit}:${credit}`)) throw new Error("Accounts do not match the financial classification");
}

export function assertBalancedMoney(lines: Array<{ side: FinanceSide; amount: number; currency: string }>) {
  if (lines.length < 2) throw new Error("Ledger transaction needs at least two lines");
  const totals = new Map<string, number>();
  for (const line of lines) {
    assertCurrency(line.currency);
    exactPositiveMoney(line.amount);
    if (line.side !== "debit" && line.side !== "credit") throw new Error("Invalid ledger side");
    const net = (totals.get(line.currency) ?? 0) + minorUnits(line.amount) * (line.side === "debit" ? 1 : -1);
    majorUnits(net);
    totals.set(line.currency, net);
  }
  for (const [currency, net] of totals) if (net !== 0) throw new Error(`Ledger lines are not balanced for ${currency}`);
}

/** Explicit manual investment metadata only; names, tickers and broker labels prove nothing. */
export function isManualFund(asset: { kind: string; investmentType?: "fund" | null }): boolean {
  return asset.kind === "other" && asset.investmentType === "fund";
}
