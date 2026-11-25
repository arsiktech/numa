import { describe, expect, it } from "vitest";
import { actorLabel, describeChange, historyWhen, presentHistory } from "./recordHistory";
import type { Doc } from "../../convex/_generated/dataModel";

const at = (hours: number, minutes: number) => new Date(2026, 10, 25, hours, minutes).getTime();

describe("record history lines", () => {
  it("says what changed in one line", () => {
    expect(describeChange({ action: "changed", field: "name", oldValue: "Flat", newValue: "Lisbon flat", recordType: "asset" })).toBe("Name Flat → Lisbon flat");
    expect(describeChange({ action: "changed", field: "location", newValue: "Bank", recordType: "asset" })).toBe("Kept at Bank");
    expect(describeChange({ action: "changed", field: "notes", oldValue: "cash in", recordType: "asset" })).toBe("Notes removed");
    expect(describeChange({ action: "created", recordType: "asset" })).toBe("Added");
    expect(describeChange({ action: "deleted", values: { balance: 0 }, recordType: "liability" })).toBe("Deleted");
    expect(describeChange({ action: "event_added", field: "repaid", values: { amount: 40, unit: "EUR" }, recordType: "liability" })).toBe("Repaid €40");
    expect(describeChange({ action: "event_removed", field: "note", values: { note: "x" }, recordType: "liability" })).toBe("Note removed");
  });

  it("uses the screen's wording and money format", () => {
    expect(describeChange({
      action: "changed", field: "balance", oldValue: 240000, newValue: 255000, recordType: "asset", values: { currency: "EUR" },
    })).toBe("Value €240,000 → €255,000");
    expect(describeChange({
      action: "changed", field: "balance", oldValue: 12000, newValue: 10500, recordType: "liability", values: { currency: "EUR" },
    })).toBe("Balance €12,000 → €10,500");
    expect(describeChange({
      action: "event_added", field: "repaid", values: { amount: 1500, unit: "EUR", balance: 10500 }, recordType: "liability",
    })).toBe("Repaid €1,500 · balance €10,500");
  });

  it("names who made it", () => {
    expect(actorLabel({ kind: "app" })).toBe("You");
    expect(actorLabel({ kind: "agent", name: "Assistant" })).toBe("Assistant");
    expect(actorLabel({ kind: "system", name: "Company portal" })).toBe("Company portal");
    expect(actorLabel({ kind: "system" })).toBe("Numa");
  });

  it("shows the date and time in the screen's day-month style", () => {
    const now = new Date(2026, 10, 25, 18, 0).getTime();
    expect(historyWhen(at(14, 32), now)).toBe("25 Nov, 14:32");
    expect(historyWhen(at(9, 5), now)).toBe("25 Nov, 09:05");
    expect(historyWhen(at(14, 32), new Date(2027, 0, 1).getTime())).toBe("25 Nov 2026, 14:32");
  });

  it("merges an applied repayment with the balance it left", () => {
    const actor = { kind: "app" as const };
    const t = at(14, 32);
    const event = {
      _id: "e1", _creationTime: t, portfolioId: "p" as Doc<"recordChanges">["portfolioId"], at: t,
      recordType: "liability" as const, recordId: "loan", recordName: "Car loan",
      action: "event_added" as const, field: "repaid", values: { amount: 1500, unit: "EUR" },
      actor, reason: "Monthly payment",
    };
    const balance = {
      ...event, _id: "e2", action: "changed" as const, field: "balance",
      oldValue: 12000, newValue: 10500, values: { currency: "EUR" },
    };
    const rows = presentHistory([event, balance] as Doc<"recordChanges">[]);
    expect(rows).toHaveLength(1);
    expect(describeChange(rows[0]!)).toBe("Repaid €1,500 · balance €10,500");
  });
});
