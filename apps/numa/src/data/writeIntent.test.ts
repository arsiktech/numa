import { createWriteIntents } from './writeIntent';
import type { Op } from '@/ask/plan';
const op = (): Op => ({ fn: 'createTransaction', args: { portfolioId: 'synthetic-space', amount: 4, description: 'Synthetic' } });
it('reuses the original receipt when a retry reconstructs the same operation', async () => {
  const ids = jest.fn(() => 'original'); const run = createWriteIntents(ids);
  const first = jest.fn(async () => { throw new Error('ambiguous'); });
  await expect(run(op(), first)).rejects.toThrow('ambiguous');
  const retry = jest.fn(async () => 'record'); await run(op(), retry);
  expect(first).toHaveBeenCalledWith('original'); expect(retry).toHaveBeenCalledWith('original'); expect(ids).toHaveBeenCalledTimes(1);
});
it('does not merge two explicitly distinct intents with identical financial details', async () => {
  const run = createWriteIntents(() => 'unused'); const submit = jest.fn(async () => 'record');
  await run(op(), submit, 'intent-one'); await run(op(), submit, 'intent-two');
  expect(submit.mock.calls).toEqual([['intent-one'], ['intent-two']]);
});
it('rejects altered details on a previously attempted identity', async () => {
  const run = createWriteIntents(() => 'unused'); const submit = jest.fn(async () => { throw new Error('ambiguous'); });
  const intent = op(); await expect(run(intent, submit, 'same-intent')).rejects.toThrow('ambiguous');
  intent.args.amount = 99;
  await expect(run(intent, submit, 'same-intent')).rejects.toThrow(/different details/i);
  expect(submit).toHaveBeenCalledTimes(1);
});
it('joins reconstructed duplicate taps while the first transport is pending', async () => {
  const run = createWriteIntents(() => 'original'); let finish!: (id: string) => void;
  const submit = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const first = run(op(), submit), duplicate = run(op(), submit);
  await Promise.resolve(); expect(submit).toHaveBeenCalledTimes(1);
  finish('record'); await expect(first).resolves.toBe('record'); await expect(duplicate).resolves.toBe('record');
});
