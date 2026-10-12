import { registerSW } from "virtual:pwa-register";

/**
 * Register the Numa PWA service worker.
 *
 * The app ships as a fast-moving beta. Auto-apply waiting service workers so
 * users do not keep an old route table or stale UI after production deploys.
 * - onOfflineReady: app shell cached and ready to run offline.
 */
export function registerPwa(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Do not hard-reload immediately. Mobile Safari/Chromium can interrupt
      // an in-flight route navigation when the SW activates, leaving users on
      // the previous screen. Let the new worker activate quietly; stale chunk
      // recovery in assetReload performs one controlled reload only if needed.
      void updateSW(false);
    },
    onOfflineReady() {
      // Silent by design. Offline readiness is useful, but it should not
      // interrupt a finance workflow with a developer-flavoured toast.
    },
    onRegisterError(error) {
      console.warn("[Numa PWA] Service worker registration failed", error);
    }
  });
}

export function schedulePwaRegistration(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  const idle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    }
  ).requestIdleCallback;

  if (idle) {
    idle.call(window, registerPwa, { timeout: 3500 });
    return;
  }

  window.setTimeout(registerPwa, 1200);
}
