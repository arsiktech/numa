import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "numa:theme";
const CHANGE_EVENT = "numa:theme";

/**
 * Browser chrome fallbacks (Citrus canvas). The real value is read from the
 * live `--color-bg` token in syncBrowserChrome() so every palette × mode
 * combination tints the iOS status bar / Android system UI exactly like the
 * app canvas — these constants only cover the instant before themes.css has
 * loaded.
 */
const THEME_COLOR_DARK = "#0f0f08";
const THEME_COLOR_LIGHT = "#fbfaf3";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "auto";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    /* localStorage blocked (private mode, SSR, etc.) — fall through */
  }
  return "auto";
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* swallow — preference just won't persist */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: theme }));
  } catch {
    /* no-op */
  }
}

/**
 * Map "auto" → "light" | "dark" by checking the OS preference. Anything else
 * is already a resolved theme, return as-is.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "auto") {
    if (typeof window === "undefined") return "light";
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    return mq.matches ? "dark" : "light";
  }
  return theme;
}

/**
 * Side-effects: writes data-theme on <html> and updates the dynamic theme-color
 * meta tag so Safari's UI chrome matches. Safe to call before React mounts.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(theme);
  syncBrowserChrome();
}

/**
 * Point the theme-color meta at the canvas the user actually sees. In an iOS
 * standalone install this is what paints the status bar, on Android the
 * system chrome — reading the computed `--color-bg` keeps it correct for all
 * palette keys (citrus/pebble/coral/carbon/classic) in both modes. Call after
 * any change to data-theme or data-theme-key.
 */
export function syncBrowserChrome(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  let canvas = "";
  try {
    canvas = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim();
  } catch {
    /* jsdom / stylesheet not parsed yet — fall back below */
  }
  meta.content =
    canvas ||
    (document.documentElement.dataset.theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

/**
 * React hook returning [theme, setTheme]. Persists to localStorage and reacts
 * to OS color-scheme changes while the user is in "auto".
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "auto") return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("auto");
    // Modern browsers + Safari 14+ — addEventListener is the universal API now.
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Mirror useAppMode / useThemeKey: propagate Light/Dark/Auto picks to every
  // other useTheme() instance in the same tab + across browser tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onChange(event: Event) {
      const next = (event as CustomEvent<Theme>).detail;
      if (isTheme(next)) setThemeState(next);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (isTheme(event.newValue)) setThemeState(event.newValue);
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
