import { describe, expect, it } from "vitest";
import { normalizeHistory, normalizeProposal, PROPOSE_ENTRY_TOOL } from "./lib/askProposals";

const base = {
  kind: "expense", name: "Coffee", amount: 4.5, currency: null, date: null, category: "Dining",
  asset_kind: null, debt_kind: null, holding_kind: null, symbol: null, quantity: null, holding_mode: null,
};

describe("normalizeProposal", () => {
  it("keeps a valid spend and drops fields that belong to other kinds", () => {
    expect(normalizeProposal({ ...base, asset_kind: "cash", symbol: "BTC" })).toEqual({
      kind: "expense", name: "Coffee", amount: 4.5, currency: null, date: null, category: "Dining",
      assetKind: null, debtKind: null, holdingKind: null, symbol: null, quantity: null, holdingMode: null,
    });
  });

  it("never turns a missing or bad amount into zero", () => {
    expect(normalizeProposal({ ...base, amount: null })?.amount).toBeNull();
    expect(normalizeProposal({ ...base, amount: 0 })?.amount).toBeNull();
    expect(normalizeProposal({ ...base, amount: -3 })?.amount).toBeNull();
    expect(normalizeProposal({ ...base, amount: Number.NaN })?.amount).toBeNull();
  });

  it("accepts only real calendar dates", () => {
    expect(normalizeProposal({ ...base, date: "2026-10-03" })?.date).toBe("2026-10-03");
    expect(normalizeProposal({ ...base, date: "2026-02-30" })?.date).toBeNull();
    expect(normalizeProposal({ ...base, date: "3 Oct" })?.date).toBeNull();
  });

  it("needs a symbol for a holding and cleans it", () => {
    const holding = { ...base, kind: "holding", name: "", category: null, holding_kind: "etf", symbol: " voo ", quantity: 10, amount: 500, currency: "USD", holding_mode: "add" };
    expect(normalizeProposal(holding)).toMatchObject({ kind: "holding", name: "VOO", symbol: "VOO", quantity: 10, amount: 500, holdingKind: "etf", holdingMode: "add", category: null });
    expect(normalizeProposal({ ...holding, symbol: null })).toBeNull();
  });

  it("rejects unknown kinds and empty names", () => {
    expect(normalizeProposal({ ...base, kind: "transfer" })).toBeNull();
    expect(normalizeProposal({ ...base, name: "   " })).toBeNull();
    expect(normalizeProposal(null)).toBeNull();
  });
});

describe("normalizeHistory", () => {
  it("starts with the person, alternates and ends with Numa", () => {
    expect(normalizeHistory([
      { role: "assistant", text: "Hi" },
      { role: "user", text: "a" },
      { role: "user", text: "b" },
      { role: "assistant", text: "c" },
      { role: "user", text: "dangling" },
    ])).toEqual([{ role: "user", text: "a\nb" }, { role: "assistant", text: "c" }]);
  });

  it("keeps only the last six turns", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `t${i}` }));
    expect(normalizeHistory(turns).map((t) => t.text)).toEqual(["t4", "t5", "t6", "t7", "t8", "t9"]);
  });
});

describe("propose_entry tool", () => {
  it("requires every property, as strict tools must", () => {
    const schema = PROPOSE_ENTRY_TOOL.input_schema;
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(schema.additionalProperties).toBe(false);
  });
});
