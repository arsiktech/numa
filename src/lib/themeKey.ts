import { useCallback, useEffect, useState } from "react";
import { syncBrowserChrome } from "./theme";
import type { AppThemeKey } from "./types";

/**
 * Palette theme — citrus / pebble / coral / carbon / numa — combined with
 * the light/dark mode handled in `theme.ts` gives 10 visual variants. Each
 * is defined as a CSS block in `src/styles/themes.css` keyed by
 * `[data-theme-key="..."]` on `<html>`.
 *
 * Default is "citrus" (lime on near-black) — the new brand. The legacy
 * "numa" Classic purple is still selectable via Settings for users who
 * prefer it. Pre-auth surfaces (welcome, login) force Citrus explicitly so
 * an unauthenticated visitor never sees a stale palette.
 *
 * Pattern mirrors `theme.ts` — localStorage persistence + DOM attribute
 * application + a React hook. Cloud sync to `profiles.themeKey` is wired in
 * the Settings card alongside the existing `updateProfile` mutation path.
 */

export type { AppThemeKey };

const STORAGE_KEY = "numa:themeKey";
const CHANGE_EVENT = "numa:themeKey";

const DEFAULT_KEY: AppThemeKey = "citrus";

function isThemeKey(value: unknown): value is AppThemeKey {
  return (
    value === "numa" ||
    value === "citrus" ||
    value === "pebble" ||
    value === "coral" ||
    value === "carbon"
  );
}

export function getStoredThemeKey(): AppThemeKey {
  if (typeof window === "undefined") return DEFAULT_KEY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeKey(raw)) return raw;
  } catch {
    /* swallow — private mode etc. */
  }
  return DEFAULT_KEY;
}

export function setStoredThemeKey(key: AppThemeKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* swallow */
  }
  // Broadcast so sibling components using useThemeKey() (Sidebar, Settings,
  // onboarding, …) re-render immediately instead of staying on the stale
  // value until a hard reload.
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
  } catch {
    /* no-op */
  }
}

/**
 * Applies the palette to `<html>` via `data-theme-key`. The matching CSS
 * block in `themes.css` immediately retints every `var(--color-*)` consumer.
 *
 * The "numa" Classic key intentionally has NO override block in themes.css —
 * leaving the attribute off means the tokens.css `:root` defaults win, which
 * is the legacy purple look. Setting "numa" explicitly is harmless and lets
 * us round-trip the stored value.
 */
export function applyThemeKey(key: AppThemeKey): void {
  if (typeof document === "undefined") return;
  if (key === "numa") {
    delete document.documentElement.dataset.themeKey;
  } else {
    document.documentElement.dataset.themeKey = key;
  }
  // Palettes change the canvas color, and the canvas is what the iOS status
  // bar / Android chrome tint from.
  syncBrowserChrome();
}

/**
 * React hook returning [key, setKey]. Persists to localStorage + applies the
 * DOM attribute as a side-effect. Cloud sync is the caller's job (mirrors how
 * `useTheme` already works in this repo).
 */
export function useThemeKey(): [AppThemeKey, (next: AppThemeKey) => void] {
  const [key, setKeyState] = useState<AppThemeKey>(() => getStoredThemeKey());

  useEffect(() => {
    applyThemeKey(key);
  }, [key]);

  // Subscribe to in-tab change events so another palette control (for example,
  // Settings → PaletteCard) flows through to this instance immediately.
  // Cross-tab changes use `storage`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onChange(event: Event) {
      const next = (event as CustomEvent<AppThemeKey>).detail;
      if (isThemeKey(next)) setKeyState(next);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (isThemeKey(event.newValue)) setKeyState(event.newValue);
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setKey = useCallback((next: AppThemeKey) => {
    setStoredThemeKey(next);
    setKeyState(next);
  }, []);

  return [key, setKey];
}

/** Display metadata for each palette — used by the Settings picker UI. */
export const THEME_KEY_OPTIONS: Array<{
  value: AppThemeKey;
  name: string;
  sub: string;
  /** Approximate brand accent hex for the swatch chip — light-mode value. */
  swatch: string;
}> = [
  { value: "citrus", name: "Citrus", sub: "lime on near-black", swatch: "#BFE438" },
  { value: "pebble", name: "Pebble", sub: "sage, calm", swatch: "#5C8073" },
  { value: "coral", name: "Coral", sub: "warm terracotta", swatch: "#D9685A" },
  { value: "carbon", name: "Carbon", sub: "mono mint", swatch: "#00C896" },
  { value: "numa", name: "Classic", sub: "indigo on cream", swatch: "#5A3FB8" }
];
