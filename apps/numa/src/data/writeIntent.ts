export class WriteRefusedError extends Error {
  constructor(public readonly reason: 'offline' | 'context' | 'intent', message: string) { super(message); this.name = 'WriteRefusedError'; }
}
export const offlineWriteError = () => new WriteRefusedError('offline', 'You’re offline. Nothing was submitted by this attempt. Reconnect, review the draft, and press Save again. An earlier submitted save may still complete.');
export const staleWriteError = () => new WriteRefusedError('context', 'Your account or space changed. Open this entry again before saving. An earlier submitted save may still complete in its original space.');

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
/** A write as data: the server function's name and its arguments, without the receipt. */
export type Intent = { fn: string; args: Record<string, unknown> };
type Attempt = { fingerprint: string; receipt: string; target?: string; pending?: Promise<unknown>; result?: unknown };
const targetOf = (op: Intent) => (typeof op.args.id === 'string' ? op.args.id : undefined);
export type WriteIntents = <T = string>(op: Intent, submit: (receipt: string) => Promise<T>, receipt?: string) => Promise<T>;

/** Receipt identity belongs to an intent, not a transport attempt. No retries run automatically. */
export function createWriteIntents(newId: (name: string) => string): WriteIntents {
  const objects = new WeakMap<Intent, Attempt>();
  const ambiguous = new Map<string, Attempt>();
  const receipts = new Map<string, Attempt>();
  return async <T,>(op: Intent, submit: (receipt: string) => Promise<T>, receipt?: string): Promise<T> => {
    const fingerprint = canonical(op);
    let attempt = receipt ? receipts.get(receipt) : objects.get(op) ?? ambiguous.get(fingerprint);
    if (attempt && attempt.fingerprint !== fingerprint) throw new WriteRefusedError('intent', 'This save was already attempted with different details. Reopen the original draft before retrying.');
    if (!attempt) attempt = { fingerprint, receipt: receipt ?? newId(`numa.${op.fn}`), target: targetOf(op) };
    objects.set(op, attempt); receipts.set(attempt.receipt, attempt);
    if (attempt.result !== undefined) return attempt.result as T;
    if (attempt.pending) return attempt.pending as Promise<T>;
    const active = attempt;
    ambiguous.set(fingerprint, active);
    // Set the lock before invoking transport, including synchronous failures.
    const pending = Promise.resolve().then(() => submit(active.receipt));
    active.pending = pending;
    try {
      const result = await pending;
      active.result = result;
      if (ambiguous.get(fingerprint) === active) ambiguous.delete(fingerprint);
      // A later confirmed change to the same record supersedes an unclear earlier one: saving those old
      // details again is a new change, not a replay that the server would skip.
      if (active.target !== undefined) for (const [key, other] of ambiguous) if (other.target === active.target && !other.pending) ambiguous.delete(key);
      return result;
    } catch (error) {
      ambiguous.set(fingerprint, active);
      throw error;
    } finally { active.pending = undefined; }
  };
}

const books = new Map<string, WriteIntents>();
/**
 * One receipt book per account (and space, for the writer), shared by every screen for the life of the app.
 * Leaving a screen after a save that may or may not have landed, coming back and saving the same thing
 * again still sends the first receipt, so the server counts it once. That includes saving again after
 * signing back in when a session expired mid-write.
 */
export function sharedWriteIntents(scope: string, newId: (name: string) => string): WriteIntents {
  let book = books.get(scope);
  if (!book) { book = createWriteIntents(newId); books.set(scope, book); }
  return book;
}
/** Tests only. */
export function forgetWriteIntents() { books.clear(); }
