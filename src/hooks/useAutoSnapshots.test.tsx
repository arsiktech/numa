import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutoSnapshots } from "./useAutoSnapshots";
const mocks = vi.hoisted(() => ({ run: vi.fn(), add: vi.fn(), account: { id: "u", isCloud: true }, leaving: false, snapshots: [] as { takenAt: number }[] }));
vi.mock("@/services/auth", () => ({ useAuth: () => ({ currentAccount: mocks.account }) }));
vi.mock("@/services/cloudStore", () => ({
  useCloudState: () => ({ enabled: true, authTransitioning: mocks.leaving, byPortfolio: { p: {
    portfolio: { id: "p", defaultCurrency: "EUR" }, memberships: [{ userId: "u", role: "owner" }],
    snapshots: mocks.snapshots, assets: [{ kind: "cash", balance: 100, currency: "EUR" }], holdings: [], liabilities: [], cryptoWallets: []
  } } }),
  useCloudMutations: () => ({ addSnapshot: mocks.add })
}));
vi.mock("@/services/store", () => ({ useNuma: () => ({ state: { marketQuotes: {} } }) }));
vi.mock("@/services/fxSync", () => ({ useFxRates: () => ({ rates: { EUR: 1 } }) }));
vi.mock("@/services/writeQueue", () => ({ useWriteQueue: () => ({ runOrQueue: mocks.run }) }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z")); vi.clearAllMocks(); mocks.snapshots = []; mocks.leaving = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("retries a failed attempt with the same monthly identity instead of marking it saved", async () => {
  mocks.run.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ queued: false });
  const { rerender } = renderHook(() => useAutoSnapshots());
  await act(async () => {});
  expect(mocks.run).toHaveBeenCalledOnce();
  const first = mocks.run.mock.calls[0]![0];
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(mocks.run.mock.calls[1]![0].clientMutationId).toBe(first.clientMutationId);
  mocks.snapshots = [{ takenAt: Date.now() }];
  rerender();
  await act(async () => { vi.advanceTimersByTime(120_000); });
  expect(mocks.run).toHaveBeenCalledTimes(2);
});
it("does not start an automatic write during sign-out", () => {
  mocks.leaving = true;
  renderHook(() => useAutoSnapshots());
  expect(mocks.run).not.toHaveBeenCalled();
});
