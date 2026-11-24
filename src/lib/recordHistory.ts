import type { Doc } from "../../convex/_generated/dataModel";

type Change = Doc<"recordChanges">;

const FIELD_LABELS: Record<string, string> = {
  name: "Name", label: "Name", kind: "Kind", balance: "Balance", currency: "Currency", notes: "Notes", location: "Kept at",
  owedBy: "Owed by", costBasis: "Cost", acquiredAt: "Bought", investmentType: "Type", interestRate: "APR", dueDate: "Due",
  owedSymbol: "Owed in", owedQuantity: "Quantity owed", counterparty: "Owed to", principal: "Principal", startedAt: "Started",
  dueKind: "Repayment", interestTerms: "Interest", interestDueDay: "Interest day", symbol: "Symbol", quantity: "Quantity",
  address: "Address", addressType: "Network", includeInNetWorth: "In net worth",
};
const DATE_FIELDS = new Set(["acquiredAt", "dueDate", "startedAt"]);
const EVENT_LABELS: Record<string, string> = {
  borrowed: "Borrowed", repaid: "Repaid", lent: "Lent", received: "Received", note: "Note", capitalized: "Interest added",
};

export const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function shown(field: string | undefined, value: Change["oldValue"]): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field && DATE_FIELDS.has(field) && typeof value === "number") return day(value);
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

/** What changed, in one line. */
export function describeChange(change: Pick<Change, "action" | "field" | "oldValue" | "newValue" | "values">): string {
  switch (change.action) {
    case "created": return "Added";
    case "deleted": return "Deleted";
    case "changed": {
      const label = FIELD_LABELS[change.field ?? ""] ?? change.field;
      const empty = (value: Change["oldValue"]) => value === undefined || value === null || value === "";
      if (empty(change.newValue)) return `${label} removed`;
      if (empty(change.oldValue)) return `${label} ${shown(change.field, change.newValue)}`;
      return `${label} ${shown(change.field, change.oldValue)} → ${shown(change.field, change.newValue)}`;
    }
    case "event_added":
    case "event_removed": {
      const label = EVENT_LABELS[change.field ?? ""] ?? change.field;
      const amount = change.values?.amount;
      const what = amount === undefined ? label : `${label} ${shown(undefined, amount)} ${change.values?.unit ?? ""}`.trim();
      return change.action === "event_added" ? what : `${what} removed`;
    }
  }
}

/** Who made it: the app, a connected agent by name, or Numa itself. */
export function actorLabel(actor: Change["actor"]): string {
  if (actor.kind === "agent") return actor.name ?? "Agent";
  if (actor.kind === "system") return actor.name ?? "Numa";
  return "You";
}

