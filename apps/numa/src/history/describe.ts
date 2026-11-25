/** One change-history row from recordHistory:list, and how it reads in a line. */
export type HistoryValue = string | number | boolean | null;
export type RecordChange = {
  _id: string; at: number; recordId: string; recordName: string; recordType?: 'asset' | 'liability' | 'holding' | 'wallet';
  action: 'created' | 'changed' | 'deleted' | 'event_added' | 'event_removed';
  field?: string; oldValue?: HistoryValue; newValue?: HistoryValue; values?: Record<string, HistoryValue>;
  actor: { kind: 'app' | 'agent' | 'system'; name?: string }; reason?: string;
};

type Change = RecordChange;

const FIELD_LABELS: Record<string, string> = {
  name: "Name", label: "Name", kind: "Kind", balance: "Balance", currency: "Currency", notes: "Notes", location: "Kept at",
  owedBy: "Owed by", costBasis: "Cost", acquiredAt: "Bought", investmentType: "Type", interestRate: "APR", dueDate: "Due",
  owedSymbol: "Owed in", owedQuantity: "Quantity owed", counterparty: "Owed to", principal: "Principal", startedAt: "Started",
  dueKind: "Repayment", interestTerms: "Interest", interestDueDay: "Interest day", symbol: "Symbol", quantity: "Quantity",
  address: "Address", addressType: "Network", includeInNetWorth: "In net worth",
};
const DATE_FIELDS = new Set(["acquiredAt", "dueDate", "startedAt"]);
const MONEY_FIELDS = new Set(["balance", "costBasis", "principal"]);
const EVENT_LABELS: Record<string, string> = {
  borrowed: "Borrowed", repaid: "Repaid", lent: "Lent", received: "Received", note: "Note", capitalized: "Interest added",
};
const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF ", JPY: "¥", CAD: "C$", AUD: "A$", RUB: "₽" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const APPLIED_EVENTS = new Set(["borrowed", "repaid", "lent", "received", "capitalized"]);

export type HistoryLine = Pick<Change, "action" | "field" | "oldValue" | "newValue" | "values" | "recordType">;

const empty = (value: HistoryValue | undefined) => value === undefined || value === null || value === "";

/** "25 Nov" this year, "25 Nov 2025" otherwise. Calendar dates, no time. */
export function historyDay(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const year = d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "25 Nov, 14:32" this year, "25 Nov 2025, 14:32" otherwise. Local time. */
export function historyWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${historyDay(ms, now)}, ${time}`;
}

export function money(value: number, currency?: string | null): string {
  const grouped = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const sign = value < 0 ? "−" : "";
  if (currency && SYMBOLS[currency]) return `${sign}${SYMBOLS[currency]}${grouped}`;
  return `${sign}${grouped}${currency ? ` ${currency}` : ""}`;
}

function currencyOf(change: Pick<HistoryLine, "field" | "newValue" | "values">): string | undefined {
  const fromValues = change.values?.currency ?? change.values?.unit;
  if (typeof fromValues === "string" && fromValues) return fromValues;
  if (change.field === "currency" && typeof change.newValue === "string") return change.newValue;
  return undefined;
}

function shown(change: HistoryLine, value: HistoryValue | undefined, field = change.field): string {
  if (empty(value)) return "—";
  if (field && DATE_FIELDS.has(field) && typeof value === "number") return historyDay(value);
  if (typeof value === "number" && field && MONEY_FIELDS.has(field)) return money(value, currencyOf(change));
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function fieldLabel(field: string | undefined, recordType: HistoryLine["recordType"] | undefined): string {
  if (field === "balance") return recordType === "asset" ? "Value" : "Balance";
  return FIELD_LABELS[field ?? ""] ?? field ?? "";
}

/** What changed, in one line. */
export function describeChange(change: HistoryLine): string {
  switch (change.action) {
    case "created": return "Added";
    case "deleted": return "Deleted";
    case "changed": {
      const label = fieldLabel(change.field, change.recordType);
      if (empty(change.newValue)) return `${label} removed`;
      if (empty(change.oldValue)) return `${label} ${shown(change, change.newValue)}`;
      return `${label} ${shown(change, change.oldValue)} → ${shown(change, change.newValue)}`;
    }
    case "event_added":
    case "event_removed": {
      const label = EVENT_LABELS[change.field ?? ""] ?? change.field;
      const amount = change.values?.amount;
      const currency = currencyOf(change);
      const what = amount === undefined || typeof amount !== "number"
        ? label
        : `${label} ${money(amount, currency)}`;
      const line = change.action === "event_added" ? what : `${what} removed`;
      const balance = change.values?.balance;
      return typeof balance === "number" ? `${line} · balance ${money(balance, currency)}` : line;
    }
  }
}

/** Who made it: the app, a connected agent by name, or Numa itself. */
export function actorLabel(actor: Change["actor"]): string {
  if (actor.kind === "agent") return actor.name ?? "Agent";
  if (actor.kind === "system") return actor.name ?? "Numa";
  return "You";
}

const isEvent = (change: Pick<Change, "action" | "field">) =>
  (change.action === "event_added" || change.action === "event_removed") && APPLIED_EVENTS.has(change.field ?? "");
const isBalance = (change: Pick<Change, "action" | "field">) => change.action === "changed" && change.field === "balance";
const sameWho = (a: Pick<Change, "actor" | "reason">, b: Pick<Change, "actor" | "reason">) =>
  a.actor.kind === b.actor.kind && a.actor.name === b.actor.name && (a.reason ?? "") === (b.reason ?? "");

function inferCurrency(entries: Array<Pick<Change, "field" | "newValue" | "values">>): string | undefined {
  for (const entry of entries) {
    const currency = currencyOf(entry);
    if (currency) return currency;
  }
  return undefined;
}

function mergeEventAndBalance<T extends Change>(event: T, balance: T): T {
  const currency = currencyOf(event) ?? currencyOf(balance);
  return {
    ...event,
    at: Math.max(event.at, balance.at),
    values: { ...event.values, balance: balance.newValue ?? null, ...(currency ? { currency, unit: currency } : {}) },
  };
}

/**
 * One row for an applied debt event and the balance change it made, when they were recorded together.
 * Newest first, as the query returns them.
 */
export function presentHistory<T extends Change>(entries: T[]): T[] {
  const currency = inferCurrency(entries);
  const stamped = currency
    ? entries.map((entry) => ({ ...entry, values: { currency, ...entry.values } }))
    : entries;
  const out: T[] = [];
  for (let i = 0; i < stamped.length; i++) {
    const a = stamped[i]!, b = stamped[i + 1];
    const event = b && isEvent(a) ? a : b && isEvent(b) ? b : null;
    const balance = b && isBalance(a) ? a : b && isBalance(b) ? b : null;
    if (event && balance && event !== balance && sameWho(event, balance) && Math.abs(event.at - balance.at) <= 2000) {
      out.push(mergeEventAndBalance(event, balance));
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}
