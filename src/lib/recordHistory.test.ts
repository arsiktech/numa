import { describe, expect, it } from "vitest";
import { actorLabel, describeChange } from "./recordHistory";

describe("record history lines", () => {
  it("says what changed in one line", () => {
    expect(describeChange({ action: "changed", field: "name", oldValue: "Flat", newValue: "Lisbon flat" })).toBe("Name Flat → Lisbon flat");
    expect(describeChange({ action: "changed", field: "location", newValue: "Bank" })).toBe("Kept at Bank");
    expect(describeChange({ action: "changed", field: "notes", oldValue: "cash in" })).toBe("Notes removed");
    expect(describeChange({ action: "created" })).toBe("Added");
    expect(describeChange({ action: "deleted", values: { balance: 0 } })).toBe("Deleted");
    expect(describeChange({ action: "event_added", field: "repaid", values: { amount: 40, unit: "EUR" } })).toMatch(/^Repaid 40 EUR$/);
    expect(describeChange({ action: "event_removed", field: "note", values: { note: "x" } })).toBe("Note removed");
  });
  it("names who made it", () => {
    expect(actorLabel({ kind: "app" })).toBe("You");
    expect(actorLabel({ kind: "agent", name: "Assistant" })).toBe("Assistant");
    expect(actorLabel({ kind: "system", name: "Company portal" })).toBe("Company portal");
    expect(actorLabel({ kind: "system" })).toBe("Numa");
  });
});
