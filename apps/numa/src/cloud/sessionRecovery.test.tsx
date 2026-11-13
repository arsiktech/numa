import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { CloudBoundary } from './CloudBoundary';
import { CloudDataProvider, useCloudData, type CloudData } from '@/data/cloud';
import { forgetWriteIntents } from '@/data/writeIntent';
import { NotReady } from '@/ui/NotReady';

const mockSignOut = jest.fn(async () => undefined);
const mockBootstrap = jest.fn();
const mockCreatePortfolio = jest.fn();
const mockNavigate = jest.fn();
let mockSpaces: unknown;
jest.mock('@/alerts/signOut', () => ({ usePhoneSignOut: () => mockSignOut }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ name: 'dark', c: { bg: '#000', ink: '#fff', ink2: '#aaa', ink3: '#777', s1: '#111', s2: '#222', line: '#333', line2: '#444', down: '#f66' } }) }));
jest.mock('@/state/prefs', () => ({ usePrefs: () => ({ ready: true, space: null, set: () => undefined }) }));
jest.mock('@/data/fx', () => ({ loadFx: () => undefined, fetchFxRate: () => Promise.resolve(null) }));
jest.mock('@/cloud/storage', () => ({ storage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));
jest.mock('@/cloud/api', () => ({ cloud: new Proxy({}, { get: (_t, name) => name }) }));
jest.mock('expo-router', () => ({ router: { navigate: (to: string) => mockNavigate(to) } }));
jest.mock('convex/react', () => ({
  useMutation: (ref: string) => (ref === 'bootstrap' ? mockBootstrap : mockCreatePortfolio),
  useQuery: (ref: string, args: unknown) => (args === 'skip' ? undefined : ref === 'listSpaces' ? mockSpaces : undefined),
  useConvex: () => ({ connectionState: () => ({ isWebSocketConnected: true }) }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: TestRenderer.ReactTestRenderer | undefined;
let quiet: jest.SpyInstance;
beforeEach(() => {
  quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockSignOut.mockClear(); mockBootstrap.mockReset(); mockCreatePortfolio.mockReset(); mockNavigate.mockReset();
  mockSpaces = undefined;
  forgetWriteIntents();
});
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; quiet.mockRestore(); });

const text = () => tree!.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children).join(' | ');
const button = (label: string) => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && n.findAll((c) => c.props.children === label).length > 0)[0];
function Throws({ error }: { error: Error }): React.ReactNode { throw error; }

describe('an ended session', () => {
  it('shows a way back in instead of a blank screen, and signs out', async () => {
    await act(async () => { tree = TestRenderer.create(<CloudBoundary><Throws error={new Error('[CONVEX Q(spaces:list)] Uncaught Error: Not signed in')} /></CloudBoundary>); });
    expect(text()).toMatch(/You’re signed out/);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    // Signing out needs the server once. If it hasn't finished, the button tries again.
    await act(async () => { button('Sign in again').props.onPress(); });
    expect(mockSignOut).toHaveBeenCalledTimes(2);
  });
  it('found while starting up is not reported as a connection problem', async () => {
    mockBootstrap.mockRejectedValue(new Error('[CONVEX M(mobile:bootstrap)] Uncaught Error: UNAUTHENTICATED'));
    await act(async () => { tree = TestRenderer.create(<CloudBoundary><CloudDataProvider><NotReady /></CloudDataProvider></CloudBoundary>); });
    expect(text()).toMatch(/You’re signed out/);
    expect(text()).not.toMatch(/Couldn’t/);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
  it('another failure keeps the try-again screen and does not sign out', async () => {
    await act(async () => { tree = TestRenderer.create(<CloudBoundary><Throws error={new Error('Server error')} /></CloudBoundary>); });
    expect(text()).toMatch(/Couldn’t load your money/);
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('data screens before the numbers are ready', () => {
  it('say when loading failed, and Try again loads again', async () => {
    mockBootstrap.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { tree = TestRenderer.create(<CloudBoundary><CloudDataProvider><NotReady /></CloudDataProvider></CloudBoundary>); });
    expect(text()).toMatch(/Couldn’t load your money/);
    mockBootstrap.mockReturnValue(new Promise(() => undefined));
    await act(async () => { button('Try again').props.onPress(); });
    expect(text()).not.toMatch(/Couldn’t/);
    expect(tree!.root.findAll((n) => n.props.accessibilityLabel === 'Loading').length).toBeGreaterThan(0);
  });
  it('point to setting up a space when there is none', async () => {
    mockBootstrap.mockResolvedValue({ profile: { userId: 'user-a' }, selectedPortfolioId: null });
    mockSpaces = [];
    await act(async () => { tree = TestRenderer.create(<CloudDataProvider><NotReady /></CloudDataProvider>); });
    expect(text()).toMatch(/Set up your money first/);
    act(() => { button('Set up').props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
  it('show a spinner outside a signed-in session', () => {
    act(() => { tree = TestRenderer.create(<NotReady />); });
    expect(tree!.root.findAll((n) => n.props.accessibilityLabel === 'Loading').length).toBeGreaterThan(0);
  });
});

it('pressing Start again after an interrupted first space sends the same receipt, so only one space is made', async () => {
  mockBootstrap.mockResolvedValue({ profile: { userId: 'user-a' }, selectedPortfolioId: null });
  mockSpaces = [];
  const seen: CloudData[] = [];
  function Peek() { const value = useCloudData(); React.useLayoutEffect(() => { seen.push(value); }); return null; }
  await act(async () => { tree = TestRenderer.create(<CloudDataProvider><Peek /></CloudDataProvider>); });
  const data = seen[seen.length - 1];
  if (data.status !== 'needsSpace') throw new Error(`expected needsSpace, got ${data.status}`);
  const { create } = data;
  mockCreatePortfolio.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ id: 'space', replayed: true });
  await act(async () => { await expect(create('EUR')).rejects.toThrow('connection lost'); });
  await act(async () => { await create('EUR'); });
  const [first, second] = mockCreatePortfolio.mock.calls.map(([args]) => args.clientMutationId);
  expect(second).toBe(first);
});
