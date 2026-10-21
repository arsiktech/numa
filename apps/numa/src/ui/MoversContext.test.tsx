import { StrictMode, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { attributeMovers } from '@/domain/movers';
import { MoversProvider, useMovers, type MoversRequest } from './MoversContext';

jest.mock('@/data/cloud', () => ({ useCloudData: jest.fn() }));

const request: MoversRequest = {
  currency: 'EUR', report: { movers: attributeMovers(123, []), from: 1000, to: 2000, now: 2000, range: '1D', lens: 'net', demo: false, basis: 'Synthetic saved total', notes: [] },
};
const nextRequest: MoversRequest = { ...request, report: { ...request.report, movers: attributeMovers(456, []) } };
let current: ReturnType<typeof useMovers>;
let tree: ReactTestRenderer;
function Probe() {
  const value = useMovers();
  useLayoutEffect(() => { current = value; });
  return null;
}
function view(scope: string, evidence: unknown, providerKey = 'cloud') {
  return <StrictMode><MoversProvider key={providerKey} scope={scope} evidence={evidence}><Probe /></MoversProvider></StrictMode>;
}

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
beforeAll(() => { previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT; actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); });

describe('ephemeral movement navigation', () => {
  it('starts empty for direct links, retains the exact in-memory request, and can clear it', async () => {
    await act(async () => { tree = create(view('synthetic-space:EUR', {})); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(request); });
    expect(current.request).toBe(request);
    await act(async () => { current.clear(); });
    expect(current.request).toBeNull();
  });
  it.each([
    ['account', 'cloud:account-b:space-a:EUR'],
    ['space', 'cloud:account-a:space-b:EUR'],
    ['currency', 'cloud:account-a:space-a:USD'],
  ])('invalidates %s callbacks, including a return to the same scope and evidence object', async (_change, nextScope) => {
    const evidence = {};
    const firstScope = 'cloud:account-a:space-a:EUR';
    const next: MoversRequest = { ...nextRequest, currency: nextScope.endsWith('USD') ? 'USD' : 'EUR' };
    await act(async () => { tree = create(view(firstScope, evidence)); });
    await act(async () => { current.open(request); });
    const abandoned = current;
    await act(async () => { tree.update(view(nextScope, evidence)); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(next); });
    await act(async () => { abandoned.clear(); abandoned.open(request); });
    expect(current.request).toBe(next);
    await act(async () => { tree.update(view(firstScope, evidence)); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.open(request); abandoned.clear(); });
    expect(current.request).toBe(nextRequest);
  });
  it('invalidates a quote/data/freshness revision without needing a URL or persisted payload', async () => {
    const first = {};
    await act(async () => { tree = create(view('synthetic-space:EUR', first)); });
    await act(async () => { current.open(request); });
    const abandoned = current;
    await act(async () => { tree.update(view('synthetic-space:EUR', {})); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.clear(); abandoned.open(request); });
    expect(current.request).toBe(nextRequest);
    await act(async () => { tree.update(view('synthetic-space:EUR', first)); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.open(request); abandoned.clear(); });
    expect(current.request).toBe(nextRequest);
  });
  it('does not carry a report into demo mode or a new account provider', async () => {
    await act(async () => { tree = create(view('synthetic-space:EUR', {})); });
    await act(async () => { current.open(request); });
    const abandoned = current;
    await act(async () => { tree.update(view('demo', 'demo', 'demo')); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { tree.update(view('synthetic-space:EUR', {}, 'new-account')); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.open(request); abandoned.clear(); });
    expect(current.request).toBe(nextRequest);
  });
  it('revokes late callbacks when cleared, without letting them affect a subsequently opened report', async () => {
    await act(async () => { tree = create(view('synthetic-space:EUR', {})); });
    await act(async () => { current.open(request); });
    const abandoned = current;
    await act(async () => { current.clear(); });
    expect(current.request).toBeNull();
    await act(async () => { abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.clear(); abandoned.open(request); });
    expect(current.request).toBe(nextRequest);
  });
  it('keeps clear effective when a late open is queued in the same batch, even while already empty', async () => {
    await act(async () => { tree = create(view('synthetic-space:EUR', {})); });
    const abandoned = current;
    await act(async () => { abandoned.clear(); abandoned.open(request); });
    expect(current.request).toBeNull();
    await act(async () => { current.open(nextRequest); });
    await act(async () => { abandoned.clear(); abandoned.open(request); });
    expect(current.request).toBe(nextRequest);
  });
  it('does not let callbacks from the previous report clear or replace a newly opened report in the same scope', async () => {
    await act(async () => { tree = create(view('synthetic-space:EUR', {})); });
    await act(async () => { current.open(request); });
    const abandoned = current;
    await act(async () => { current.open(nextRequest); });
    expect(current.request).toBe(nextRequest);
    await act(async () => { abandoned.open(request); abandoned.clear(); });
    expect(current.request).toBe(nextRequest);
  });
});
