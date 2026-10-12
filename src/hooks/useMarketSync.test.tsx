import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useMarketSync } from "./useMarketSync";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), dispatch: vi.fn(), timestamp: Date.now() - 60_000 }));
vi.mock("@/services/store", () => ({ useNuma: () => ({ state: { holdings: [{ symbol: "AAPL" }], marketQuotes: { AAPL: { symbol: "AAPL", price: 100, provider: "stooq", updatedAt: mocks.timestamp } } }, dispatch: mocks.dispatch }) }));
vi.mock("@/services/marketData", async importOriginal => ({ ...await importOriginal<typeof import("@/services/marketData")>(), fetchMarketQuotes: mocks.fetch }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("preserves the saved quote and its date when refresh fails", async () => {
  mocks.fetch.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useMarketSync());
  await waitFor(() => expect(result.current.failedSymbols).toEqual(["AAPL"]));
  expect(result.current.oldestRetainedAt).toBe(mocks.timestamp);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
