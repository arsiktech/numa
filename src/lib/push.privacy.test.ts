import { afterEach, expect, it, vi } from "vitest";
import { showLocalNotification } from "./push";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("local notifications ignore financial text and carry no private navigation target", async () => {
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const registration = { showNotification };
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } });
  await showLocalNotification("Private Person EUR900", "Private loan due tomorrow");
  expect(showNotification).toHaveBeenCalledWith("Numa Pro", {
    body: "Your update is ready. Open Numa Pro to view it.", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/" },
  });
});
