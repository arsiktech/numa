import { useCallback, useEffect, useState } from "react";

/**
 * Numa runs in one of two complexity modes — see `src/lib/types.ts#AppMode`
 * for the canonical definition. This module is the client-side runtime layer:
 * localStorage persistence + a hook + a `data-mode` attribute on `<html>` so
 * CSS can do surgical hides if needed.
 *
 * Cloud sync (writing `appMode` to Convex's `profiles` table) lives in
 * `src/services/auth.tsx` alongside the same sync for `theme` — we mirror
 * that pattern instead of duplicating it here.
 */

import type { AppMode } from "./types";
export type { AppMode };

const STORAGE_KEY = "numa:appMode";
const UPDATED_AT_KEY = "numa:appMode:updatedAt";
export const APP_MODE_CHANGE_EVENT = "numa:appMode";

/**
 * Pre-feature users start in Advanced so the UI doesn't suddenly collapse
 * on them. Fresh signups land in Light (the ensureProfile mutation handles
 * that on the cloud side; localStorage hydrate uses this default).
 */
const DEFAULT_MODE: AppMode = "advanced";

function isAppMode(value: unknown): value is AppMode {
  return value === "light" || value === "advanced" || value === "shared";
}

export function getStoredAppMode(): AppMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isAppMode(raw)) return raw;
  } catch {
    /* localStorage blocked (private mode, SSR, etc.) — fall through */
  }
  return DEFAULT_MODE;
}

export function setStoredAppMode(mode: AppMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.localStorage.setItem(UPDATED_AT_KEY, String(Date.now()));
  } catch {
    /* swallow — preference just won't persist */
  }
  // Broadcast so every other useAppMode() instance (Sidebar, BottomNav,
  // TopBar, gated screens, …) re-renders immediately. Without this the
  // setting only sticks for the component that called it until the user
  // hard-reloads — which is the "mode switch doesn't work" bug.
  try {
    window.dispatchEvent(new CustomEvent(APP_MODE_CHANGE_EVENT, { detail: mode }));
  } catch {
    /* no-op */
  }
}

export function getStoredAppModeUpdatedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UPDATED_AT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Side-effect: writes `data-mode` on `<html>`. CSS in `styles/global.css` can
 * use `html[data-mode="light"] .advanced-only { display: none }` for surgical
 * hides where a JSX `if (mode === ...)` would be too noisy.
 */
export function applyAppMode(mode: AppMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = mode;
}

/**
 * React hook returning [mode, setMode]. Persists to localStorage and applies
 * the DOM attribute as a side-effect. Cloud sync (writing to Convex) is the
 * caller's responsibility — see `useSyncedAppMode` in `auth.tsx`-adjacent
 * code if you want a single hook that does both.
 */
export function useAppMode(): [AppMode, (next: AppMode) => void] {
  const [mode, setModeState] = useState<AppMode>(() => getStoredAppMode());

  useEffect(() => {
    applyAppMode(mode);
  }, [mode]);

  // Subscribe to in-tab change events so a setMode() call from any other
  // component (e.g. Settings → AppModeCard) propagates to this instance.
  // Also listens to `storage` so a change in a sibling browser tab is
  // reflected here without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onChange(event: Event) {
      const next = (event as CustomEvent<AppMode>).detail;
      if (isAppMode(next)) setModeState(next);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (isAppMode(event.newValue)) setModeState(event.newValue);
    }
    window.addEventListener(APP_MODE_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setStoredAppMode(next);
    setModeState(next);
  }, []);

  return [mode, setMode];
}
