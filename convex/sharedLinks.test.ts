import { describe, expect, it } from "vitest";
import { update as updateLiability } from "./liabilities";
import { save } from "./sharedLinks";
import { buildMobileDashboard } from "./lib/mobileDashboard";
import { fetchShared, planRecords, readSharedBalances, type Post } from "./lib/sharedBalances";

const NOW = Date.UTC(2026, 10, 25, 12);
const HOUSEHOLD = "household-one-test";

const reading = (lines: Array<[string, string, string]>, your = lines.reduce((sum, [, , minor]) => sum + BigInt(minor), 0n).toString()) => JSON.stringify({
  householdId: HOUSEHOLD, currency: "EUR", exponent: 2, status: "ok", yourMinorUnits: your,
  counterparties: lines.map(([unitId, label, minorUnits]) => ({ unitId, label, minorUnits })),
});

describe("reading Numa Shared balances", () => {
  it("turns a negative counterparty amount into a liability and a positive one into an asset", () => {
    expect(readSharedBalances(reading([["unit-other", "Other", "-1250"]]))).toEqual({
      status: "ok", currency: "EUR", lines: [{ unitId: "unit-other", label: "Other", minorUnits: "-1250" }],
    });
    expect(readSharedBalances(reading([["unit-other", "Other", "800"]])).status).toBe("ok");
    expect(planRecords([], [{ unitId: "unit-other", label: "Other", minorUnits: "-1250" }], "EUR").writes).toEqual([
      { table: "liabilities", unitId: "unit-other", label: "Other", balance: 12.5, currency: "EUR" },
    ]);
    expect(planRecords([], [{ unitId: "unit-other", label: "Other", minorUnits: "800" }], "EUR").writes[0]).toMatchObject({ table: "assets", balance: 8 });
  });

  it("keeps the last value when the read is missing or does not add up", () => {
    expect(readSharedBalances("")).toMatchObject({ status: "stale" });
    expect(readSharedBalances(JSON.stringify({ status: "unavailable" }))).toMatchObject({ status: "stale", message: expect.stringMatching(/couldn't finish/) });
    expect(readSharedBalances(reading([["unit-other", "Other", "-1250"]], "0"))).toMatchObject({ status: "stale", message: expect.stringMatching(/add up/) });
    expect(readSharedBalances(JSON.stringify({ status: "ok", currency: "GBP", exponent: 2, yourMinorUnits: "0", counterparties: [] }))).toMatchObject({ status: "stale", message: expect.stringMatching(/currency/) });
  });

  it("sends the key only as a bearer token and the household in the body", async () => {
    const seen: Array<{ headers: Record<string, string>; body: string }> = [];
    const post: Post = async (_url, headers, body) => { seen.push({ headers, body }); return { ok: true, status: 200, text: reading([["unit-other", "Other", "-1250"]]) }; };
    expect(await fetchShared("https://shared.example.com/pro/balances", "nspro_secret", HOUSEHOLD, post)).toMatchObject({ status: "ok" });
    expect(seen[0].headers.authorization).toBe("Bearer nspro_secret");
    expect(JSON.parse(seen[0].body)).toEqual({ household: HOUSEHOLD });
    const fail: Post = async () => ({ ok: false, status: 404, text: "" });
    expect(await fetchShared("https://shared.example.com/pro/balances", "nspro_secret", HOUSEHOLD, fail)).toMatchObject({ status: "stale", message: expect.stringMatching(/household/) });
  });

  it("updates the same record, drops the other side when the sign flips, and never touches a hand-entered record", () => {
    const held = [
      { id: "manual", table: "liabilities" as const, balance: 999.37, currency: "EUR" as const },
      { id: "synced", table: "liabilities" as const, balance: 12.5, currency: "EUR" as const, unitId: "unit-other" },
    ];
    const again = planRecords(held, [{ unitId: "unit-other", label: "Other", minorUnits: "-1250" }], "EUR");
    expect(again.deletes).toEqual([]);
    expect(again.writes).toEqual([{ id: "synced", table: "liabilities", unitId: "unit-other", label: "Other", balance: 12.5, currency: "EUR" }]);
    const flipped = planRecords(held, [{ unitId: "unit-other", label: "Other", minorUnits: "400" }], "EUR");
    expect(flipped.deletes).toEqual(["synced"]);
    expect(flipped.writes).toEqual([{ table: "assets", unitId: "unit-other", label: "Other", balance: 4, currency: "EUR" }]);
    expect(JSON.stringify(flipped)).not.toContain("manual");
  });
});

function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("memberships", "m1", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("liabilities", "manual", { portfolioId: "pf", name: "Hand entered", balance: 999.37, currency: "EUR", updatedAt: 1 });
  seed("sharedLinks", "link", { portfolioId: "pf", householdId: HOUSEHOLD, token: "nspro_secret", createdBy: "user", createdAt: 1 });
  const db = {
    normalizeId: (table: string, id: string) => (tables.get(id) === table ? id : null),
    get: async (id: string) => (rows.has(id) ? { ...rows.get(id) } : null),
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: object) => { rows.set(id, { ...rows.get(id), ...patch }); },
    delete: async (id: string) => { rows.delete(id); tables.delete(id); },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const collect = async () => [...rows].filter(([id, row]) => tables.get(id) === table && predicates.every((p) => p(row))).map(([, row]) => ({ ...row }));
      const q = {
        withIndex: (_: string, cb: any) => { const b = { eq: (k: string, v: unknown) => { predicates.push((r) => r[k] === v); return b; } }; cb(b); return q; },
        filter: (cb: any) => { predicates.push(cb({ field: (k: string) => k, eq: (k: string, v: unknown) => (r: any) => r[k] === v })); return q; },
        collect, unique: async () => (await collect())[0] ?? null, first: async () => (await collect())[0] ?? null,
      };
      return q;
    },
  };
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: "user" }) } } as any;
  const worth = () => buildMobileDashboard({
    portfolio: { defaultCurrency: "EUR" }, transactions: [], holdings: [], goals: [], nowMs: NOW,
    assets: [...rows].filter(([id]) => tables.get(id) === "assets").map(([, row]) => row),
    liabilities: [...rows].filter(([id]) => tables.get(id) === "liabilities").map(([, row]) => row),
  });
  return {
    call: (fn: any, args: object) => fn._handler(ctx, args),
    row: (id: string) => rows.get(id),
    of: (table: string) => [...rows].filter(([id]) => tables.get(id) === table).map(([, row]) => row),
    worth,
  };
}

const owe = { status: "ok" as const, currency: "EUR" as const, lines: [{ unitId: "unit-other", label: "Other", minorUnits: "-1250" }] };
const owed = { status: "ok" as const, currency: "EUR" as const, lines: [{ unitId: "unit-other", label: "Other", minorUnits: "400" }] };

describe("saving a Numa Shared reading", () => {
  it("adds one liability, counts it once beside a hand-entered debt, and updates that same record", async () => {
    const f = fixture();
    expect(await f.call(save, { linkId: "link", reading: owe, checkedAt: NOW })).toBe(true);
    expect(f.row("manual")).toMatchObject({ balance: 999.37, name: "Hand entered" });
    expect(f.row("manual").sharedSync).toBeUndefined();
    const synced = f.of("liabilities").filter((row) => row.sharedSync);
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ balance: 12.5, currency: "EUR", name: "Numa Shared · Other", sharedSync: { householdId: HOUSEHOLD, unitId: "unit-other", stale: false, readingAt: NOW } });
    expect(f.worth()).toMatchObject({ liabilities: 1011.87, netWorth: -1011.87 });
    expect(await f.call(save, { linkId: "link", reading: owe, checkedAt: NOW + 1 })).toBe(true);
    expect(f.of("liabilities").filter((row) => row.sharedSync)).toHaveLength(1);
    expect(f.of("assets")).toHaveLength(0);
    expect(f.worth().netWorth).toBe(-1011.87);
  });

  it("moves a debt to money owed to you without leaving both, and keeps the last amount when the read fails", async () => {
    const f = fixture();
    await f.call(save, { linkId: "link", reading: owe, checkedAt: NOW });
    expect(await f.call(save, { linkId: "link", reading: owed, checkedAt: NOW + 2 })).toBe(true);
    expect(f.of("liabilities").filter((row) => row.sharedSync)).toHaveLength(0);
    expect(f.of("assets")).toHaveLength(1);
    expect(f.of("assets")[0]).toMatchObject({ balance: 4, sharedSync: { unitId: "unit-other", stale: false } });
    expect(f.row("manual").balance).toBe(999.37);
    expect(f.worth()).toMatchObject({ liabilities: 999.37, netWorth: -995.37 });
    expect(await f.call(save, { linkId: "link", reading: { status: "stale", message: "Numa Shared didn't answer" }, checkedAt: NOW + 3 })).toBe(false);
    expect(f.of("assets")[0]).toMatchObject({ balance: 4, sharedSync: { stale: true, checkedAt: NOW + 3, readingAt: NOW + 2 } });
    expect(f.row("link")).toMatchObject({ status: "stale", message: "Numa Shared didn't answer", readingAt: NOW + 2 });
    expect(f.worth().netWorth).toBe(-995.37);
  });

  it("refuses a hand edit of a synced amount", async () => {
    const f = fixture();
    await f.call(save, { linkId: "link", reading: owe, checkedAt: NOW });
    const synced = f.of("liabilities").find((row) => row.sharedSync);
    await expect(f.call(updateLiability, { id: synced._id, patch: { balance: 1 } })).rejects.toThrow(/Numa Shared/);
    expect(f.row(synced._id).balance).toBe(12.5);
  });
});
