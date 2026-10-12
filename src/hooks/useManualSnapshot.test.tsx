import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useManualSnapshot } from "./useManualSnapshot";
import type { WealthSnapshot } from "@/lib/types";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/services/domainActions", () => ({ useDomainActions: () => ({ createSnapshot: mocks.create }) }));
vi.mock("@/services/writeQueue", () => ({ makeClientMutationId: () => "one-intent" }));
const input: Omit<WealthSnapshot, "id"> = { portfolioId: "p", takenAt: 1, currency: "EUR", netWorth: 100, liquid: 100, invested: 0, hardAssets: 0, liabilities: 0, isAuto: false };
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

it("does not show success before save resolves and prevents concurrent duplicates", async () => {
  let resolve!: (value: { queued: boolean }) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useManualSnapshot("p"));
  let save!: Promise<void>;
  act(() => { save = result.current.capture(input); void result.current.capture(input); });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("saving");
  await act(async () => { resolve({ queued: true }); await save; });
  expect(result.current.phase).toBe("queued");
  expect(result.current.message).not.toContain("saved");
});
it("preserves the original payload and receipt after a failed response", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Interrupted")).mockResolvedValueOnce({ queued: false });
  const { result } = renderHook(() => useManualSnapshot("p"));
  await act(() => result.current.capture(input));
  expect(result.current.phase).toBe("error");
  // Fresh market data may expire after an uncertain response; retry the
  // original eligible snapshot rather than requiring a new valuation.
  await act(() => result.current.capture(null));
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  expect(result.current.phase).toBe("saved");
});
it("rejects incomplete valuations and ignores a late result from the previous portfolio", async () => {
  let resolve!: (value: { queued: boolean }) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ id }) => useManualSnapshot(id), { initialProps: { id: "p" } });
  await act(() => result.current.capture(null));
  expect(mocks.create).not.toHaveBeenCalled();
  let save!: Promise<void>;
  act(() => { save = result.current.capture(input); });
  rerender({ id: "other" });
  await act(async () => { resolve({ queued: false }); await save; });
  expect(result.current.phase).toBe("idle");
  expect(result.current.message).toBe("");
});
