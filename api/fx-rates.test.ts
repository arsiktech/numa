import { afterEach, expect, it, vi } from "vitest";
import handler from "./fx-rates";
vi.mock("./_utils/rate-limit.js", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
afterEach(() => vi.unstubAllGlobals());
function response() { const json = vi.fn(); return { setHeader: vi.fn(), status: vi.fn(() => ({ json })), json }; }
it("returns an unavailable response when the provider fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const res = response();
  await handler({ method: "GET" }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: "FX rates are temporarily unavailable." });
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});
it("passes through the provider's actual date and validates its rates", async () => {
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ base: "EUR", date, rates: { USD: 1.12 } }) }));
  const res = response();
  await handler({ method: "GET" }, res);
  expect(res.json).toHaveBeenCalledWith({ base: "EUR", date, rates: { EUR: 1, USD: 1.12 }, provider: "frankfurter" });
});
