import { describe, expect, it } from "vitest";
import { add, update } from "./settlements";

// Real registered handlers over a tiny in-memory adapter. Proves validation,
// not live Convex behavior.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  for (const id of ["user", "partner", "stranger"]) seed("users", id, {});
  seed("memberships", "m-user", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("memberships", "m-partner", { userId: "partner", portfolioId: "pf", role: "editor" });
  seed("memberships", "m-stranger", { userId: "stranger", portfolioId: "other", role: "owner" });
  const db = {
    get: async (id: string) => rows.has(id) ? { ...rows.get(id) } : null,
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: Record<string, unknown>) => { rows.set(id, { ...rows.get(id), ...patch }); },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const collect = async () => [...rows].filter(([id, row]) => tables.get(id) === table && predicates.every(p => p(row))).map(([, row]) => ({ ...row }));
      const query = {
        withIndex: (_index: string, callback: any) => {
          const builder = { eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return builder; } };
          callback(builder); return query;
        },
        filter: (callback: any) => { predicates.push(callback({ field: (key: string) => key, eq: (key: string, value: unknown) => (row: any) => row[key] === value })); return query; },
        collect,
        first: async () => (await collect())[0] ?? null,
        unique: async () => (await collect())[0] ?? null
      };
      return query;
    }
  };
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: "user" }) } } as any;
  return { rows, seed, call: (fn: any, args: object) => fn._handler(ctx, args) };
}

const settlement = { portfolioId: "pf", fromUserId: "user", toUserId: "partner", amount: 50, currency: "EUR", occurredAt: 1 };

describe("legacy settlements", () => {
  it("rejects bad amounts, self-settlement and non-members on add", async () => {
    const f = fixture();
    for (const amount of [0, -50, NaN, Infinity, 1.005]) {
      await expect(f.call(add, { ...settlement, amount })).rejects.toThrow();
    }
    await expect(f.call(add, { ...settlement, toUserId: "user" })).rejects.toThrow(/must be different/);
    await expect(f.call(add, { ...settlement, toUserId: "stranger" })).rejects.toThrow(/members/);
    await expect(f.call(add, { ...settlement, fromUserId: "stranger" })).rejects.toThrow(/members/);
    const { id } = await f.call(add, { ...settlement, amount: 12.34 });
    expect(f.rows.get(id)).toMatchObject({ amount: 12.34, fromUserId: "user", toUserId: "partner" });
  });

  it("checks only the fields an update changes", async () => {
    const f = fixture();
    // A historical row: sub-cent amount, recipient has since left the portfolio.
    f.seed("settlements", "old", { ...settlement, toUserId: "stranger", amount: 10.005 });
    await f.call(update, { id: "old", patch: { note: "Paid in cash", amount: 10.005, toUserId: "stranger" } });
    expect(f.rows.get("old").note).toBe("Paid in cash");
    await expect(f.call(update, { id: "old", patch: { amount: -1 } })).rejects.toThrow();
    await expect(f.call(update, { id: "old", patch: { toUserId: "user" } })).rejects.toThrow(/must be different/);
    await expect(f.call(update, { id: "old", patch: { fromUserId: "stranger" } })).rejects.toThrow(/must be different/);
    await f.call(update, { id: "old", patch: { toUserId: "partner", amount: 10 } });
    expect(f.rows.get("old")).toMatchObject({ toUserId: "partner", amount: 10 });
    await expect(f.call(update, { id: "old", patch: { fromUserId: "stranger" } })).rejects.toThrow(/members/);
  });
});
