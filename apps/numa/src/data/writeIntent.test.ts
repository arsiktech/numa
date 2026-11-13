import { createWriteIntents, forgetWriteIntents, sharedWriteIntents } from './writeIntent';
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

describe('shared receipt books', () => {
  beforeEach(() => forgetWriteIntents());
  it('a retry from a reopened screen, or after signing back in, reuses the first receipt', async () => {
    const ids = jest.fn(() => 'first-receipt');
    const failed = jest.fn(async () => { throw new Error('connection lost'); });
    await expect(sharedWriteIntents('user-a:space-a', ids)(op(), failed)).rejects.toThrow('connection lost');
    // The screen is gone; a new one asks for the book again and saves the same entry.
    const retry = jest.fn(async () => 'record');
    await expect(sharedWriteIntents('user-a:space-a', ids)(op(), retry)).resolves.toBe('record');
    expect(retry).toHaveBeenCalledWith('first-receipt');
    expect(ids).toHaveBeenCalledTimes(1);
  });
  it('keeps accounts and spaces apart', async () => {
    let n = 0; const ids = () => `receipt-${++n}`;
    const submit = jest.fn(async () => { throw new Error('ambiguous'); });
    await expect(sharedWriteIntents('user-a:space-a', ids)(op(), submit)).rejects.toThrow();
    await expect(sharedWriteIntents('user-b:space-a', ids)(op(), submit)).rejects.toThrow();
    expect(submit.mock.calls).toEqual([['receipt-1'], ['receipt-2']]);
  });
  it('a later confirmed change to the same record makes the old details a new change, not a skipped replay', async () => {
    let n = 0; const run = createWriteIntents(() => `receipt-${++n}`);
    const edit = (amount: number): Op => ({ fn: 'updateTransaction', args: { id: 'tx-1', amount } });
    await expect(run(edit(10), async () => { throw new Error('ambiguous'); })).rejects.toThrow();
    await run(edit(20), async () => 'tx-1');
    const back = jest.fn(async () => 'tx-1');
    await run(edit(10), back);
    expect(back).toHaveBeenCalledWith('receipt-3');
  });
  it('an unclear change to another record still replays its own receipt', async () => {
    let n = 0; const run = createWriteIntents(() => `receipt-${++n}`);
    await expect(run({ fn: 'updateTransaction', args: { id: 'tx-1', amount: 10 } }, async () => { throw new Error('ambiguous'); })).rejects.toThrow();
    await run({ fn: 'updateTransaction', args: { id: 'tx-2', amount: 20 } }, async () => 'tx-2');
    const retry = jest.fn(async () => 'tx-1');
    await run({ fn: 'updateTransaction', args: { id: 'tx-1', amount: 10 } }, retry);
    expect(retry).toHaveBeenCalledWith('receipt-1');
  });
});
