import { describe, expect, it } from "vitest";
import { connect, disconnect, listForPortfolio, save } from "./liabilitySources";
import { checkPortalUrl, fetchCompanyBalance, readCompanyBalance, type Post } from "./lib/portalSource";

const NOW = Date.UTC(2026, 9, 19, 20, 10);
const balance = (difference: string | null, summary = "Balance below what is owed") => JSON.stringify({
  summary, asOf: "2026-10-19T20:10:17.025Z",
  difference: difference === null ? null : { amount: { amount: difference, currency: "EUR", text: "" } },
});
const reply = (text: string, isError = false) => JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError, content: [{ type: "text", text }] } });

describe("reading a portal's company balance", () => {
  it("turns a negative difference into what is owed, and a positive one into nothing owed", () => {
    expect(readCompanyBalance(balance("-80251.11"), NOW)).toEqual({ status: "ok", shortfall: 80251.11, currency: "EUR", asOf: Date.parse("2026-10-19T20:10:17.025Z") });
    expect(readCompanyBalance(balance("1200.50"), NOW)).toMatchObject({ status: "ok", shortfall: 0 });
  });

  it("never turns a difference the portal couldn't complete into zero", () => {
    expect(readCompanyBalance(balance(null, "Owed is not complete: 2 investors not counted"), NOW)).toEqual({ status: "incomplete", message: "Owed is not complete: 2 investors not counted" });
    expect(readCompanyBalance("not json", NOW)).toMatchObject({ status: "incomplete" });
  });

  it("calls the tool with the key in a header only, and reads replies sent as events", async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const post: Post = async (url, headers, body) => { seen.push({ url, headers, body }); return { ok: true, status: 200, text: `event: message\ndata: ${reply(balance("-148602.38"))}\n\n` }; };
    expect(await fetchCompanyBalance("https://portal.example.com/api/mcp", "secret", post, NOW)).toMatchObject({ status: "ok", shortfall: 148602.38 });
    expect(seen[0].url).toBe("https://portal.example.com/api/mcp");
    expect(seen[0].headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(seen[0].body)).toMatchObject({ method: "tools/call", params: { name: "company_balance" } });
  });

  it("says why a reading failed", async () => {
    const answer = (status: number, text = "") => (async () => ({ ok: status < 400, status, text })) as Post;
    expect(await fetchCompanyBalance("https://p.example.com/mcp", undefined, answer(401), NOW)).toMatchObject({ status: "failed", message: expect.stringMatching(/refused/) });
    expect(await fetchCompanyBalance("https://p.example.com/mcp", undefined, answer(200, reply("Tool failed", true)), NOW)).toEqual({ status: "failed", message: "Tool failed" });
    expect(await fetchCompanyBalance("https://p.example.com/mcp", undefined, async () => { throw new TypeError("fetch failed"); }, NOW)).toEqual({ status: "failed", message: "The portal didn't answer: fetch failed" });
  });

  it("accepts only https links to named hosts", () => {
    expect(checkPortalUrl(" https://portal.example.com/api/mcp ")).toBe("https://portal.example.com/api/mcp");
    for (const u of ["http://portal.example.com/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp", "https://[::1]/mcp", "https://user:pw@portal.example.com/", "https://portal.example.com:8443/", "https://intranet/mcp", "nonsense"]) {
      expect(checkPortalUrl(u)).toBeNull();
    }
  });
});

function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  const scheduled: unknown[] = [];
  let sequence = 0;
  let user = "user";
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("users", "viewer", { email: "synthetic-viewer@example.com" });
  seed("memberships", "m1", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("memberships", "m2", { userId: "viewer", portfolioId: "pf", role: "viewer" });
  seed("liabilities", "l1", { portfolioId: "pf", name: "Company shortfall", balance: 148602.38, currency: "EUR" });
  seed("liabilities", "lbtc", { portfolioId: "pf", name: "Parents", balance: 31000, currency: "USD", owedSymbol: "BTC", owedQuantity: 0.4 });
  const db = {
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
  const ctx = { db, scheduler: { runAfter: async (...a: unknown[]) => { scheduled.push(a); } }, auth: { getUserIdentity: async () => ({ subject: user }) } } as any;
  return {
    call: (fn: any, args: object) => fn._handler(ctx, args),
    as: (id: string) => { user = id; },
    row: (id: string) => rows.get(id),
    sources: () => [...rows].filter(([id]) => tables.get(id) === "liabilitySources").map(([, r]) => r),
    scheduled,
  };
}

describe("a debt that follows a portal", () => {
  it("connects for an editor, reads at once, and never shows the key", async () => {
    const f = fixture();
    const { id } = await f.call(connect, { liabilityId: "l1", url: "https://portal.example.com/api/mcp", key: "Bearer secret" });
    expect(f.row(id)).toMatchObject({ key: "secret", url: "https://portal.example.com/api/mcp", portfolioId: "pf" });
    expect(f.scheduled).toHaveLength(1);
    const listed = await f.call(listForPortfolio, { portfolioId: "pf" });
    expect(listed).toEqual([expect.objectContaining({ liabilityId: "l1", host: "portal.example.com", status: null })]);
    expect(JSON.stringify(listed)).not.toContain("secret");
  });

  it("refuses viewers, coin debts and links that aren't https", async () => {
    const f = fixture();
    f.as("viewer");
    await expect(f.call(connect, { liabilityId: "l1", url: "https://portal.example.com/mcp" })).rejects.toThrow();
    f.as("user");
    await expect(f.call(connect, { liabilityId: "lbtc", url: "https://portal.example.com/mcp" })).rejects.toThrow();
    await expect(f.call(connect, { liabilityId: "l1", url: "http://portal.example.com/mcp" })).rejects.toThrow();
    expect(f.sources()).toHaveLength(0);
  });

  it("sets the debt from a complete reading and leaves it from any other", async () => {
    const f = fixture();
    const { id } = await f.call(connect, { liabilityId: "l1", url: "https://portal.example.com/mcp" });
    await f.call(save, { sourceId: id, reading: { status: "ok", shortfall: 80251.11, currency: "EUR", asOf: NOW }, checkedAt: NOW });
    expect(f.row("l1").balance).toBe(80251.11);
    await f.call(save, { sourceId: id, reading: { status: "incomplete", message: "2 investors not counted" }, checkedAt: NOW + 1 });
    expect(f.row("l1").balance).toBe(80251.11);
    expect(f.row(id)).toMatchObject({ status: "incomplete", message: "2 investors not counted", readingAt: NOW });
  });

  it("stops following when the debt is gone or on request, keeping the last value", async () => {
    const f = fixture();
    const { id } = await f.call(connect, { liabilityId: "l1", url: "https://portal.example.com/mcp" });
    await f.call(disconnect, { liabilityId: "l1" });
    expect(f.sources()).toHaveLength(0);
    expect(f.row("l1").balance).toBe(148602.38);
    const again = await f.call(connect, { liabilityId: "l1", url: "https://portal.example.com/mcp" });
    expect(f.sources()).toHaveLength(1);
    expect(id).not.toBe(again.id);
  });
});
