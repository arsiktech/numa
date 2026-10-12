const RELOAD_KEY = "numa:asset-reload-at";
const RELOAD_THROTTLE_MS = 15_000;
const RECOVERABLE_ASSET_ERROR =
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Cannot read (?:properties|property) of undefined.*default|undefined is not an object.*default|_result\.default/i;

let assetReloadInProgress = false;
let delayedReloadTimer: number | undefined;
let reloadPage = () => window.location.reload();

export function isRecoverableAssetLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return RECOVERABLE_ASSET_ERROR.test(message);
}

export function isAssetReloadInProgress(): boolean {
  return assetReloadInProgress;
}

export function __setAssetReloadForTest(reload: (() => void) | null): void {
  assetReloadInProgress = false;
  if (delayedReloadTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(delayedReloadTimer);
  }
  delayedReloadTimer = undefined;
  reloadPage = reload ?? (() => window.location.reload());
}

export function reloadOnceForAssetError(): boolean {
  if (typeof window === "undefined") return false;
  if (assetReloadInProgress) return true;
  let lastReload = 0;
  try {
    lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Storage may be blocked. The in-memory guard still deduplicates this page.
  }
  const elapsed = Date.now() - lastReload;
  if (lastReload > 0 && elapsed < RELOAD_THROTTLE_MS) {
    const delay = Math.max(250, RELOAD_THROTTLE_MS - elapsed);
    scheduleAssetReload(delay);
    return true;
  }
  scheduleAssetReload(0);
  return true;
}

function scheduleAssetReload(delayMs: number): void {
  if (assetReloadInProgress) return;
  assetReloadInProgress = true;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Persisting the cooldown must never prevent the promised reload.
  }
  void clearAppShellCaches().finally(() => {
    if (delayMs > 0) {
      delayedReloadTimer = window.setTimeout(() => reloadPage(), delayMs);
      return;
    }
    reloadPage();
  });
}

async function clearAppShellCaches(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter((key) => /workbox|precache|numa-app|vite-pwa/i.test(key))
          .map((key) => window.caches.delete(key))
      );
    }
  } catch {
    // Best-effort only. A normal reload still gives the browser a chance to
    // fetch the current hashed bundle if cache deletion is unavailable.
  }
}

export function installAssetReloadRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    if (isAssetReloadInProgress() || reloadOnceForAssetError()) {
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isRecoverableAssetLoadError(event.reason)) {
      if (isAssetReloadInProgress() || reloadOnceForAssetError()) {
        event.preventDefault();
      }
    }
  });
}
