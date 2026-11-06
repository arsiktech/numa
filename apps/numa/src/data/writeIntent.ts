import type { Op } from '@/ask/plan';

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
type Attempt = { fingerprint: string; receipt: string; pending?: Promise<string>; result?: string };

/** Receipt identity belongs to an intent, not a transport attempt. No retries run automatically. */
export function createWriteIntents(newId: (name: string) => string) {
  const objects = new WeakMap<Op, Attempt>();
  const ambiguous = new Map<string, Attempt>();
  const receipts = new Map<string, Attempt>();
  return async (op: Op, submit: (receipt: string) => Promise<string>, receipt?: string): Promise<string> => {
    const fingerprint = canonical(op);
    let attempt = receipt ? receipts.get(receipt) : objects.get(op) ?? ambiguous.get(fingerprint);
    if (attempt && attempt.fingerprint !== fingerprint) throw new WriteRefusedError('intent', 'This save was already attempted with different details. Reopen the original draft before retrying.');
    if (!attempt) attempt = { fingerprint, receipt: receipt ?? newId(`numa.${op.fn}`) };
    objects.set(op, attempt); receipts.set(attempt.receipt, attempt);
    if (attempt.result !== undefined) return attempt.result;
    if (attempt.pending) return attempt.pending;
    const active = attempt;
    ambiguous.set(fingerprint, active);
    // Set the lock before invoking transport, including synchronous failures.
    const pending = Promise.resolve().then(() => submit(active.receipt));
    active.pending = pending;
    try {
      const result = await pending;
      active.result = result;
      if (ambiguous.get(fingerprint) === active) ambiguous.delete(fingerprint);
      return result;
    } catch (error) {
      ambiguous.set(fingerprint, active);
      throw error;
    } finally { active.pending = undefined; }
  };
}
