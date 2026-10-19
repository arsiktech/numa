import { describe, expect, it } from "vitest";
import { checkLoanLinks, parseKey } from "./lib/loanLinks";
import { listForPortfolio, set } from "./loanLinks";

// Bounded synthetic DB: the registered handlers with real auth and receipt helpers.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  let user = "user";
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("users", "viewer", { email: "synthetic-viewer@example.com" });
  seed("memberships", "m1", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("memberships", "m2", { userId: "viewer", portfolioId: "pf", role: "viewer" });
  seed("cryptoWallets", "w1", { portfolioId: "pf" });
  seed("cryptoWallets", "w-other", { portfolioId: "other" });
  seed("holdings", "h1", { portfolioId: "pf" });
  seed("assets", "a1", { portfolioId: "pf" });
  seed("liabilities", "l1", { portfolioId: "pf" });
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
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: user }) } } as any;
  return {
    call: (fn: any, args: object) => fn._handler(ctx, args),
    as: (id: string) => { user = id; },
    links: () => [...rows].filter(([id]) => tables.get(id) === "loanLinks").map(([, r]) => r),
  };
}

const LOAN = "defi:w1:base:aave-v3";

describe("loan link keys", () => {
  it("reads wallet keys whose position ids carry colons, and rejects anything else", () => {
    expect(parseKey("defi:w1:arbitrum:compound-v3:0xabc")).toEqual({ kind: "defi", walletId: "w1", inner: "arbitrum:compound-v3:0xabc" });
    expect(parseKey("holding:h1")).toEqual({ kind: "holding", id: "h1" });
    for (const bad of ["", "defi:w1", "holding:a:b", "wallet:w1", "token::x", "asset:../x"]) expect(parseKey(bad)).toBeNull();
  });

  it("keeps one place on one loan, never the loan itself, and collateral only on a recorded debt", () => {
    const others = new Map([["holding:h1", "liability:l1"]]);
    expect(() => checkLoanLinks(LOAN, [{ key: "holding:h1", role: "deployed" }], others)).toThrow(/another loan/);
    expect(() => checkLoanLinks(LOAN, [{ key: LOAN, role: "deployed" }], new Map())).toThrow(/itself/);
    expect(() => checkLoanLinks(LOAN, [{ key: "asset:a1", role: "collateral" }], new Map())).toThrow(/protocol/);
    expect(() => checkLoanLinks("holding:h1", [], new Map())).toThrow(/wallet borrowing or a recorded debt/);
    expect(() => checkLoanLinks(LOAN, [{ key: "asset:a1", role: "deployed" }, { key: "asset:a1", role: "deployed" }], new Map())).toThrow(/twice/);
    expect(checkLoanLinks("liability:l1", [{ key: "holding:h1", role: "collateral" }], others)).toHaveLength(1);
  });
});

describe("loanLinks.set", () => {
  it("saves, replaces and clears one loan's links, once per receipt", async () => {
    const f = fixture();
    await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "defi:w1:optimism:etherfi-cash", role: "deployed" }], clientMutationId: "link-1" });
    await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "defi:w1:optimism:etherfi-cash", role: "deployed" }], clientMutationId: "link-1" });
    expect(f.links()).toHaveLength(1);
    await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "holding:h1", role: "deployed" }, { key: "asset:a1", role: "deployed" }] });
    expect(f.links()[0].targets.map((t: { key: string }) => t.key)).toEqual(["holding:h1", "asset:a1"]);
    expect(await f.call(listForPortfolio, { portfolioId: "pf" })).toEqual([{ loanKey: LOAN, targets: f.links()[0].targets, updatedAt: expect.any(Number) }]);
    await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [] });
    expect(f.links()).toHaveLength(0);
    expect(await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [] })).toBeNull();
  });

  it("refuses a place another loan already has, a record from another space, and a viewer", async () => {
    const f = fixture();
    await f.call(set, { portfolioId: "pf", loanKey: "liability:l1", targets: [{ key: "holding:h1", role: "collateral" }] });
    await expect(f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "holding:h1", role: "deployed" }] })).rejects.toThrow(/another loan/);
    await expect(f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "token:w-other:base:usdc", role: "deployed" }] })).rejects.toThrow(/isn't in this space/);
    await expect(f.call(set, { portfolioId: "pf", loanKey: "liability:nope", targets: [{ key: "asset:a1", role: "collateral" }] })).rejects.toThrow(/isn't in this space/);
    f.as("viewer");
    await expect(f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "asset:a1", role: "deployed" }] })).rejects.toThrow();
    expect(f.links()).toHaveLength(1);
  });

  it("lets a deleted debt's places go, so they can move to another loan", async () => {
    const f = fixture();
    await f.call(set, { portfolioId: "pf", loanKey: "liability:l1", targets: [{ key: "holding:h1", role: "collateral" }] });
    await f.call(set, { portfolioId: "pf", loanKey: "liability:deleted", targets: [] });
    await f.call(set, { portfolioId: "pf", loanKey: "liability:l1", targets: [] });
    await f.call(set, { portfolioId: "pf", loanKey: LOAN, targets: [{ key: "holding:h1", role: "deployed" }] });
    expect(f.links().map((r: { loanKey: string }) => r.loanKey)).toEqual([LOAN]);
  });
});
