import React from 'react';
import { AppleCredentialObserver } from './AppleCredentialObserver';
import type { AppleNativeIdentity } from './appleLifecycle';
const { act, create } = jest.requireActual('react-test-renderer');
const mockSignOut = jest.fn(async () => {});
let mockIdentity: AppleNativeIdentity | undefined;
let mockAuthenticated = true;
let mockSession = 'apple-session';
let mockTokenUser = 'apple-user';
const mockSessionToken = () => `header.${btoa(JSON.stringify({ sub: `${mockTokenUser}|${mockSession}` })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.signature`;
let mockRevoke: () => void = () => undefined;
const mockState = jest.fn<Promise<number>, [string]>(async () => 1);
jest.mock('@convex-dev/auth/react', () => ({ useAuthToken: () => mockSessionToken(), useAuthActions: () => ({ signOut: mockSignOut }) }));
jest.mock('convex/react', () => ({ useConvexAuth: () => ({ isAuthenticated: mockAuthenticated }), useQuery: (_ref: unknown, args: unknown) => args === 'skip' ? undefined : mockIdentity }));
jest.mock('react-native', () => { const actual = jest.requireActual('react-native'); return Object.create(actual, { Platform: { value: { ...actual.Platform, OS: 'ios' } }, AppState: { value: { addEventListener: () => ({ remove: jest.fn() }) } } }); });
jest.mock('expo-apple-authentication', () => ({ getCredentialStateAsync: (subject: string) => mockState(subject), addRevokeListener: (fn: () => void) => { mockRevoke = fn; return { remove: jest.fn() }; }, AppleAuthenticationCredentialState: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2 } }));
let tree: any;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mockSignOut.mockClear(); mockAuthenticated = true; mockRevoke = () => undefined;
  mockSession = 'apple-session'; mockTokenUser = 'apple-user';
  mockIdentity = { userId: 'apple-user', sessionId: 'apple-session', exists: true, subject: 'dummy-subject' };
  mockState.mockReset().mockResolvedValue(1);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function render() { await act(async () => { if (tree) tree.update(React.createElement(AppleCredentialObserver)); else tree = create(React.createElement(AppleCredentialObserver)); }); }
it('ends the app session on an Apple credential revocation notification', async () => {
  await render(); await act(async () => { mockRevoke(); mockRevoke(); });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
it('checks revoked state but does not treat an offline error as revocation', async () => {
  mockState.mockResolvedValue(0); await render(); expect(mockSignOut).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount()); tree = null; mockSignOut.mockClear();
  mockState.mockRejectedValue(new Error('offline')); await render(); expect(mockSignOut).not.toHaveBeenCalled();
});
it('clears the same client identity after server-side deletion', async () => {
  await render(); mockIdentity = { userId: 'apple-user', sessionId: 'apple-session', exists: false, subject: null }; await render();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});
it('never carries a previous Apple identity into a different email account', async () => {
  await render(); mockTokenUser = 'email-user'; mockSession = 'email-session'; mockIdentity = { userId: 'email-user', sessionId: 'email-session', exists: true, subject: null }; await render();
  expect(mockSignOut).not.toHaveBeenCalled();
  mockAuthenticated = false; await render(); mockAuthenticated = true; await render();
  expect(mockSignOut).not.toHaveBeenCalled();
});
it('drops an old native state result and listener after account switching', async () => {
  let finish!: (n: number) => void;
  mockState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); const oldRevoke = mockRevoke;
  mockTokenUser = 'email-user'; mockSession = 'email-session'; mockIdentity = { userId: 'email-user', sessionId: 'email-session', exists: true, subject: null }; await render();
  await act(async () => { finish(0); oldRevoke(); });
  expect(mockSignOut).not.toHaveBeenCalled();
});

it.each(['password', 'google'])('preserves the same Apple-linked user authenticated with %s for revoked/not-found states and events', async method => {
  // Start from a genuine Apple session, then replace only the session for the same user.
  await render(); const oldRevoke = mockRevoke;
  mockSession = `${method}-session`;
  mockIdentity = { userId: 'apple-user', sessionId: mockSession, exists: true, subject: null };
  for (const state of [0, 2]) {
    mockState.mockResolvedValue(state); await render();
    await act(async () => { oldRevoke(); mockRevoke(); });
  }
  expect(mockSignOut).not.toHaveBeenCalled();
  // No credential checks should have been made for the independently authenticated session.
  expect(mockState).toHaveBeenCalledTimes(1);
});
it('ends a genuine Apple session on NOT_FOUND', async () => {
  mockState.mockResolvedValue(2); await render(); expect(mockSignOut).toHaveBeenCalledTimes(1);
});
it('signs out a deleted account even when its current session is not Apple', async () => {
  mockSession = 'password-session';
  mockIdentity = { userId: 'apple-user', sessionId: mockSession, exists: false, subject: null };
  await render(); expect(mockSignOut).toHaveBeenCalledTimes(1);
});
it('rejects stale query identity and callbacks when the same user changes session before the query catches up', async () => {
  let finish!: (n: number) => void;
  mockState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); const oldRevoke = mockRevoke;
  mockSession = 'google-session'; await render(); // Still the previous query result.
  await act(async () => { finish(0); oldRevoke(); });
  expect(mockSignOut).not.toHaveBeenCalled();
  mockIdentity = { userId: 'apple-user', sessionId: mockSession, exists: true, subject: null };
  await render(); expect(mockSignOut).not.toHaveBeenCalled();
});
