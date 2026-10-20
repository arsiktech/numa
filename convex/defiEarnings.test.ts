import { describe, expect, it } from "vitest";
import { earningsOf, readingRows, type Reading, type ReadingRow } from "./lib/defiEarnings";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 20, 12);
const day = (n: number) => new Date(T0 + n * DAY).toISOString().slice(0, 10);
const row = (position: string, symbol: string, quantity: number, valueUsd: number, extra: Partial<ReadingRow> = {}): ReadingRow =>
  ({ position, protocol: position.split(":")[1] ?? "Wallet", chainName: "Base", label: position, symbol, quantity, valueUsd, ...extra });
const reading = (n: number, rows: ReadingRow[], refs: Reading["refs"] = { ETH: 4000, EUR: 1.16 }): Reading => ({ day: day(n), takenAt: T0 + n * DAY, refs, rows });

describe("DeFi earnings", () => {
  it("counts lent coins growing as earned, and a loan growing as interest paid", () => {
    const e = earningsOf([
      reading(0, [row("base:aave", "USDC", 10_000, 10_000), row("base:aave", "GHO", 4_000, 4_000, { debt: true })]),
      reading(1, [row("base:aave", "USDC", 10_002, 10_002), row("base:aave", "GHO", 4_001, 4_001, { debt: true })]),
      reading(2, [row("base:aave", "USDC", 10_004, 10_004), row("base:aave", "GHO", 4_002, 4_002, { debt: true })]),
    ]);
    expect(e).toEqual([expect.objectContaining({ position: "base:aave", earnedUsd: 4, paidUsd: 2, heldUsd: 10_004, owedUsd: 4_002, unknown: 0, since: T0 })]);
    expect(e[0].daily).toEqual({ [day(1)]: [2, 1], [day(2)]: [2, 1] });
  });

  it("counts a vault share worth more as earned, and ignores the market price of what it is measured in", () => {
    // liquidUSD: same count, each worth more dollars. weETH: same count, more ether each, while ether itself fell.
    const e = earningsOf([
      reading(0, [row("op:etherfi", "liquidUSD", 50_000, 51_000), row("op:etherfi", "weETH", 10, 42_000)], { ETH: 4000 }),
      reading(1, [row("op:etherfi", "liquidUSD", 50_000, 51_010), row("op:etherfi", "weETH", 10, 37_800 * 1.0001)], { ETH: 3600 }),
    ]);
    // 10 USD on liquidUSD, plus 10 × 1.05 × 0.0001 ether at 3,600 on weETH.
    expect(e[0].earnedUsd).toBeCloseTo(10 + 3.78, 2);
  });

  it("does not count money moved in or out as earned, only the growth on what stayed", () => {
    const e = earningsOf([
      reading(0, [row("base:aave", "USDC", 10_000, 10_000)]),
      reading(1, [row("base:aave", "USDC", 25_000, 25_000)]), // Deposited 15,000.
      reading(2, [row("base:aave", "USDC", 25_005, 25_005)]),
      reading(3, [row("base:aave", "USDC", 5_000, 5_000)]), // Withdrew 20,005.
    ]);
    expect(e[0]).toMatchObject({ earnedUsd: 5, heldUsd: 5_000 });
  });

  it("leaves a share it can't value as unknown, never zero, and a share price that jumps as a bad price", () => {
    const e = earningsOf([
      reading(0, [row("op:etherfi", "weETH", 10, 42_000)], {}),
      reading(1, [row("op:etherfi", "weETH", 10, 42_010)], {}),
      reading(2, [row("op:etherfi", "weETH", 10, 42_010)], { ETH: 4000 }),
      reading(3, [row("op:etherfi", "weETH", 10, 60_000)], { ETH: 4000 }),
    ]);
    expect(e[0]).toMatchObject({ earnedUsd: 0, unknown: 3 });
  });

  it("reads every coin in a position, and only yield-bearing tokens held in the wallet", () => {
    const rows = readingRows({
      tokens: [
        { chainName: "Base", symbol: "USDC", quantity: "100", valueUsd: 100 },
        { chainName: "Base", symbol: "weETH", quantity: "2", valueUsd: 8400 },
        { chainName: "Ethereum", symbol: "stETH", quantity: "1", valueUsd: 4000 },
        { chainName: "Base", symbol: "XYZ", quantity: "9" },
      ],
      defiPositions: [
        { id: "base:morpho:0xab", protocol: "Morpho", chainName: "Base", label: "Morpho cbBTC / USDC", assets: [{ symbol: "cbBTC", valueUsd: 12_000 }, { symbol: "USDC", valueUsd: 7_000, debt: true }] },
        { id: "base:aave", protocol: "Aave V3", chainName: "Base", label: "Aave V3", assets: [{ symbol: "WBTC", quantity: "0.1", valueUsd: 10_000 }] },
      ],
    });
    expect(rows.map((r) => [r.position, r.symbol, r.quantity, r.debt ?? false])).toEqual([
      ["base:morpho:0xab", "USDC", 7_000, true],
      ["base:aave", "WBTC", 0.1, false],
      ["wallet:Base:WEETH", "weETH", 2, false],
      ["wallet:Ethereum:STETH", "stETH", 1, false],
    ]);
  });
});
