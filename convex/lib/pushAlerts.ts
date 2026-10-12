/**
 * Rules for phone alerts, kept pure so they're tested without a backend. The same things
 * Home's "Needs you" raises reach the phone: at most three a day, never in quiet hours.
 */

export const DAILY_CAP = 3;
export const QUIET_FROM = 22;
export const QUIET_UNTIL = 8;
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Alert = { key: string; title: string; body: string; url: string; rank: number };

/** The hour and day where the person is, from their device's time zone. Unknown zones fall back to UTC. */
export function localClock(now: number, timeZone: string): { hour: number; day: string; minutesIntoDay: number } {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(now)).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour), minute = Number(parts.minute);
    if (Number.isFinite(hour) && Number.isFinite(minute)) return { hour, day: `${parts.year}-${parts.month}-${parts.day}`, minutesIntoDay: hour * 60 + minute };
  } catch { /* fall through */ }
  const d = new Date(now);
  return { hour: d.getUTCHours(), day: d.toISOString().slice(0, 10), minutesIntoDay: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const isQuiet = (hour: number) => hour >= QUIET_FROM || hour < QUIET_UNTIL;

const dayLabel = (ms: number, timeZone: string) => {
  const [, month, day] = localClock(ms, timeZone).day.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

/** Debts due in the next three days. */
export function dueAlerts(liabilities: { id: string; name: string; balance: number; dueDate?: number }[], now: number, timeZone: string): Alert[] {
  return liabilities
    .filter((l) => l.dueDate !== undefined && l.balance > 0 && l.dueDate >= now - DAY / 2 && l.dueDate - now <= 3 * DAY)
    .map((l) => ({ key: `due:${l.id}:${l.dueDate}`, title: `${l.name} is due ${dayLabel(l.dueDate!, timeZone)}`, body: "Pay it on time to avoid fees.", url: `/item/liability/${l.id}`, rank: 0 }));
}

/** Spending limits at 80% and when passed, once each per month. Amounts in another currency are left out, never guessed. */
export function limitAlerts(
  categories: { id: string; name: string; monthlyLimit?: number; currency: string }[],
  spending: { categoryId?: string; amount: number; currency: string }[],
  monthKey: string,
): Alert[] {
  const out: Alert[] = [];
  for (const c of categories) {
    if (!c.monthlyLimit || c.monthlyLimit <= 0) continue;
    const spent = spending.filter((t) => t.categoryId === c.id && t.currency === c.currency).reduce((s, t) => s + Math.abs(t.amount), 0);
    const share = spent / c.monthlyLimit;
    if (share >= 1) out.push({ key: `limit:${c.id}:${monthKey}:100`, title: `${c.name} is over its limit`, body: "Spending passed this month’s limit.", url: "/plan", rank: 1 });
    else if (share >= 0.8) out.push({ key: `limit:${c.id}:${monthKey}:80`, title: `${c.name} is at ${Math.round(share * 100)}% of its limit`, body: "There’s still room, but it’s getting close.", url: "/plan", rank: 2 });
  }
  return out;
}

/** What to send now: nothing in quiet hours, nothing twice, and never more than three a day. */
export function pickToSend(candidates: Alert[], alreadySent: Set<string>, sentToday: number, hour: number): Alert[] {
  if (isQuiet(hour)) return [];
  const room = Math.max(0, DAILY_CAP - sentToday);
  return candidates.filter((a) => !alreadySent.has(a.key)).sort((a, b) => a.rank - b.rank).slice(0, room);
}

export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
