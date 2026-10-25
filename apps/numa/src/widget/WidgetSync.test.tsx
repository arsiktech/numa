import { act, StrictMode } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import type { Session } from '@/cloud/session';
import type { CloudData } from '@/data/cloud';
import type { usePrefs } from '@/state/prefs';
import { sampleInput, sampleNow, sampleSnapshot } from './fixtures';
import { writeWidget } from './store';
import { clearWidget, WidgetSync } from './WidgetSync';

// Only source hooks and the storage boundary are mocked. React, the renderer and RN stay real.
let mockCloud: CloudData;
let mockPrefs: Pick<ReturnType<typeof usePrefs>, 'ready' | 'space' | 'hideAmounts'>;
let mockSession: Session;
let mockViewer: string | null | undefined;
jest.mock('@/data/cloud', () => ({ useCloudData: () => mockCloud }));
jest.mock('@/state/prefs', () => ({ usePrefs: () => mockPrefs }));
jest.mock('@/cloud/session', () => ({ useSession: () => mockSession }));
jest.mock('convex/react', () => ({ useQuery: jest.fn(() => mockViewer) }));
jest.mock('./store', () => ({ writeWidget: jest.fn(() => true) }));

type Ready = Extract<CloudData, { status: 'ready' }>;
function ready(userId = 'example-viewer-a', spaceId = 'example-space-a', snapshot?: ReturnType<typeof sampleSnapshot>): Ready {
  const input = sampleInput(snapshot);
  const space = { id: spaceId, name: 'Example', spaceKind: 'personal' as const, defaultCurrency: 'EUR' as const, role: 'owner', createdAt: sampleNow };
  const other = { ...space, id: spaceId === 'example-space-b' ? 'example-space-a' : 'example-space-b' };
  return {
    status: 'ready', portfolioId: spaceId, space, spaces: [space, other], selectSpace: jest.fn(),
    boot: { profile: { id: 'example-profile', userId, displayName: 'Example', email: null, defaultCurrency: 'EUR' }, portfolios: [], selectedPortfolioId: spaceId },
    snapshot: snapshot ?? { ...input.snapshot, portfolio: { ...input.snapshot.portfolio, id: spaceId } },
    data: input.data, summary: input.summary, fx: input.fx, now: input.now,
  };
}

const renderers: ReactTestRenderer[] = [];
async function mount(strict = false) {
  let result!: ReactTestRenderer;
  await act(async () => { result = create(strict ? <StrictMode><WidgetSync /></StrictMode> : <WidgetSync />); });
  renderers.push(result);
  return result;
}
async function refresh(renderer: ReactTestRenderer) {
  await act(async () => { renderer.update(<WidgetSync />); });
}
const writes = () => jest.mocked(writeWidget).mock.calls.map(([payload]) => payload);
const stored = () => writes().at(-1) ?? null;
const startupWrites = writes();

beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockCloud = ready(); mockPrefs = { ready: true, space: 'example-space-a', hideAmounts: false };
  mockSession = { kind: 'signedIn' }; mockViewer = 'example-viewer-a';
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(sampleNow);
});

it('clears at module initialization while the existing root can still be waiting for auth', () => {
  expect(startupWrites.length).toBeGreaterThan(0);
  expect(startupWrites.every((payload) => payload === null)).toBe(true);
});
afterEach(async () => {
  for (const renderer of renderers.splice(0)) await act(async () => { renderer.unmount(); });
  clearWidget();
  jest.restoreAllMocks();
});

it('clears on the initial loading mount before any owner may publish', async () => {
  mockCloud = { status: 'loading' };
  await mount();
  expect(writes().length).toBeGreaterThan(0);
  expect(writes().every((payload) => payload === null)).toBe(true);
});

it('publishes under a real React lifecycle and does not turn a minute tick into a source sync', async () => {
  const renderer = await mount();
  expect(stored()?.net).toBe('−€260');
  expect(stored()?.syncedAt).toBe(sampleNow);
  const before = writes().length;
  const cloud = mockCloud as Ready;
  mockCloud = { ...cloud, now: sampleNow + 60_000 };
  jest.mocked(Date.now).mockReturnValue(sampleNow + 60_000);
  await refresh(renderer);
  expect(stored()?.syncedAt).toBe(sampleNow);
  expect(writes()).toHaveLength(before);
  mockCloud = { ...cloud, snapshot: { ...cloud.snapshot }, now: sampleNow + 120_000 };
  await refresh(renderer);
  expect(stored()?.syncedAt).toBe(sampleNow + 60_000);
});

it('clears immediately on a loading commit and waits for a coherent replacement space', async () => {
  const renderer = await mount();
  const previous = mockCloud;
  mockCloud = { status: 'loading' };
  await refresh(renderer);
  expect(stored()).toBeNull();
  mockPrefs.space = 'example-space-b';
  mockCloud = previous; // Old ready result during preference propagation.
  await refresh(renderer);
  expect(stored()).toBeNull();
  mockCloud = ready('example-viewer-a', 'example-space-b');
  const before = writes().length;
  await refresh(renderer);
  expect(writes().slice(before)[0]).toBeNull();
  expect(stored()?.net).toBe('−€260');
  expect(JSON.stringify(stored())).not.toMatch(/example-viewer|example-space|example-profile/);
});

it('clears before a direct ready-to-ready space replacement', async () => {
  const renderer = await mount();
  const before = writes().length;
  mockPrefs.space = 'example-space-b';
  mockCloud = ready('example-viewer-a', 'example-space-b');
  await refresh(renderer);
  expect(writes().slice(before)).toEqual([null, expect.objectContaining({ version: 2 })]);
});

it('clears while the new authenticated viewer disagrees with an old ready account', async () => {
  const renderer = await mount();
  mockViewer = undefined;
  await refresh(renderer);
  expect(stored()).toBeNull();
  mockViewer = 'example-viewer-b';
  await refresh(renderer);
  expect(stored()).toBeNull();
  const replacement = sampleSnapshot();
  replacement.assets[0] = { ...replacement.assets[0], balance: 250 };
  mockCloud = ready('example-viewer-b', 'example-space-a', replacement);
  await refresh(renderer);
  expect(stored()?.version).toBe(2);
  expect(stored()?.net).toBe('−€210');
});

it.each(['signedOut', 'loading', 'demo'] as const)('clears for session %s even if cloud data still says ready', async (kind) => {
  const renderer = await mount();
  mockSession = kind === 'demo' ? { kind, canSignIn: true } : { kind };
  await refresh(renderer);
  expect(stored()).toBeNull();
});

it('clears for unready preferences, error, missing space, and inconsistent portfolio IDs', async () => {
  const renderer = await mount();
  mockPrefs.ready = false;
  await refresh(renderer);
  expect(stored()).toBeNull();
  mockPrefs.ready = true;
  for (const cloud of [
    { status: 'error' as const, message: 'Example offline', retry: jest.fn() },
    { status: 'needsSpace' as const, create: jest.fn() },
    { ...ready(), snapshot: { ...ready().snapshot, portfolio: { ...ready().snapshot.portfolio, id: 'example-space-b' } } },
  ]) {
    mockCloud = cloud;
    await refresh(renderer);
    expect(stored()).toBeNull();
  }
});

it('masks all four infographics on a Hide amounts commit without advancing the sync timestamp', async () => {
  const renderer = await mount();
  mockPrefs.hideAmounts = true;
  await refresh(renderer);
  expect(stored()).toMatchObject({ net: '••••', today: '', line: [], syncedAt: sampleNow });
  expect(stored()?.netWorth).toEqual({ state: 'hidden' });
  expect(stored()?.moneyMap).toEqual({ state: 'hidden' });
  expect(stored()?.spending).toEqual({ state: 'hidden' });
  expect(stored()?.blocks).toEqual({ state: 'hidden' });
  mockPrefs.hideAmounts = false;
  await refresh(renderer);
  expect(stored()?.net).toBe('−€260');
});

it('does not let an older component cleanup erase a newer mounted writer', async () => {
  const old = await mount();
  mockViewer = 'example-viewer-b'; mockCloud = ready('example-viewer-b');
  await mount();
  const fresh = stored();
  const before = writes().length;
  await act(async () => { old.unmount(); });
  renderers.splice(renderers.indexOf(old), 1);
  expect(stored()).toBe(fresh);
  expect(writes()).toHaveLength(before);
});

it('survives StrictMode effect replay and clears on the final unmount', async () => {
  const renderer = await mount(true);
  expect(stored()?.version).toBe(2);
  await act(async () => { renderer.unmount(); });
  renderers.splice(renderers.indexOf(renderer), 1);
  expect(stored()).toBeNull();
  await mount();
  expect(stored()?.version).toBe(2);
});

it('revokes the mounted writer when the existing root calls clearWidget', async () => {
  const renderer = await mount();
  clearWidget();
  expect(stored()).toBeNull();
  mockCloud = { ...(mockCloud as Ready), now: sampleNow + 60_000 };
  await refresh(renderer);
  expect(stored()).toBeNull();
});

it('retries a failed publication on a later clock commit without inventing a new sync', async () => {
  const renderer = await mount();
  const cloud = mockCloud as Ready;
  jest.mocked(Date.now).mockReturnValue(sampleNow + 60_000);
  mockCloud = { ...cloud, snapshot: { ...cloud.snapshot }, now: sampleNow + 60_000 };
  jest.mocked(writeWidget).mockReturnValueOnce(false);
  await refresh(renderer);
  expect(writeWidget).toHaveLastReturnedWith(false);
  const beforeRetry = writes().length;
  mockCloud = { ...(mockCloud as Ready), now: sampleNow + 120_000 };
  await refresh(renderer);
  expect(writes()).toHaveLength(beforeRetry + 1);
  expect(writeWidget).toHaveLastReturnedWith(true);
  expect(stored()?.syncedAt).toBe(sampleNow + 60_000);
});
