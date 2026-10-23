import { describe, expect, it, jest } from '@jest/globals';
import { signOutWithPushCleanup } from './signOut';

jest.mock('@convex-dev/auth/react', () => ({ useAuthActions: jest.fn() }));
jest.mock('convex/react', () => ({ useMutation: jest.fn() }));
jest.mock('./push', () => ({ savedPushToken: jest.fn(), forgetPushToken: jest.fn() }));

describe('phone sign-out', () => {
  it('unregisters while the old account is still authenticated, then forgets the token and signs out', async () => {
    const steps: string[] = [];
    await signOutWithPushCleanup({
      saved: async () => 'synthetic-token',
      unregister: async ({ token }) => { expect(token).toBe('synthetic-token'); steps.push('unregister'); },
      forget: async () => { steps.push('forget'); },
      signOut: async () => { steps.push('signOut'); },
    });
    expect(steps).toEqual(['unregister', 'forget', 'signOut']);
  });
  it('continues to SDK logout after a disconnected unregister queue times out', async () => {
    jest.useFakeTimers();
    try {
      const signOut = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const pending = signOutWithPushCleanup({ saved: async () => 'synthetic-token', unregister: () => new Promise(() => {}), forget: async () => {}, signOut });
      await jest.advanceTimersByTimeAsync(1500);
      await pending;
      expect(signOut).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
  it('still invokes SDK logout if remote cleanup fails', async () => {
    const signOut = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const forget = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await signOutWithPushCleanup({ saved: async () => 'synthetic-token', unregister: async () => { throw Error('offline'); }, forget, signOut });
    expect(forget).toHaveBeenCalledTimes(1); expect(signOut).toHaveBeenCalledTimes(1);
  });
});
