/** Business MRR/ARR and recurring income sources, derived from recurring rules.
 *
 * Only income rules the user explicitly marks as a subscription or retainer
 * count toward MRR; salaries, one-off work, loans, transfers and investment
 * proceeds are never annualized. Everything here is a contracted run-rate or a
 * schedule, never cash received. Amounts are summed in integer cents; a rule in
 * another currency without a usable rate is reported, never silently zero.
 */
import { majorUnits, minorUnits } from "./finance";

export type RevenueType = "subscription" | "retainer";
export type RevenueCadence = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RevenueRule {
  id: string;
  description: string;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  cadence: RevenueCadence;
  startAt: number;
  endAt?: number;
  active: boolean;
  revenueType?: RevenueType;
  incomeSource?: string;
}

export type RevenueExclusionReason = "inactive" | "ended" | "not_started" | "no_rate" | "invalid_amount";

export interface RevenueSource {
  source: string;
  monthly: number;
  rules: number;
}

export interface RecurringRevenue {
  currency: string;
  valuedAt: number;
  /** Contracted monthly run-rate from qualifying subscriptions and retainers. */
  mrr: number;
  /** mrr × 12. */
  arr: number;
  qualifyingRules: number;
  revenueSources: RevenueSource[];
  /** All active recurring income normalized to a month: a schedule, not cash. */
  scheduledMonthlyIncome: number;
  incomeSources: RevenueSource[];
  excluded: Array<{ id: string; description: string; reason: RevenueExclusionReason }>;
}

/** Occurrences per year. Weekly uses 52, so a weekly rule is amount × 52 / 12 a month. */
const PER_YEAR: Record<RevenueCadence, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

/** Units of each currency per EUR, the same shape as the web FX cache. */
export type RevenueRates = Partial<Record<string, number>>;

function annualMinor(rule: RevenueRule, currency: string, rates: RevenueRates | undefined): number | "no_rate" | "invalid_amount" {
  let minor: number;
  try { minor = minorUnits(rule.amount) * PER_YEAR[rule.cadence]; } catch { return "invalid_amount"; }
  if (!Number.isSafeInteger(minor) || minor <= 0) return "invalid_amount";
  if (rule.currency === currency) return minor;
  const from = rates?.[rule.currency], to = rates?.[currency];
  if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return "no_rate";
  const converted = Math.round((minor / from) * to);
  return Number.isSafeInteger(converted) && converted > 0 ? converted : "no_rate";
}

function sourceName(rule: RevenueRule) {
  const named = rule.incomeSource?.trim();
  return named || rule.description.trim() || "Unnamed";
}

function groupSources(rows: Array<{ source: string; annual: number }>): RevenueSource[] {
  const bySource = new Map<string, { annual: number; rules: number }>();
  for (const row of rows) {
    const current = bySource.get(row.source) ?? { annual: 0, rules: 0 };
    bySource.set(row.source, { annual: current.annual + row.annual, rules: current.rules + 1 });
  }
  return [...bySource]
    .map(([source, value]) => ({ source, monthly: majorUnits(Math.round(value.annual / 12)), rules: value.rules }))
    .sort((a, b) => b.monthly - a.monthly || a.source.localeCompare(b.source));
}

export function computeRecurringRevenue(
  rules: RevenueRule[],
  options: { currency: string; now: number; rates?: RevenueRates }
): RecurringRevenue {
  const { currency, now, rates } = options;
  const excluded: RecurringRevenue["excluded"] = [];
  const revenue: Array<{ source: string; annual: number }> = [];
  const income: Array<{ source: string; annual: number }> = [];

  for (const rule of rules) {
    if (rule.kind !== "income") continue;
    const note = (reason: RevenueExclusionReason) => excluded.push({ id: rule.id, description: rule.description, reason });
    if (!rule.active) { if (rule.revenueType) note("inactive"); continue; }
    if (rule.endAt !== undefined && rule.endAt <= now) { if (rule.revenueType) note("ended"); continue; }
    // A rule that has not started yet is a forecast, not run-rate or schedule.
    if (rule.startAt > now) { if (rule.revenueType) note("not_started"); continue; }
    const annual = annualMinor(rule, currency, rates);
    if (annual === "no_rate" || annual === "invalid_amount") { note(annual); continue; }
    const row = { source: sourceName(rule), annual };
    income.push(row);
    if (rule.revenueType) revenue.push(row);
  }

  const annualRevenue = revenue.reduce((sum, row) => sum + row.annual, 0);
  const mrrMinor = Math.round(annualRevenue / 12);
  const scheduledMinor = Math.round(income.reduce((sum, row) => sum + row.annual, 0) / 12);
  return {
    currency,
    valuedAt: now,
    mrr: majorUnits(mrrMinor),
    arr: majorUnits(mrrMinor * 12),
    qualifyingRules: revenue.length,
    revenueSources: groupSources(revenue),
    scheduledMonthlyIncome: majorUnits(scheduledMinor),
    incomeSources: groupSources(income),
    excluded
  };
}
