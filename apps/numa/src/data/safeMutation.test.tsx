import React from 'react';
import { useSafeMutation } from './safeMutation';
import { forgetWriteIntents } from './writeIntent';

const { act, create } = jest.requireActual('react-test-renderer');
let mockConnected = true;
let mockData: any;
const mockSubmit = jest.fn();
jest.mock('convex/react', () => ({
  useMutation: () => mockSubmit,
  useConvex: () => ({ connectionState: () => ({ isWebSocketConnected: mockConnected }) }),
}));
let mockN = 0;
jest.mock('./cloud', () => ({ useOptionalCloudData: () => mockData, newMutationId: (name: string) => `${name}:receipt-${++mockN}` }));

type Args = { portfolioId: string; subject: string; amount: number; clientMutationId: string };
let add: ReturnType<typeof useSafeMutation<Args, { id: string }>>;
let tree: any;
function Harness() {
  const write = useSafeMutation<Args, { id: string }>('debtEvents:add' as never, 'debtEvent');
  React.useLayoutEffect(() => { add = write; }, [write]);
  return null;
}
const payment = () => ({ portfolioId: 'space-a', subject: 'Synthetic loan', amount: 50 });
const receipts = () => mockSubmit.mock.calls.map(([args]) => args.clientMutationId);

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mockConnected = true; mockN = 0;
  mockData = { status: 'ready', portfolioId: 'space-a', boot: { profile: { userId: 'user-a' } } };
  mockSubmit.mockReset().mockResolvedValue({ id: 'event' });
  forgetWriteIntents();
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function mount() { await act(async () => { tree = create(<Harness />); }); }

it('refuses while offline without queueing anything', async () => {
  await mount(); mockConnected = false;
  await expect(add(payment())).rejects.toThrow(/offline/i);
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('refuses before the account is loaded', async () => {
  mockData = { status: 'loading' };
  await mount();
  await expect(add(payment())).rejects.toThrow(/changed/i);
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('a second tap while the first is in flight joins it', async () => {
  let finish!: (v: { id: string }) => void;
  mockSubmit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await mount();
  const first = add(payment()); const second = add(payment());
  await act(async () => { await Promise.resolve(); finish({ id: 'event' }); });
  await expect(first).resolves.toEqual({ id: 'event' });
  await expect(second).resolves.toEqual({ id: 'event' });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
it('a retry after an interrupted save, even from a reopened form, sends the same receipt', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('connection lost'));
  await mount();
  await expect(add(payment())).rejects.toThrow('connection lost');
  await act(async () => { tree.unmount(); }); tree = null;
  await mount();
  await add(payment());
  expect(receipts()).toEqual(['numa.debtEvent:receipt-1', 'numa.debtEvent:receipt-1']);
});
it('the same details after a confirmed save are a new entry', async () => {
  await mount();
  await add(payment()); await add(payment());
  expect(receipts()).toEqual(['numa.debtEvent:receipt-1', 'numa.debtEvent:receipt-2']);
});
it('a request id from the form is kept', async () => {
  await mount();
  await add({ ...payment(), clientMutationId: 'form-request' });
  expect(receipts()).toEqual(['form-request']);
});
