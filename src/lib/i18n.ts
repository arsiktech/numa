import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "./types";
import { en, type LocaleDict } from "./locales/en";

const KEY = "numa:locale";

export const LOCALES: Array<{ value: AppLocale; label: string; nativeName: string }> = [
  { value: "en", label: "English", nativeName: "English" },
  { value: "ru", label: "Russian", nativeName: "Русский" },
  { value: "es", label: "Spanish", nativeName: "Español" }
];

/**
 * Strict key type for `t()`. Exported so other modules (e.g. shared navItems
 * config) can type their labelKey field instead of using a loose `string`
 * and casting at every call site.
 */
export type I18nKey = keyof typeof en;

/**
 * English ships in the main bundle; ru/es load on demand so most visitors
 * never download dictionaries they can't read. While a locale chunk is in
 * flight `t()` falls back to English, and the resolve below re-renders every
 * mounted `useLocale` via the shared "numa:locale" event.
 */
const dictionaries: Partial<Record<AppLocale, LocaleDict>> = { en };

const localeLoaders: Record<Exclude<AppLocale, "en">, () => Promise<{ default: LocaleDict }>> = {
  ru: () => import("./locales/ru"),
  es: () => import("./locales/es")
};

const loadingLocales = new Set<AppLocale>();

function ensureLocaleLoaded(locale: AppLocale) {
  if (locale === "en" || dictionaries[locale] || loadingLocales.has(locale)) return;
  loadingLocales.add(locale);
  localeLoaders[locale]()
    .then((module) => {
      dictionaries[locale] = module.default;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("numa:locale", { detail: locale }));
      }
    })
    .catch(() => {
      // Chunk fetch failed (offline, deploy in flight): keep the English
      // fallback for now and allow a retry on the next render.
      loadingLocales.delete(locale);
    });
}

const CATEGORY_NAME_KEYS = {
  Groceries: "category.Groceries",
  Dining: "category.Dining",
  Transport: "category.Transport",
  Rent: "category.Rent",
  Utilities: "category.Utilities",
  Subscriptions: "category.Subscriptions",
  Salary: "category.Salary",
  Freelance: "category.Freelance",
  Bonus: "category.Bonus",
  Investments: "category.Investments"
} as const satisfies Record<string, I18nKey>;

export function localizeCategoryName(
  name: string,
  t: (key: I18nKey) => string
) {
  const key = CATEGORY_NAME_KEYS[name as keyof typeof CATEGORY_NAME_KEYS];
  return key ? t(key) : name;
}

export function detectAppLocale(): AppLocale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "en" || stored === "ru" || stored === "es") return stored;
  }
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  // Honour the browser's PRIMARY language: return the first entry that maps to
  // a supported locale (en included). Previously this only matched ru/es, so an
  // English-primary user who merely listed Russian got a fully Russian UI.
  for (const lang of languages) {
    const code = lang.toLowerCase().slice(0, 2);
    if (code === "en" || code === "ru" || code === "es") return code;
  }
  return "en";
}

export function setStoredLocale(locale: AppLocale) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, locale);
    window.dispatchEvent(new CustomEvent("numa:locale", { detail: locale }));
  }
}

export function useLocale() {
  const [locale, setLocaleState] = useState<AppLocale>(() => detectAppLocale());
  const [dictVersion, setDictVersion] = useState(0);

  useEffect(() => {
    const onChange = () => {
      setLocaleState(detectAppLocale());
      // Also bump when a dictionary chunk resolves so `t` gets a fresh
      // identity and downstream memos recompute with translated strings.
      setDictVersion((version) => version + 1);
    };
    window.addEventListener("storage", onChange);
    window.addEventListener("numa:locale", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("numa:locale", onChange);
    };
  }, []);

  useEffect(() => {
    ensureLocaleLoaded(locale);
  }, [locale]);

  return useMemo(() => {
    // Read dictVersion so it is a legitimate dependency: a bump refreshes
    // `t`'s identity when a lazy dictionary finishes loading even though
    // `locale` hasn't changed, so downstream memos recompute.
    void dictVersion;
    return {
      locale,
      setLocale: (next: AppLocale) => {
        setStoredLocale(next);
        setLocaleState(next);
      },
      t: (key: I18nKey) => dictionaries[locale]?.[key] ?? en[key] ?? key
    };
  }, [locale, dictVersion]);
}
