import type { Category, CurrencyCode, Transaction } from "@/lib/types";
import {
  accountPortfolioCacheKey,
  quarantineLegacyPortfolioCaches,
  type AccountCacheScope
} from "@/lib/accountCache";
import type { ChatMessage } from "./engine";
import { sanitizeChatMessages } from "./chatRequest";

/**
 * Day-keyed conversation threads for the Numa OS surface. Each calendar day is
 * its own thread: the day's money entries render inline and the chat history
 * for that day persists in localStorage (same posture as the quick dialog's
 * history — UI cache, never the product database).
 */

export function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function tsOfDayKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0).getTime();
}

export function shiftDayKey(key: string, deltaDays: number): string {
  return dayKeyOf(tsOfDayKey(key) + deltaDays * 86_400_000);
}

export function isToday(key: string): boolean {
  return key === dayKeyOf(Date.now());
}

/** "Today" / "Yesterday" / "Tue 24 Jun" — plain, short, no jargon. */
export function dayTitle(key: string, locale: string): string {
  const now = dayKeyOf(Date.now());
  if (key === now) return locale.startsWith("ru") ? "Сегодня" : locale.startsWith("es") ? "Hoy" : "Today";
  if (key === shiftDayKey(now, -1)) {
    return locale.startsWith("ru") ? "Вчера" : locale.startsWith("es") ? "Ayer" : "Yesterday";
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(tsOfDayKey(key));
}

export function monthTitle(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    tsOfDayKey(key)
  );
}

/* ------------------------------------------------------------------ */
/* Thread storage                                                      */
/* ------------------------------------------------------------------ */

function threadKey(scope: AccountCacheScope, portfolioId: string, day: string) {
  return accountPortfolioCacheKey(scope, "thread", portfolioId, day);
}

function threadIndexKey(scope: AccountCacheScope, portfolioId: string) {
  return accountPortfolioCacheKey(scope, "thread-index", portfolioId);
}

export function loadThread(
  scope: AccountCacheScope | null,
  portfolioId: string,
  day: string
): ChatMessage[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    quarantineLegacyPortfolioCaches(window.localStorage, portfolioId);
    const raw = window.localStorage.getItem(threadKey(scope, portfolioId, day));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return sanitizeChatMessages(parsed);
  } catch {
    return [];
  }
}

export function saveThread(
  scope: AccountCacheScope | null,
  portfolioId: string,
  day: string,
  messages: ChatMessage[]
): void {
  if (typeof window === "undefined" || !scope) return;
  try {
    const trimmed = sanitizeChatMessages(messages).slice(-60);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(threadKey(scope, portfolioId, day));
    } else {
      window.localStorage.setItem(threadKey(scope, portfolioId, day), JSON.stringify(trimmed));
    }
    // Index keeps "days with conversations" cheap to enumerate for the pager
    // dots and the catalog without scanning every localStorage key.
    const index = loadThreadIndex(scope, portfolioId);
    const has = index.includes(day);
    if (trimmed.length > 0 && !has) {
      window.localStorage.setItem(
        threadIndexKey(scope, portfolioId),
        JSON.stringify([...index, day].sort().slice(-180))
      );
    } else if (trimmed.length === 0 && has) {
      window.localStorage.setItem(
        threadIndexKey(scope, portfolioId),
        JSON.stringify(index.filter((d) => d !== day))
      );
    }
  } catch {
    /* quota — history is a cache, never the source of truth */
  }
}

export function loadThreadIndex(
  scope: AccountCacheScope | null,
  portfolioId: string
): string[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    quarantineLegacyPortfolioCaches(window.localStorage, portfolioId);
    const raw = window.localStorage.getItem(threadIndexKey(scope, portfolioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Day derivations                                                     */
/* ------------------------------------------------------------------ */

export interface DayEntries {
  day: string;
  entries: Transaction[];
  spent: number;
  earned: number;
}

/**
 * Transactions grouped by day, newest day first. Amounts stay in native
 * currency per entry; day totals convert nothing (they're used for the day
 * brief where the portfolio is effectively single-currency — mixed-currency
 * days simply sum by magnitude and the brief keeps per-entry currencies).
 */
export function groupByDay(transactions: Transaction[]): Map<string, DayEntries> {
  const map = new Map<string, DayEntries>();
  for (const tx of transactions) {
    const day = dayKeyOf(tx.occurredAt);
    let group = map.get(day);
    if (!group) {
      group = { day, entries: [], spent: 0, earned: 0 };
      map.set(day, group);
    }
    group.entries.push(tx);
    if (tx.kind === "expense") group.spent += tx.amount;
    else group.earned += tx.amount;
  }
  for (const group of map.values()) {
    group.entries.sort((a, b) => a.occurredAt - b.occurredAt);
  }
  return map;
}

/**
 * The deterministic "day brief" — Numa's opening Notice for a thread. Plain
 * copy, specific numbers, no API call needed. Works with AI fully off.
 */
export function dayBrief({
  day,
  group,
  categories,
  currency,
  locale,
  formatAmount
}: {
  day: string;
  group: DayEntries | undefined;
  categories: Category[];
  currency: CurrencyCode;
  locale: string;
  formatAmount: (amount: number, currency: CurrencyCode) => string;
}): string {
  const ru = locale.startsWith("ru");
  const es = locale.startsWith("es");
  const today = isToday(day);
  if (!group || group.entries.length === 0) {
    if (today) {
      return ru
        ? "Пока ничего не потрачено. Тихий день."
        : es
          ? "Nada gastado todavía. Un día tranquilo."
          : "Nothing spent yet. A quiet day.";
    }
    return ru ? "В этот день — без трат." : es ? "Sin gastos ese día." : "No spending this day.";
  }
  const expenses = group.entries.filter((t) => t.kind === "expense");
  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    const name = categories.find((c) => c.id === tx.categoryId)?.name;
    if (name) byCategory.set(name, (byCategory.get(name) ?? 0) + tx.amount);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const spent = formatAmount(group.spent, currency);
  const count = expenses.length;

  if (ru) {
    const entriesWord = count === 1 ? "запись" : count < 5 ? "записи" : "записей";
    const base = `${spent} за ${count} ${entriesWord}`;
    const topPart = top ? `, больше всего — ${top[0].toLowerCase()}` : "";
    const earned = group.earned > 0 ? ` Плюс доход ${formatAmount(group.earned, currency)}.` : "";
    return `${base}${topPart}.${earned}`;
  }
  if (es) {
    const base = `${spent} en ${count} ${count === 1 ? "entrada" : "entradas"}`;
    const topPart = top ? `, sobre todo ${top[0].toLowerCase()}` : "";
    const earned = group.earned > 0 ? ` Más ${formatAmount(group.earned, currency)} de ingresos.` : "";
    return `${base}${topPart}.${earned}`;
  }
  const base = `${spent} across ${count} ${count === 1 ? "entry" : "entries"}`;
  const topPart = top ? `, mostly ${top[0].toLowerCase()}` : "";
  const earned = group.earned > 0 ? ` Plus ${formatAmount(group.earned, currency)} in.` : "";
  return `${base}${topPart}.${earned}`;
}
