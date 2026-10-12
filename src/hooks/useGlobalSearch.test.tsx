import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalSearch } from "./useGlobalSearch";

const mocks = vi.hoisted(() => ({ mode: "shared" as "light" | "advanced" | "shared" }));

vi.mock("@/lib/appMode", () => ({
  useAppMode: () => [mocks.mode]
}));

vi.mock("@/services/store", () => ({
  useNuma: () => ({
    state: {
      transactions: [],
      holdings: [],
      assets: [],
      liabilities: [],
      categories: [],
      portfolios: [],
      memberships: []
    }
  })
}));

vi.mock("@/services/cloudStore", () => ({
  useCloudState: () => ({
    portfolios: [{ id: "portfolio", name: "Personal", tagline: "Private capital" }],
    byPortfolio: {
      portfolio: {
        transactions: [{ id: "tx", portfolioId: "portfolio", description: "Secret Cafe", notes: "", amount: 20 }],
        holdings: [{ id: "holding", portfolioId: "portfolio", symbol: "AAPL", name: "Apple" }],
        assets: [{ id: "asset", portfolioId: "portfolio", name: "Private Cash" }],
        liabilities: [],
        categories: [],
        memberships: []
      }
    }
  })
}));

describe("global search mode boundary", () => {
  it("does not expose personal portfolio rows while Shared mode is active", () => {
    const { result } = renderHook(() => useGlobalSearch("private"));
    expect(result.current).toEqual({
      transactions: [],
      holdings: [],
      assets: [],
      liabilities: [],
      categories: [],
      portfolios: [],
      collaborators: [],
      total: 0
    });
  });
});
