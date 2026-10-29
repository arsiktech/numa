import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { ActiveDayTracker } from './useActiveDay';

let mockMe: { id: string; deletionScheduledAt: number | null; deletionStartedAt: number | null } | null;
let mockConnected = true;
const mockRecord = jest.fn();
jest.mock('convex/react', () => ({
  useQuery: () => mockMe,
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
  useMutation: () => mockRecord,
}));
let renderer: ReactTestRenderer | undefined;
let foreground: ((state: AppStateStatus) => void) | undefined;
async function mount() { await act(async () => { renderer = create(<ActiveDayTracker />); }); }
async function refresh() { await act(async () => { renderer!.update(<ActiveDayTracker />); }); }
beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  mockConnected = true; mockMe = { id: 'user-a', deletionScheduledAt: null, deletionStartedAt: null };
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => { foreground = fn; return { remove: jest.fn() }; });
  mockRecord.mockReset().mockResolvedValue({ utcDate: '2026-10-28' });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount()); renderer = undefined;
  jest.restoreAllMocks(); jest.useRealTimers();
});
it('suppresses minute ticks and revalidates on foreground without using the device calendar', async () => {
  await mount();
  await act(async () => { jest.advanceTimersByTime(120_000); foreground?.('active'); });
  expect(mockRecord.mock.calls).toEqual([[{ expectedUserId: 'user-a' }], [{ expectedUserId: 'user-a' }]]);
});
it('does not send offline, anonymous, background or deleting activity', async () => {
  mockConnected = false; await mount(); expect(mockRecord).not.toHaveBeenCalled();
  mockConnected = true; mockMe = null; await refresh(); expect(mockRecord).not.toHaveBeenCalled();
  mockMe = { id: 'user-a', deletionScheduledAt: 1, deletionStartedAt: null }; await refresh(); expect(mockRecord).not.toHaveBeenCalled();
  mockMe.deletionScheduledAt = null; AppState.currentState = 'background'; await refresh(); expect(mockRecord).not.toHaveBeenCalled();
  AppState.currentState = 'active'; await act(async () => foreground?.('active')); expect(mockRecord).toHaveBeenCalledTimes(1);
});
it('starts a new UTC date while visible and retries after a failed connected request', async () => {
  mockRecord.mockRejectedValueOnce(new Error('disconnected'));
  mockRecord.mockResolvedValue({ utcDate: '2026-10-28', recheckAfterMs: 60_000 });
  await mount(); expect(mockRecord).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(60_000)); expect(mockRecord).toHaveBeenCalledTimes(2);
  jest.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  mockRecord.mockResolvedValue({ utcDate: '2026-10-29' });
  await act(async () => jest.advanceTimersByTime(60_000)); expect(mockRecord).toHaveBeenCalledTimes(3);
});
it('does not let a late old-account response suppress activity for the replacement account', async () => {
  let resolve!: (value: { utcDate: string }) => void;
  mockRecord.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount(); mockMe = { id: 'user-b', deletionScheduledAt: null, deletionStartedAt: null }; await refresh();
  await act(async () => resolve({ utcDate: '2026-10-29' }));
  expect(mockRecord.mock.calls.map(([args]) => args.expectedUserId)).toEqual(['user-a', 'user-b']);
  await act(async () => jest.advanceTimersByTime(60_000)); expect(mockRecord).toHaveBeenCalledTimes(2);
});

it('uses server expiry and monotonic time when the device date is a day slow or changes abruptly', async () => {
  jest.setSystemTime(new Date('2026-10-27T23:59:00Z'));
  mockRecord.mockResolvedValueOnce({ utcDate: '2026-10-28', recheckAfterMs: 60_000 });
  await mount();
  // Device now equals the OLD server day. It is not evidence of the current server day.
  jest.setSystemTime(new Date('2026-10-28T00:00:00Z'));
  mockRecord.mockResolvedValue({ utcDate: '2026-10-29', recheckAfterMs: 86_400_000 });
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(mockRecord).toHaveBeenCalledTimes(2);
  jest.setSystemTime(new Date('2020-01-01T00:00:00Z'));
  await act(async () => jest.advanceTimersByTime(300_000));
  expect(mockRecord).toHaveBeenCalledTimes(3);
});
