import { convexToJson } from "convex/values";
// Synthetic transactional adapter for registered privacy/deletion handlers.
// It verifies handler behavior, not Convex scheduler/OCC/storage runtime semantics.
export function privacyFixture() {
  const rows = new Map<string, any>(), tables = new Map<string, string>();
  const jobs: Array<{ id: string; at: number; args: any; canceled: boolean }> = [];
  const deletedStorage: string[] = [];
  const splitExportTables = new Set<string>();
  let bytesRead = 0, bytesWritten = 0, documentsRead = 0, documentsWritten = 0, queries = 0;
  const byteSize = (row: any) => row ? new TextEncoder().encode(JSON.stringify(convexToJson(row))).byteLength : 0;
  const readRows = <T>(values: T[]): T[] => {
    queries += 1; documentsRead += values.length; bytesRead += values.reduce((sum, row) => sum + byteSize(row), 0);
    if (bytesRead > 16 * 1024 * 1024) throw new Error("Synthetic transaction read-byte limit exceeded");
    return values;
  };
  const wrote = (row: any) => {
    documentsWritten += 1; bytesWritten += byteSize(row);
    if (bytesWritten > 16 * 1024 * 1024) throw new Error("Synthetic transaction write-byte limit exceeded");
  };
  let sequence = 0, actor: string | null = "user", deletes = 0;
  const seed = (table: string, id: string, value: object) => {
    rows.set(id, { _id: id, _creationTime: sequence++, ...value }); tables.set(id, table); return id;
  };
  const all = (table: string) => [...rows].filter(([id]) => tables.get(id) === table).map(([, row]) => structuredClone(row));
  const db = {
    get: async (id: string) => readRows(rows.has(id) ? [structuredClone(rows.get(id))] : [])[0] ?? null,
    insert: async (table: string, value: object) => { wrote(value); return seed(table, `${table}-${++sequence}`, value); },
    patch: async (id: string, patch: Record<string, unknown>) => {
      if (!rows.has(id)) throw new Error("Missing document");
      const row = rows.get(id); readRows([row]);
      for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); }
      wrote(row);
    },
    delete: async (id: string) => { if (rows.has(id)) { deletes++; readRows([rows.get(id)]); wrote(rows.get(id)); } rows.delete(id); tables.delete(id); },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      let descending = false;
      const matching = async () => {
        const values = all(table).filter(row => predicates.every(p => p(row)));
        return descending ? values.reverse() : values;
      };
      const query = {
        async *[Symbol.asyncIterator]() { yield* readRows(await matching()); },
        withIndex: (_name: string, callback?: any) => {
          const builder = {
            eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return builder; },
            gt: (key: string, value: number) => { predicates.push(row => typeof row[key] === "number" && row[key] > value); return builder; },
            lte: (key: string, value: number) => { predicates.push(row => typeof row[key] === "number" && row[key] <= value); return builder; },
          };
          callback?.(builder); return query;
        },
        filter: (callback: any) => {
          const expression = callback({ field: (key: string) => (row: any) => row[key],
            eq: (field: (row: any) => unknown, value: unknown) => (row: any) => field(row) === value });
          predicates.push(expression); return query;
        },
        paginate: async (options: { cursor: string | null; numItems: number }) => {
          const remaining = (await matching()).filter(row => options.cursor === null || row._creationTime > Number(options.cursor));
          const page = readRows(remaining.slice(0, options.numItems));
          return { page, isDone: remaining.length <= page.length,
            continueCursor: page.length ? String(page[page.length - 1]._creationTime) : options.cursor ?? "",
            pageStatus: splitExportTables.has(table) && options.numItems > 1 ? "SplitRequired" : null };
        },
        order: (order: string) => { descending = order === "desc"; return query; },
        collect: async () => readRows(await matching()), take: async (n: number) => readRows((await matching()).slice(0, n)),
        first: async () => readRows((await matching()).slice(0, 1))[0] ?? null,
        unique: async () => { const found = readRows(await matching()); if (found.length > 1) throw new Error("Not unique"); return found[0] ?? null; },
      };
      return query;
    },
  };
  const enqueue = (at: number, args: any) => { const id = `job-${++sequence}`; jobs.push({ id, at, args, canceled: false }); return id; };
  const ctx = {
    db,
    meta: { getTransactionMetrics: async () => {
      const metric = (used: number, max: number) => ({ used, remaining: max - used });
      return { bytesRead: metric(bytesRead, 16 * 1024 * 1024), bytesWritten: metric(bytesWritten, 16 * 1024 * 1024),
        documentsRead: metric(documentsRead, 32000), documentsWritten: metric(documentsWritten, 16000), databaseQueries: metric(queries, 4096),
        functionsScheduled: metric(0, 1000), scheduledFunctionArgsBytes: metric(0, 16 * 1024 * 1024) };
    } },
    auth: { getUserIdentity: async () => actor ? { subject: actor } : null },
    scheduler: {
      runAt: async (at: number, _fn: unknown, args: any) => enqueue(at, args),
      runAfter: async (delay: number, _fn: unknown, args: any) => enqueue(Date.now() + delay, args),
      cancel: async (id: string) => { const job = jobs.find(j => j.id === id); if (job) job.canceled = true; },
    },
    storage: { delete: async (id: string) => { deletedStorage.push(id); } },
  } as any;
  const call = async (registered: any, args: object = {}) => {
    const beforeRows = structuredClone(rows), beforeTables = new Map(tables), beforeJobs = structuredClone(jobs), beforeStorage = [...deletedStorage];
    deletes = 0; bytesRead = 0; bytesWritten = 0; documentsRead = 0; documentsWritten = 0; queries = 0;
    try { return await registered._handler(ctx, args); }
    catch (error) {
      rows.clear(); beforeRows.forEach((v, k) => rows.set(k, v)); tables.clear(); beforeTables.forEach((v, k) => tables.set(k, v));
      jobs.splice(0, jobs.length, ...beforeJobs); deletedStorage.splice(0, deletedStorage.length, ...beforeStorage); throw error;
    }
  };
  seed("users", "user", { email: "qa@example.com", name: "Synthetic QA" });
  return { rows, jobs, deletedStorage, splitExportTables, seed, all, call, signIn: (id: string | null) => { actor = id; }, get deletes() { return deletes; }, get bytesRead() { return bytesRead; }, get bytesWritten() { return bytesWritten; } };
}
