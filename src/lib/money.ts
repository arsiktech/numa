export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "RUB"
  | "CHF"
  | "JPY"
  | "CAD"
  | "AUD";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "EUR",
  "USD",
  "GBP",
  "RUB",
  "CHF",
  "JPY",
  "CAD",
  "AUD"
];

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  RUB: "₽",
  CHF: "CHF",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$"
};

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, options: Intl.NumberFormatOptions) {
  const key = `${currency}:${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    // JPY conventionally has no fractional digits; we still respect explicit options.
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, ...options });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatMoney(value: number, currency: CurrencyCode = "USD") {
  if (!Number.isFinite(value)) return "Unavailable";
  return getFormatter(currency, { maximumFractionDigits: 0 }).format(value);
}

export function formatMoneyDecimal(value: number, currency: CurrencyCode = "USD") {
  if (!Number.isFinite(value)) return "Unavailable";
  return getFormatter(currency, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}

export function formatMoneyCompact(value: number, currency: CurrencyCode = "USD") {
  if (!Number.isFinite(value)) return "Unavailable";
  return getFormatter(currency, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(fractionDigits)}%`;
}

export function formatSignedMoney(value: number, currency: CurrencyCode = "USD") {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

/**
 * Signed amount with cents. Use on small-spend surfaces (the light home)
 * where rounding to whole units would contradict the cents shown elsewhere
 * (the weekly hero and the History list). `formatSignedMoney` stays whole-unit
 * for big-picture deltas on the advanced/wealth surfaces.
 */
export function formatSignedMoneyDecimal(value: number, currency: CurrencyCode = "USD") {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoneyDecimal(Math.abs(value), currency)}`;
}

export function currencySymbol(currency: CurrencyCode) {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}
