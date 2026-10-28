import { createDraftRecoveryStore, RECOVERY_LIMIT_MESSAGE, type AskRecovery } from './draftRecovery';
import { createWriteIntents } from '@/data/writeIntent';
import type { KeyValueStorage } from '@/cloud/storage';

const scope = 'synthetic-user:synthetic-space';
const draft = { type: 'transaction' as const, kind: 'expense' as const, description: 'Synthetic coffee', amountCents: 450, currency: 'EUR' as const, occurredAt: 1, categoryId: null, categoryName: null };
function secureFixture() {
  const data = new Map<string, string>();
  const secure: KeyValueStorage = {
    getItem: jest.fn(async key => data.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { data.set(key, value); }),
    removeItem: jest.fn(async key => { data.delete(key); }),
  };
  return { data, secure };
}
it('recovers chunked Unicode text and frozen receipt in a fresh native store instance', async () => {
  const { secure, data } = secureFixture();
  const apply = { fn: 'createTransaction' as const, args: { portfolioId: 'synthetic-space', amount: 4.5 } };
  const saved: AskRecovery = { text: 'Synthetic résumé 🧾'.repeat(400), drafts: [{ id: 1, draft, intent: { contextKey: scope, clientMutationId: 'same-receipt', apply, undo: { fn: 'deleteTransaction', args: { id: '__created__' } } } }] };
  await createDraftRecoveryStore(secure).write(scope, saved);
  expect(data.size).toBeGreaterThan(2);
  for (const value of data.values()) expect(unescape(encodeURIComponent(value)).length).toBeLessThanOrEqual(1500);
  const recovered = await createDraftRecoveryStore(secure).read(scope);
  expect(recovered).toEqual(saved);
  const newReceipt = jest.fn(() => 'wrong-new-receipt'); const submit = jest.fn(async () => 'record');
  await createWriteIntents(newReceipt)(recovered.drafts[0].intent!.apply, submit, recovered.drafts[0].intent!.clientMutationId);
  expect(submit).toHaveBeenCalledWith('same-receipt'); expect(newReceipt).not.toHaveBeenCalled();
  expect(await createDraftRecoveryStore(secure).read('another-user:synthetic-space')).toEqual({ text: '', drafts: [] });
  expect(await createDraftRecoveryStore(secure).read('synthetic-user:another-space')).toEqual({ text: '', drafts: [] });
});
it('preserves the last committed recovery when a chunk write fails', async () => {
  const { secure } = secureFixture(); const store = createDraftRecoveryStore(secure);
  const old = { text: 'Keep this', drafts: [{ id: 1, draft }] };
  await store.write(scope, old);
  (secure.setItem as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));
  await expect(store.write(scope, { text: 'New edit', drafts: [] })).rejects.toThrow('keychain unavailable');
  expect(await createDraftRecoveryStore(secure).read(scope)).toEqual(old);
});
it('reports oversized recovery without truncating or replacing the previous draft', async () => {
  const { secure } = secureFixture(); const store = createDraftRecoveryStore(secure);
  await store.write(scope, { text: 'Keep this', drafts: [] });
  await expect(store.write(scope, { text: '🧾'.repeat(100_000), drafts: [] })).rejects.toThrow(RECOVERY_LIMIT_MESSAGE);
  expect((await store.read(scope)).text).toBe('Keep this');
});
it('serializes rapid edits so an older write cannot overwrite the newest recovery', async () => {
  const { secure } = secureFixture(); const store = createDraftRecoveryStore(secure);
  await Promise.all([store.write(scope, { text: 'older', drafts: [] }), store.write(scope, { text: 'newest', drafts: [{ id: 1, draft }] })]);
  expect(await createDraftRecoveryStore(secure).read(scope)).toEqual({ text: 'newest', drafts: [{ id: 1, draft }] });
});
it('keeps web recovery in memory only and loses it on a fresh page instance', async () => {
  const store = createDraftRecoveryStore();
  await store.write(scope, { text: 'Synthetic financial text', drafts: [{ id: 1, draft }] });
  expect((await store.read(scope)).drafts).toHaveLength(1);
  expect(await createDraftRecoveryStore().read(scope)).toEqual({ text: '', drafts: [] });
});
it('rejects incomplete secure chunks instead of presenting a partial draft', async () => {
  const { secure, data } = secureFixture(); await createDraftRecoveryStore(secure).write(scope, { text: 'Synthetic', drafts: [{ id: 1, draft }] });
  const chunkKey = [...data.keys()].find(key => /\.0$/.test(key))!;
  data.delete(chunkKey);
  await expect(createDraftRecoveryStore(secure).read(scope)).rejects.toThrow(/recovery/i);
});
