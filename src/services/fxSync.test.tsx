import { StrictMode, type ReactNode } from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFxRates } from "./fxSync";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("finishes the FX request after StrictMode effect replay", async () => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    base: "EUR", date: new Date().toISOString().slice(0, 10),
    rates: { EUR: 1, USD: 1.12 }, provider: "frankfurter"
  }) }));
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const { result } = renderHook(() => useFxRates(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
});

it("does not trust old fallback caches or relabel a failure as ECB", async () => {
  localStorage.setItem("numa:fx:rates", JSON.stringify({ rates: { EUR: 1, USD: 1.08 }, asOf: new Date().toISOString() }));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { result } = renderHook(() => useFxRates());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.status).toBe("unavailable");
  expect(result.current.source).toBeNull();
  expect(result.current.rates.USD).toBeUndefined();
});

it("retains an old quote date without using stale rates after refresh failure", async () => {
  const date = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  localStorage.setItem("numa:fx:rates:v2", JSON.stringify({ base: "EUR", date, rates: { EUR: 1, USD: 1.12 }, provider: "frankfurter", fetchedAt: Date.now() - 2 * 86400000 }));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { result } = renderHook(() => useFxRates());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.status).toBe("stale");
  expect(result.current.asOf).toBe(date);
  expect(result.current.rates.USD).toBeUndefined();
});
