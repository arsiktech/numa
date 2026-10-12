import { expect, it } from "vitest";
import { buildAutoSnapshot } from "./autoSnapshot";
import type { Portfolio, Asset, Holding, Liability, CryptoWallet } from "./types";
const now = Date.parse("2026-10-01T12:00:00Z");
const portfolio = { id: "p", defaultCurrency: "EUR" } as Portfolio;
const asset: Asset = { id: "a", portfolioId: "p", name: "Cash", kind: "cash", balance: 100.01, currency: "EUR", updatedAt: now };
const holding: Holding = { id: "h", portfolioId: "p", name: "Fund", symbol: "SPY", kind: "etf", quantity: 2, costBasis: 10, currency: "EUR", acquiredAt: now };
const data = { portfolio, assets: [asset], holdings: [] as Holding[], liabilities: [] as Liability[], cryptoWallets: [] as CryptoWallet[] };
const quote = { symbol: "SPY", price: 112, changePercent: 1, provider: "stooq" as const, updatedAt: now };
it("captures actual market value with verified conversion, not cost basis", () => {
  expect(buildAutoSnapshot({ ...data, holdings: [holding] }, { SPY: quote }, { EUR: 1, USD: 1.12 }, now)).toMatchObject({ invested: 200, liquid: 100.01, netWorth: 300.01 });
});
it("skips missing, stale, mock, unknown-FX and incomplete-wallet valuations", () => {
  const invested = { ...data, holdings: [holding] };
  for (const quotes of [{}, { SPY: { ...quote, provider: "mock" as const } }, { SPY: { ...quote, updatedAt: now - 40 * 3600000 } }]) {
    expect(buildAutoSnapshot(invested, quotes, { EUR: 1, USD: 1.12 }, now)).toBeNull();
  }
  expect(buildAutoSnapshot(invested, { SPY: quote }, { EUR: 1 }, now)).toBeNull();
  expect(buildAutoSnapshot({ ...data, cryptoWallets: [{ includeInNetWorth: true } as CryptoWallet] }, {}, { EUR: 1 }, now)).toBeNull();
});
it("allows same-currency cash and reconciles rounded components", () => {
  expect(buildAutoSnapshot(data, {}, { EUR: 1 }, now)).toMatchObject({ netWorth: 100.01, invested: 0 });
  expect(buildAutoSnapshot({ ...data, assets: [{ ...asset, balance: NaN }] }, {}, { EUR: 1 }, now)).toBeNull();
  expect(buildAutoSnapshot({ ...data, assets: [] }, {}, { EUR: 1 }, now)).toBeNull();
});
