// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), send: vi.fn(), rate: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = mocks.query; mutation = mocks.mutation; } }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mocks.send } }));
vi.mock("./_utils/rate-limit.js", () => ({ consumeRateLimit: mocks.rate }));
import handler from "./push-send";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("notification preview boundaries", () => {
  it("actual sender does not forward caller money/names/private URLs to the push provider", async () => {
    for (const key of ["NUMA_PUSH_INTERNAL_SECRET", "NUMA_PUSH_VAPID_PUBLIC", "NUMA_PUSH_VAPID_PRIVATE"]) vi.stubEnv(key, "synthetic");
    vi.stubEnv("VITE_CONVEX_URL", "https://synthetic.convex.cloud");
    mocks.rate.mockResolvedValue({ allowed: true }); mocks.query.mockResolvedValue([{ endpoint: "https://synthetic.push.invalid", p256dh: "synthetic", auth: "synthetic" }]); mocks.send.mockResolvedValue({});
    const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
    await handler({ method: "POST", headers: { "x-numa-push-secret": "synthetic" }, body: {
      userId: "user", title: "Private Person EUR1234", body: "Private financial description", url: "/?secret=private-access-token",
    } }, response);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toEqual({ title: "Numa Pro", body: "Your update is ready. Open Numa Pro to view it.", url: "/" });
    expect(response.json).toHaveBeenCalledWith({ delivered: 1, failed: 0, removed: 0, total: 1 });
  });
  it("actual service worker ignores queued legacy payload text and unsafe click URLs", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const showNotification = vi.fn().mockResolvedValue(undefined), openWindow = vi.fn().mockResolvedValue(undefined);
    runInNewContext(readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"), { URL, self: {
      addEventListener: (name: string, handler: any) => { listeners[name] = handler; },
      registration: { showNotification }, location: { origin: "https://numa.invalid" },
      clients: { matchAll: async () => [], openWindow },
    } });
    let pending: Promise<unknown> | undefined;
    listeners.push({ get data() { throw new Error("Must not inspect private payload"); }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(showNotification.mock.calls[0][0]).toBe("Numa Pro");
    expect(showNotification.mock.calls[0][1]).toMatchObject({ body: "Your update is ready. Open Numa Pro to view it.", data: { url: "/" } });
    listeners.notificationclick({ notification: { close() {}, data: { url: "https://foreign.invalid/?token=secret" } }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending; expect(openWindow).toHaveBeenCalledWith("/");
  });
});
