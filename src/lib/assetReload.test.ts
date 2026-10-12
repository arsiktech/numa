import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setAssetReloadForTest,
  installAssetReloadRecovery,
  isAssetReloadInProgress,
  isRecoverableAssetLoadError,
  reloadOnceForAssetError
} from "./assetReload";

beforeEach(() => {
  window.sessionStorage.clear();
  __setAssetReloadForTest(vi.fn());
});

afterEach(() => {
  __setAssetReloadForTest(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isRecoverableAssetLoadError", () => {
  it("preserves the cooldown and performs just one delayed reload when storage works", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    __setAssetReloadForTest(reload);
    window.sessionStorage.setItem("numa:asset-reload-at", String(Date.now() - 5_000));

    expect(reloadOnceForAssetError()).toBe(true);
    expect(reloadOnceForAssetError()).toBe(true);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each(["getItem", "setItem"] as const)("still reloads once when sessionStorage.%s throws", async (method) => {
    const reload = vi.fn();
    __setAssetReloadForTest(reload);
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });

    expect(reloadOnceForAssetError()).toBe(true);
    expect(reloadOnceForAssetError()).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("still reloads when access to sessionStorage itself is denied", async () => {
    const reload = vi.fn();
    __setAssetReloadForTest(reload);
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });

    expect(reloadOnceForAssetError()).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("recognizes stale dynamic import and React lazy default-export failures", () => {
    const recoverableMessages = [
      "Failed to fetch dynamically imported module: https://numa.example/assets/page-old.js",
      "Importing a module script failed.",
      "error loading dynamically imported module",
      "TypeError: Cannot read properties of undefined (reading 'default')",
      "TypeError: undefined is not an object (evaluating 'e._result.default')"
    ];

    for (const message of recoverableMessages) {
      expect(isRecoverableAssetLoadError(new Error(message))).toBe(true);
    }
  });

  it("does not treat ordinary runtime errors as asset-load recovery cases", () => {
    expect(isRecoverableAssetLoadError(new Error("Cannot read properties of null"))).toBe(false);
    expect(isRecoverableAssetLoadError("Network request failed")).toBe(false);
  });

  it("keeps recoverable errors pending and schedules a delayed reload during the throttle window", () => {
    window.sessionStorage.setItem("numa:asset-reload-at", String(Date.now()));
    expect(reloadOnceForAssetError()).toBe(true);
    expect(isAssetReloadInProgress()).toBe(true);
  });

  it("suppresses preload errors while a delayed reload is scheduled", () => {
    window.sessionStorage.setItem("numa:asset-reload-at", String(Date.now()));
    installAssetReloadRecovery();

    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps same-page concurrent preload errors quiet after scheduling reload", async () => {
    window.sessionStorage.removeItem("numa:asset-reload-at");
    installAssetReloadRecovery();
    const reload = vi.fn();
    __setAssetReloadForTest(reload);

    expect(reloadOnceForAssetError()).toBe(true);
    expect(isAssetReloadInProgress()).toBe(true);

    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    __setAssetReloadForTest(null);
  });
});
