import { describe, expect, it } from "vitest";
import { add, update } from "./recurring";

// Real registered handlers over a tiny in-memory adapter. Proves validation,
// not live Convex behavior.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  seed("users", "user", {});
  seed("portfolios", "pf", { name: "Studio", defaultCurrency: "USD", ownerId: "user", type: "personal", spaceKind: "business", createdAt: 0 });
  seed("memberships", "member", { userId: "user", portfolioId: "pf", role: "owner" });
  const db = {
    get: async (id: string) => rows.has(id) ? { ...rows.get(id) } : null,
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: Record<string, unknown>) => {
      const next = { ...rows.get(id), ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      rows.set(id, next);
    },
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
  return { rows, call: (fn: any, args: object) => fn._handler(ctx, args) };
}

const rule = {
  portfolioId: "pf", description: "Acme plan", kind: "income", amount: 99, currency: "USD", cadence: "monthly",
  startAt: 0, nextRunAt: 1, active: true, createdAt: 0
};

describe("recurring revenue fields", () => {
  it("stores and clears the MRR opt-in and income source", async () => {
    const f = fixture();
    const { id } = await f.call(add, { ...rule, revenueType: "subscription", incomeSource: "Acme" });
    expect(f.rows.get(id)).toMatchObject({ revenueType: "subscription", incomeSource: "Acme" });
    await f.call(update, { id, patch: { revenueType: null, incomeSource: null } });
    expect(f.rows.get(id).revenueType).toBeUndefined();
    expect(f.rows.get(id).incomeSource).toBeUndefined();
  });

  it("rejects revenue on expenses and malformed sources", async () => {
    const f = fixture();
    await expect(f.call(add, { ...rule, kind: "expense", revenueType: "retainer" })).rejects.toThrow(/Only income/);
    await expect(f.call(add, { ...rule, incomeSource: " padded " })).rejects.toThrow(/Income source/);
    await expect(f.call(add, { ...rule, incomeSource: "x".repeat(81) })).rejects.toThrow(/Income source/);
    const { id } = await f.call(add, { ...rule, revenueType: "retainer" });
    await expect(f.call(update, { id, patch: { kind: "expense" } })).rejects.toThrow(/Only income/);
    await f.call(update, { id, patch: { kind: "expense", revenueType: null } });
    expect(f.rows.get(id).kind).toBe("expense");
  });
});
