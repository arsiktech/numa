import React from 'react';
import { useWriter } from './writes';
import { NavigationWriterProvider, useNavigationWriter } from './NavigationWriter';
import type { Op } from '@/ask/plan';

const { act, create } = jest.requireActual('react-test-renderer');
let mockConnected = true;
let mockData: any;
let mockUser = 'user-a';
const mockSubmit = jest.fn();
jest.mock('convex/react', () => ({
  useMutation: () => mockSubmit,
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
  useConvex: () => ({ connectionState: () => ({ isWebSocketConnected: mockConnected }) }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => ({ userId: mockUser, deletionStarted: false }),
}));
jest.mock('./cloud', () => ({ useCloudData: () => mockData, newMutationId: () => `receipt-${Math.random()}` }));
let run: ReturnType<typeof useWriter>;
let tree: any;
function Harness() { const write = useWriter(); React.useLayoutEffect(() => { run = write; }, [write]); return null; }
const op = (): Op => ({ fn: 'createTransaction', args: { portfolioId: 'space-a', description: 'Synthetic coffee', amount: 4, currency: 'EUR' } });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mockConnected = true; mockUser = 'user-a';
  mockData = { status: 'ready', portfolioId: 'space-a', boot: { profile: { userId: 'user-a' } } };
  mockSubmit.mockReset().mockResolvedValue({ id: 'record' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function mount() { await act(async () => { tree = create(<Harness />); }); }

it('refuses a confirmed write immediately when disconnected, without enqueueing transport', async () => {
  await mount(); mockConnected = false;
  await expect(run(op())).rejects.toThrow(/offline|connection/i);
  expect(mockSubmit).not.toHaveBeenCalled();
  mockConnected = true;
  await expect(run(op())).resolves.toBe('record');
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
it('joins duplicate taps and reuses the receipt after an ambiguous failure', async () => {
  let fail!: (e: Error) => void;
  mockSubmit.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await mount(); const intent = op();
  const first = run(intent); const duplicate = run(intent);
  const firstResult = first.catch(error => error);
  const duplicateResult = duplicate.catch(error => error);
  await act(async () => { await Promise.resolve(); fail(new Error('ambiguous')); });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(await firstResult).toMatchObject({ message: 'ambiguous' });
  expect(await duplicateResult).toMatchObject({ message: 'ambiguous' });
  const receipt = mockSubmit.mock.calls[0][0].clientMutationId;
  await run(intent);
  expect(mockSubmit.mock.calls[1][0].clientMutationId).toBe(receipt);
});
it.each(['account', 'space', 'loading'])('rejects a stale %s closure before transport submission', async change => {
  await mount(); const stale = run;
  if (change === 'account') { mockUser = 'user-b'; mockData = { ...mockData, boot: { profile: { userId: 'user-b' } } }; }
  if (change === 'space') mockData = { ...mockData, portfolioId: 'space-b' };
  if (change === 'loading') mockData = { status: 'loading' };
  await act(async () => { tree.update(<Harness />); });
  await expect(stale(op())).rejects.toThrow(/account|space|changed|available/i);
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('rejects callbacks retained after unmount', async () => {
  await mount(); const stale = run;
  await act(async () => { tree.unmount(); }); tree = null;
  await expect(stale(op())).rejects.toThrow(/account|space|changed|available/i);
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('a root-owned Undo survives detail unmount, while its account and space guards remain live', async () => {
  let captured!: ReturnType<typeof useNavigationWriter>;
  function Detail() {
    const undo = useNavigationWriter();
    React.useLayoutEffect(() => { captured = undo; }, [undo]);
    return null;
  }
  const show = (visible: boolean) => <NavigationWriterProvider>{visible ? <Detail /> : null}</NavigationWriterProvider>;
  await act(async () => { tree = create(show(true)); });
  const rootUndo = captured;
  await act(async () => { tree.update(show(false)); });
  await expect(rootUndo(op())).resolves.toBe('record');
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  mockData = { ...mockData, portfolioId: 'space-b' };
  await act(async () => { tree.update(show(false)); });
  await expect(rootUndo(op())).rejects.toThrow(/account|space|changed/);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
