import { Platform } from 'react-native';
import { storage, type KeyValueStorage } from '@/cloud/storage';
import type { DraftSaveIntent } from './draftSave';
import type { Draft } from './parse';

export type RecoveryDraft = { id: number; draft: Draft; intent?: DraftSaveIntent };
export type AskRecovery = { text: string; drafts: RecoveryDraft[] };
const EMPTY = (): AskRecovery => ({ text: '', drafts: [] });
const CHUNK_BYTES = 1500; // Below the historical 2048-byte SecureStore value limit, including non-ASCII input.
const MAX_CHUNKS = 64;
export const RECOVERY_LIMIT_MESSAGE = 'This draft is too large for secure recovery. Keep Ask open and shorten it before leaving. Nothing was truncated.';
export const RECOVERY_ERROR_MESSAGE = 'Couldn’t update secure draft recovery. Keep Ask open and try again before leaving.';

type Manifest = { version: 1; generation: string; count: number };
function manifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  const m = JSON.parse(raw);
  if (m.version !== 1 || typeof m.generation !== 'string' || !/^[a-z0-9]+$/.test(m.generation) || !Number.isInteger(m.count) || m.count < 1 || m.count > MAX_CHUNKS) throw new Error(RECOVERY_ERROR_MESSAGE);
  return m;
}
function chunksOf(value: string): string[] {
  const chunks: string[] = []; let chunk = '', bytes = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) { chunks.push(chunk); chunk = ''; bytes = 0; }
    chunk += ch; bytes += size;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS) throw new Error(RECOVERY_LIMIT_MESSAGE);
  return chunks;
}
const keyOf = (scope: string) => `numa.ask.draft.v1.${Array.from(scope).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('')}`;
const currency = (v: unknown) => v === 'EUR' || v === 'USD';
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function validDraft(d: any): d is Draft {
  if (!d || !currency(d.currency)) return false;
  if (d.type === 'transaction') return ['income', 'expense'].includes(d.kind) && typeof d.description === 'string' && finite(d.amountCents) && finite(d.occurredAt) && (d.categoryId === null || typeof d.categoryId === 'string') && (d.categoryName === null || typeof d.categoryName === 'string');
  const existing = d.existing;
  if (existing !== null && (!existing || typeof existing.id !== 'string' || typeof existing.name !== 'string' || !currency(existing.currency))) return false;
  if (d.type === 'asset') return typeof d.name === 'string' && ['cash', 'real_estate', 'vehicle', 'collectible', 'business', 'other'].includes(d.assetKind) && finite(d.amountCents) && (!existing || (finite(existing.balanceCents) && typeof existing.kind === 'string'));
  if (d.type === 'debt') return typeof d.name === 'string' && typeof d.debtKind === 'string' && finite(d.amountCents) && (d.dueDate === null || finite(d.dueDate)) && (!existing || (finite(existing.balanceCents) && typeof existing.kind === 'string' && (existing.dueDate === null || finite(existing.dueDate))));
  return d.type === 'holding' && typeof d.name === 'string' && typeof d.symbol === 'string' && typeof d.holdingKind === 'string' && ['add', 'set'].includes(d.mode) && finite(d.quantity) && (d.priceCents === null || finite(d.priceCents)) && (!existing || (finite(existing.quantity) && finite(existing.costBasisCents) && finite(existing.acquiredAt) && typeof existing.kind === 'string'));
}
const WRITE_NAMES = ['createTransaction', 'updateTransaction', 'deleteTransaction', 'upsertAsset', 'deleteAsset', 'upsertLiability', 'deleteLiability', 'upsertHolding', 'deleteHolding', 'upsertGoal', 'removeGoal', 'updateCategory', 'addSnapshot', 'updateSnapshot', 'removeSnapshot'];
const validOp = (op: any) => op && WRITE_NAMES.includes(op.fn) && op.args && typeof op.args === 'object' && !Array.isArray(op.args);
function decode(raw: string, scope: string): AskRecovery {
  const value = JSON.parse(raw);
  if (value.version !== 1 || value.scope !== scope || typeof value.text !== 'string' || !Array.isArray(value.drafts) || !value.drafts.every((d: any) => Number.isSafeInteger(d.id) && d.id > 0 && validDraft(d.draft) && (!d.intent || (d.intent.contextKey === scope && typeof d.intent.clientMutationId === 'string' && d.intent.clientMutationId.length > 0 && validOp(d.intent.apply) && validOp(d.intent.undo))))) throw new Error(RECOVERY_ERROR_MESSAGE);
  if (new Set(value.drafts.map((d: RecoveryDraft) => d.id)).size !== value.drafts.length) throw new Error(RECOVERY_ERROR_MESSAGE);
  return { text: value.text, drafts: value.drafts };
}

/** Native uses copy-on-write SecureStore chunks. Web deliberately keeps financial text in memory only. */
export function createDraftRecoveryStore(secure?: KeyValueStorage) {
  const memory = new Map<string, string>();
  const queues = new Map<string, Promise<void>>();
  let serial = 0;
  async function read(scope: string): Promise<AskRecovery> {
    await queues.get(scope);
    if (!secure) { const raw = memory.get(scope); return raw ? decode(raw, scope) : EMPTY(); }
    const key = keyOf(scope);
    const m = manifest(await secure.getItem(key));
    if (!m) return EMPTY();
    const chunks = await Promise.all(Array.from({ length: m.count }, (_, i) => secure.getItem(`${key}.${m.generation}.${i}`)));
    if (chunks.some(c => c === null)) throw new Error(RECOVERY_ERROR_MESSAGE);
    return decode(chunks.join(''), scope);
  }
  function write(scope: string, value: AskRecovery): Promise<void> {
    // Snapshot before asynchronous work so subsequent editor changes cannot alter an in-flight save.
    const raw = JSON.stringify({ version: 1, scope, ...value });
    let chunks: string[];
    try { chunks = chunksOf(raw); } catch (error) { return Promise.reject(error); }
    const job = (queues.get(scope) ?? Promise.resolve()).then(async () => {
      if (!secure) { memory.set(scope, raw); return; }
      const key = keyOf(scope), previous = manifest(await secure.getItem(key));
      const generation = `${Date.now().toString(36)}${(++serial).toString(36)}${Math.random().toString(36).slice(2)}`;
      try {
        for (const [i, chunk] of chunks.entries()) await secure.setItem(`${key}.${generation}.${i}`, chunk);
        await secure.setItem(key, JSON.stringify({ version: 1, generation, count: chunks.length }));
      } catch (error) {
        await Promise.all(chunks.map((_, i) => secure.removeItem(`${key}.${generation}.${i}`).catch(() => {})));
        throw error;
      }
      // Cleanup failure must not turn a committed snapshot into an apparent failed save.
      if (previous) await Promise.all(Array.from({ length: previous.count }, (_, i) => secure.removeItem(`${key}.${previous.generation}.${i}`).catch(() => {})));
    });
    const tail = job.catch(() => {});
    queues.set(scope, tail);
    void tail.then(() => { if (queues.get(scope) === tail) queues.delete(scope); });
    return job;
  }
  return { read, write };
}
export const askDraftRecovery = createDraftRecoveryStore(Platform.OS === 'web' ? undefined : storage);
