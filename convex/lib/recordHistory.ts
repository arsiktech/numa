import { v, type Infer } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * The change history ("ledger") of the records a person keeps by hand: assets, debts, holdings,
 * tracked wallets, and what happened to a debt. Every write to those tables goes through the
 * database returned by `withRecordHistory`, so the app, the mobile app, connected agents and
 * scheduled jobs are all recorded the same way, and a deleted record keeps its history.
 *
 * Whole-space and whole-account deletion use the plain builders and erase history with the rest.
 */

export const historyValue = v.union(v.string(), v.number(), v.boolean(), v.null());
export type HistoryValue = Infer<typeof historyValue>;

export const recordTypeValidator = v.union(v.literal("asset"), v.literal("liability"), v.literal("holding"), v.literal("wallet"));
export type RecordType = Infer<typeof recordTypeValidator>;

export const historyActionValidator = v.union(
  v.literal("created"), v.literal("changed"), v.literal("deleted"), v.literal("event_added"), v.literal("event_removed")
);

export const historyActorValidator = v.object({
  /** app: the person in Numa Pro. agent: a connected agent, named by its connection. system: a scheduled job. */
  kind: v.union(v.literal("app"), v.literal("agent"), v.literal("system")),
  userId: v.optional(v.id("users")),
  connectionId: v.optional(v.id("agentConnections")),
  name: v.optional(v.string()),
});
export type HistoryActor = Infer<typeof historyActorValidator>;

export const recordChangeFields = {
  portfolioId: v.id("portfolios"),
  at: v.number(),
  recordType: recordTypeValidator,
  recordId: v.string(),
  /** The record's name when the change was made. */
  recordName: v.string(),
  action: historyActionValidator,
  /** For "changed": the field. For a debt event: its kind (borrowed, repaid, ...). */
  field: v.optional(v.string()),
  oldValue: v.optional(historyValue),
  newValue: v.optional(historyValue),
  /** For "created", "deleted" and debt events: the record's fields at that moment. */
  values: v.optional(v.record(v.string(), historyValue)),
  actor: historyActorValidator,
  reason: v.optional(v.string()),
};

type Tracked = "assets" | "liabilities" | "holdings" | "cryptoWallets";

/** What is recorded for each table. Fields left out (timestamps, sync leases, wallet readings) change on their own. */
const TRACKED: Record<Tracked, { type: RecordType; name: string; fields: readonly string[] }> = {
  assets: { type: "asset", name: "name", fields: ["name", "kind", "investmentType", "balance", "currency", "notes", "location", "owedBy", "costBasis", "acquiredAt"] },
  liabilities: { type: "liability", name: "name", fields: [
    "name", "kind", "balance", "currency", "interestRate", "dueDate", "notes", "owedSymbol", "owedQuantity", "counterparty",
    "principal", "startedAt", "dueKind", "interestTerms", "interestDueDay",
  ] },
  holdings: { type: "holding", name: "name", fields: ["symbol", "name", "kind", "quantity", "costBasis", "currency", "acquiredAt", "location"] },
  cryptoWallets: { type: "wallet", name: "label", fields: ["label", "address", "addressType", "includeInNetWorth"] },
};
const TRACKED_TABLES = Object.keys(TRACKED) as Tracked[];
const EVENT_FIELDS = ["kind", "amount", "unit", "principalPart", "interestPart", "feePart", "applied", "occurredAt", "note"] as const;
const SUBJECT_TABLE = { liability: "liabilities", asset: "assets" } as const;

type Row = Record<string, unknown>;
export type RecordChange = Omit<Doc<"recordChanges">, "_id" | "_creationTime">;
type ChangeDraft = Omit<RecordChange, "at" | "actor" | "reason">;

export const REASON_MAX = 500;

/** A trimmed reason, or undefined. Longer than 500 characters is refused, never cut. */
export function parseReason(reason: unknown): string | undefined {
  if (reason === undefined || reason === null) return undefined;
  if (typeof reason !== "string") throw new Error("reason must be text");
  const trimmed = reason.trim();
  if (trimmed.length > REASON_MAX) throw new Error(`reason must be at most ${REASON_MAX} characters`);
  return trimmed || undefined;
}

const asValue = (value: unknown): HistoryValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
};

function valuesOf(row: Row, fields: readonly string[]): Record<string, HistoryValue> {
  const out: Record<string, HistoryValue> = {};
  for (const field of fields) {
    const value = asValue(row[field]);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

const nameOf = (table: Tracked, row: Row) => String(row[TRACKED[table].name] ?? "");

/** The history entries for one write to a tracked table. Pure: same rows in, same entries out. */
export function changesFor(table: Tracked, id: string, before: Row | null, after: Row | null): ChangeDraft[] {
  const { type, fields } = TRACKED[table];
  const row = after ?? before;
  if (!row) return [];
  const base = { portfolioId: row.portfolioId as Id<"portfolios">, recordType: type, recordId: id, recordName: nameOf(table, row) };
  if (!before) return [{ ...base, action: "created", values: valuesOf(row, fields) }];
  if (!after) return [{ ...base, action: "deleted", values: valuesOf(before, fields) }];
  const changes: ChangeDraft[] = [];
  const MONEY_FIELDS = new Set(["balance", "costBasis", "principal"]);
  for (const field of fields) {
    const oldValue = asValue(before[field]);
    const newValue = asValue(after[field]);
    if (oldValue === newValue) continue;
    const currency = MONEY_FIELDS.has(field) ? asValue(after.currency) ?? asValue(before.currency) : undefined;
    changes.push({
      ...base, action: "changed", field,
      ...(oldValue === undefined ? {} : { oldValue }),
      ...(newValue === undefined ? {} : { newValue }),
      ...(typeof currency === "string" ? { values: { currency } } : {}),
    });
  }
  return changes;
}

/** A debt event added or removed, recorded on the debt (or money owed to you) it belongs to. */
export function eventChange(event: Row, subjectName: string, added: boolean): ChangeDraft | null {
  const [kind, subjectId] = String(event.subject ?? "").split(":");
  if ((kind !== "liability" && kind !== "asset") || !subjectId) return null;
  const amount = asValue(event.amount);
  return {
    portfolioId: event.portfolioId as Id<"portfolios">, recordType: kind, recordId: subjectId, recordName: subjectName,
    action: added ? "event_added" : "event_removed", field: String(event.kind),
    ...(amount === undefined ? {} : added ? { newValue: amount } : { oldValue: amount }),
    values: valuesOf(event, EVENT_FIELDS),
  };
}

/** Who is making this change: the person in the app, one of their connected agents, or a scheduled job. */
export async function resolveActor(ctx: Pick<MutationCtx, "auth" | "db">, systemName?: string): Promise<HistoryActor> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return systemName ? { kind: "system", name: systemName } : { kind: "system" };
  const [user, session] = identity.subject.split("|");
  const userId = typeof ctx.db.normalizeId === "function" ? ctx.db.normalizeId("users", user) : null;
  if (!userId) return { kind: "app" };
  if (session) {
    const connections = await ctx.db.query("agentConnections").withIndex("by_user", q => q.eq("userId", userId)).collect();
    const agent = connections.find(c => c.sessionId === session);
    if (agent) return { kind: "agent", userId, connectionId: agent._id, name: agent.name };
  }
  return { kind: "app", userId };
}

type Db = MutationCtx["db"];
type AnyId = Id<TableNames>;

/**
 * `ctx.db` with every write to a tracked table recorded in `recordChanges`, in the same
 * transaction. `reason` is the optional note the caller sent with this mutation.
 */
export function withRecordHistory(ctx: MutationCtx, reason?: string, systemName?: string): Db {
  const db = ctx.db;
  let actor: Promise<HistoryActor> | undefined;
  const tableIs = (table: Tracked | "debtEvents", id: AnyId) => typeof db.normalizeId === "function" && db.normalizeId(table, id) !== null;
  const trackedTable = (id: AnyId): Tracked | null => TRACKED_TABLES.find(t => tableIs(t, id)) ?? null;
  const save = async (drafts: ChangeDraft[]) => {
    if (!drafts.length) return;
    actor ??= resolveActor(ctx, systemName);
    const who = await actor;
    const at = Date.now();
    for (const draft of drafts) await db.insert("recordChanges", { ...draft, at, actor: who, ...(reason ? { reason } : {}) });
  };
  const subjectName = async (event: Row) => {
    const [kind, id] = String(event.subject ?? "").split(":");
    const table = SUBJECT_TABLE[kind as keyof typeof SUBJECT_TABLE];
    const normalized = table ? db.normalizeId(table, id) : null;
    const subject = normalized ? await db.get(normalized) : null;
    if (subject) return String(subject.name);
    // The debt is already gone: name it as its last history entry did.
    const last = await db.query("recordChanges").withIndex("by_record", q => q.eq("portfolioId", event.portfolioId as Id<"portfolios">).eq("recordId", id)).order("desc").first();
    return last?.recordName ?? "";
  };
  /**
   * Runs one write to an existing document and records what it changed. `next` is the document
   * after the write when the caller knows it (patch, replace), which saves reading it again.
   */
  const update = async (id: AnyId, write: () => Promise<void>, next?: (before: Row) => Row) => {
    const table = trackedTable(id);
    const isEvent = !table && tableIs("debtEvents", id);
    if (!table && !isEvent) return write();
    const before = (await db.get(id)) as Row | null;
    await write();
    if (table && before && next) return save(changesFor(table, id, before, next(before)));
    if (isEvent) {
      const after = await db.get(id);
      if (before && !after) {
        const change = eventChange(before, await subjectName(before), false);
        if (change) await save([change]);
      }
      return;
    }
    const after = (await db.get(id)) as Row | null;
    await save(changesFor(table!, id, before, after));
  };
  // Accepts both db.patch(id, value) and db.patch(table, id, value), as Convex does.
  const split = (args: unknown[], valueCount: number): [AnyId, unknown[]] =>
    args.length > valueCount + 1 ? [args[1] as AnyId, args.slice(2)] : [args[0] as AnyId, args.slice(1)];
  // Convex's database (and the test doubles) are plain objects, so the reads carry over as they are.
  const wrapped = {
    ...db,
    async insert(table: string, value: Row) {
      const id = await (db.insert as (t: string, v: Row) => Promise<AnyId>)(table, value);
      if (table in TRACKED) await save(changesFor(table as Tracked, id, null, (await db.get(id)) as Row));
      else if (table === "debtEvents") {
        const change = eventChange(value, await subjectName(value), true);
        if (change) await save([change]);
      }
      return id;
    },
    async patch(...args: unknown[]) {
      const [id, [value]] = split(args, 1);
      const write = () => (db.patch as (...a: unknown[]) => Promise<void>)(...args);
      const fields = Object.keys((value ?? {}) as Row);
      // A patch that touches nothing recorded (a wallet reading, a sync lease, a timestamp) is not read twice.
      const table = trackedTable(id);
      if (table && !fields.some(f => TRACKED[table].fields.includes(f))) return write();
      await update(id, write, before => {
        const after: Row = { ...before };
        for (const [key, v] of Object.entries(value as Row)) { if (v === undefined) delete after[key]; else after[key] = v; }
        return after;
      });
    },
    async replace(...args: unknown[]) {
      const [id, [value]] = split(args, 1);
      await update(id, () => (db.replace as (...a: unknown[]) => Promise<void>)(...args), before => ({ portfolioId: before.portfolioId, ...(value as Row) }));
    },
    async delete(...args: unknown[]) {
      const [id] = split(args, 0);
      await update(id, () => (db.delete as (...a: unknown[]) => Promise<void>)(...args));
    },
  };
  return wrapped as unknown as Db;
}
