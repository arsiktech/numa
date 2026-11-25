/** Change history, end to end, against a LOCAL Convex backend only (`npx convex dev` on a local
 * deployment). Signs up a throwaway account, connects an agent, and through the real /mcp endpoint
 * creates, renames, edits and deletes an asset and a debt, adds a debt event, then reads it all
 * back with get_ledger. Also makes one change from the app side to check who made it, lists the deleted
 * records, saves wallet readings as the scheduled sync does, and runs the backfill twice over a record
 * imported without history.
 * Usage: node scripts/verify-record-history-local.mjs   (reads VITE_CONVEX_URL / VITE_CONVEX_SITE_URL from .env.local)
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const cloud = env.VITE_CONVEX_URL, site = env.VITE_CONVEX_SITE_URL;
for (const url of [cloud, site]) if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "")) throw new Error("Local backend only: VITE_CONVEX_URL and VITE_CONVEX_SITE_URL must be http://127.0.0.1");

const app = new ConvexHttpClient(cloud);
const email = `history-${Date.now()}@example.com`;
const auth = await app.action("auth:signIn", { provider: "password", params: { flow: "signUp", email, password: `Q7!${randomBytes(18).toString("base64url")}b`, name: "History QA" } });
assert.ok(auth.tokens?.token, "local sign-up returns a session");
app.setAuth(auth.tokens.token);
const space = await app.mutation("spaces:create", { name: "History QA", spaceKind: "personal", currency: "EUR", clientMutationId: randomUUID() });
const portfolioId = space.id;
const agent = await app.mutation("agentAccess:connect", { name: "Assistant (QA)", access: "full" });

let rpcId = 0;
async function tool(name, args = {}) {
  const response = await fetch(`${site}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agent.secret}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: { space_id: portfolioId, ...args } } }) });
  const body = await response.json();
  if (body.error || body.result?.isError) throw new Error(`${name}: ${body.error?.message ?? body.result.content[0].text}`);
  return body.result.structuredContent;
}
const idOf = (result) => result.id ?? result.result?.id ?? result.result;
const checks = [];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };

const listed = await (await fetch(`${site}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agent.secret}` },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }) })).json();
const tools = Object.fromEntries(listed.result.tools.map(t => [t.name, t]));
assert.equal(tools.get_ledger.annotations.readOnlyHint, true);
assert.ok(tools.save_asset.inputSchema.properties.reason && tools.delete_liability.inputSchema.properties.reason && !tools.refresh_wallet.inputSchema.properties.reason);
pass("tools/list offers get_ledger (read-only) and a reason on write tools");

// Asset: create, rename, edit value, delete — all through the agent.
const asset = idOf(await tool("save_asset", { name: "Flat", kind: "real_estate", balance: 35000 }));
await tool("save_asset", { id: asset, name: "Lisbon flat (cash in)", kind: "real_estate", balance: 35000, reason: "it is the cash put in, not the value" });
await tool("save_asset", { id: asset, name: "Lisbon flat (cash in)", kind: "real_estate", balance: 40000, reason: "November payment" });
await tool("delete_asset", { id: asset, reason: "QA cleanup" });

// Debt: create, an applied repayment, an edit from the app, delete.
const debt = idOf(await tool("save_liability", { name: "Friend loan USDT", kind: "loan", balance: 100, who: "A friend" }));
await tool("record_debt_event", { debt: `liability:${debt}`, kind: "repaid", amount: 100, unit: "EUR", date: new Date().toISOString().slice(0, 10), apply: true, reason: "paid back" });
await app.mutation("mobile:upsertLiability", { id: debt, portfolioId, name: "Friend loan", kind: "loan", balance: 0, currency: "EUR", clientMutationId: randomUUID() });
await tool("delete_liability", { id: debt, reason: "nothing left" });

const assetHistory = (await tool("get_ledger", { record: asset })).entries.reverse();
assert.deepEqual(assetHistory.map(e => [e.action, e.field ?? null, e.old ?? null, e.new ?? null]), [
  ["created", null, null, null],
  ["changed", "name", "Flat", "Lisbon flat (cash in)"],
  ["changed", "balance", 35000, 40000],
  ["deleted", null, null, null],
]);
assert.equal(assetHistory[1].reason, "it is the cash put in, not the value");
assert.equal(assetHistory[3].values.balance, 40000);
for (const e of assetHistory) assert.deepEqual(e.by, { kind: "agent", name: "Assistant (QA)" });
pass("asset: created, renamed, value edited and deleted, each with old and new value, the agent's name and the reason");

const debtHistory = (await tool("get_ledger", { record: debt })).entries.reverse();
assert.deepEqual(debtHistory.map(e => [e.action, e.field ?? null, e.by.kind]), [
  ["created", null, "agent"],
  ["changed", "balance", "agent"],
  ["event_added", "repaid", "agent"],
  ["changed", "name", "app"],
  ["deleted", null, "agent"],
]);
assert.equal(debtHistory[2].reason, "paid back");
assert.equal(debtHistory[4].record.name, "Friend loan");
pass("debt: the repayment event and its balance change, a rename from the app (named as the app), and the deletion, still readable after it was deleted");

const types = (await tool("get_ledger", { type: "liability" })).entries;
assert.ok(types.length === debtHistory.length && types.every(e => e.record.type === "liability"));
const today = new Date().toISOString().slice(0, 10);
assert.equal((await tool("get_ledger", { from: today, to: today })).entries.length >= assetHistory.length + debtHistory.length, true);
assert.equal((await tool("get_ledger", { from: "2001-01-01", to: "2001-12-31" })).entries.length, 0);
pass("get_ledger filters by type and by date");

// A deploy key in the environment would point the Convex CLI at that deployment instead of the local one.
const localCliEnv = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
delete localCliEnv.CONVEX_DEPLOY_KEY;
const cli = (...args) => execFileSync("npx", ["convex", ...args], { encoding: "utf8", env: localCliEnv, stdio: ["ignore", "pipe", "pipe"] });
const lastJson = (text) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

const gone = await app.query("recordHistory:deleted", { portfolioId });
assert.deepEqual(gone.map(r => [r.recordName, r.recordType]), [["Friend loan", "liability"], ["Lisbon flat (cash in)", "asset"]]);
assert.equal(gone[1].values.balance, 40000);
pass("the Deleted list shows both deleted records, newest first, with their last values");

// Wallet readings, saved as the scheduled sync saves them (no signed-in person, so "Wallet sync").
const walletId = await app.mutation("cryptoWallets:add", { portfolioId, address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", addressType: "bitcoin", label: "Cold wallet", includeInNetWorth: true, clientMutationId: randomUUID() });
const wid = typeof walletId === "string" ? walletId : walletId.id;
const later = Date.now() + 3_600_000; // newer than any reading the real sync may save meanwhile
const reading = (total, n, partial = false) => JSON.stringify({ walletId: wid, snapshot: {
  provider: "public", addressType: "bitcoin", tokenValueUsd: total, defiValueUsd: 0, debtValueUsd: 0, totalValueUsd: total,
  tokens: [], defiPositions: [], chains: ["bitcoin"], failedChains: partial ? ["bitcoin"] : [], tokensFetchedAt: later + n, updatedAt: later + n, partial } });
cli("run", "walletSync:saveSnapshot", reading(1000.004, 1));
cli("run", "walletSync:saveSnapshot", reading(1000.001, 2));
cli("run", "walletSync:saveSnapshot", reading(400, 3, true));
cli("run", "walletSync:saveSnapshot", reading(1250.5, 4));
const walletValues = (await tool("get_ledger", { record: wid })).entries.filter(e => e.field === "value");
const mine = walletValues.filter(e => e.new === 1000 || e.new === 1250.5);
assert.equal(mine.length, 2, "one entry per changed value, none for the same value or a partial reading");
assert.deepEqual([walletValues[0].old, walletValues[0].new, walletValues[0].values.currency, walletValues[0].by], [1000, 1250.5, "USD", { kind: "system", name: "Wallet sync" }]);
pass("wallet readings: one entry when the value changes, none for the same value or a partial reading, named Wallet sync");

// Backfill: a record put in without any history (as every record from before the history was),
// then the backfill twice. The first adds its Added entry, dated when it was made; the second adds nothing.
const dir = mkdtempSync(join(tmpdir(), "history-backfill-"));
writeFileSync(join(dir, "assets.jsonl"), JSON.stringify({ portfolioId, name: "Imported flat", kind: "real_estate", balance: 1000, currency: "EUR", updatedAt: Date.now() }) + "\n");
cli("import", "--table", "assets", "--append", "--yes", join(dir, "assets.jsonl"));
const imported = cli("data", "assets", "--format", "jsonLines", "--limit", "8000").split("\n").filter(l => l.startsWith("{")).map(l => JSON.parse(l))
  .find(row => row.portfolioId === portfolioId && row.name === "Imported flat");
assert.ok(imported, "imported record is there");
assert.equal((await tool("get_ledger", { record: imported._id })).entries.length, 0);
const first = lastJson(cli("run", "recordHistory:backfill"));
const second = lastJson(cli("run", "recordHistory:backfill"));
assert.ok(first.added >= 1 && second.added === 0, `backfill added ${first.added}, then ${second.added}`);
const backfilled = (await tool("get_ledger", { record: imported._id })).entries;
assert.equal(backfilled.length, 1);
assert.deepEqual([backfilled[0].action, backfilled[0].by, backfilled[0].record.name, backfilled[0].at], ["created", { kind: "system", name: "Backfill" }, "Imported flat", new Date(imported._creationTime).toISOString()]);
pass(`backfill: one Added entry dated when the record was made, by Backfill; a second run added ${second.added} (first run added ${first.added})`);

// Cleanup: removing the throwaway space removes its history too (read straight from the local table).
const storedRows = () => execFileSync("npx", ["convex", "data", "recordChanges", "--format", "jsonLines", "--limit", "8000"], { encoding: "utf8", env: localCliEnv })
  .split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line)).filter(row => row.portfolioId === portfolioId);
assert.ok(storedRows().length >= assetHistory.length + debtHistory.length);
await app.mutation("portfolios:remove", { id: portfolioId, clientMutationId: randomUUID() });
assert.equal(storedRows().length, 0);
pass("deleting the whole space removes its history rows");
console.log(`${checks.length} checks passed against ${cloud}`);
