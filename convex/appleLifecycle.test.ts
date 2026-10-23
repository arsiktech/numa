// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginAppleDeletion, assertAppleCallback, claim, cleanup, cleanupGuard, finish } from "./appleLifecycle";
import { deleteMyAccount, cancelMyDeletion, executeScheduledDeletion, deleteForAppleRevocation } from "./users";
import { sha256Hex } from "./lib/appleIdentity";
import { APPLE_RETENTION_MS } from "./lib/appleTokens";
import { privacyFixture } from "../src/test/privacyFixture";
// Reuse the repository synthetic transactional adapter, with replace support local to this suite.
function fixture() {
  const f = privacyFixture();
  const call = (registered: any, args: object = {}) => f.call({ _handler: (ctx: any, input: any) => {
    ctx.db.replace = async (id: string, value: object) => { const table = f.all('appleCredentials').some(row => row._id === id) ? 'appleCredentials' : 'appleDeletionGuards'; f.seed(table, id, value); };
    return registered._handler(ctx, input);
  } }, args);
  return { ...f, call };
}
afterEach(() => vi.restoreAllMocks());
describe("registered deletion handlers schedule bounded Apple work", () => {
  it("never revokes during grace or after cancellation, then detaches tokens only at deletion start", async () => {
    const f = fixture(); f.seed('users', 'user', { email: 'synthetic@invalid.test' });
    f.seed('authAccounts', 'apple', { userId: 'user', provider: 'apple-native', providerAccountId: 'dummy-subject' });
    f.seed('appleCredentials', 'credential', { userId: 'user', audience: 'com.arsiktech.numa', subjectHash: await sha256Hex('dummy-subject'), envelope: { iv: 'dummy', ciphertext: 'dummy' }, state: 'active', attempts: 0, updatedAt: Date.now() });
    await f.call(deleteMyAccount);
    expect(f.all('appleCredentials')[0].state).toBe('active'); expect(f.all('appleDeletionGuards')).toHaveLength(0);
    await f.call(cancelMyDeletion);
    await f.call(executeScheduledDeletion, { userId: 'user' });
    expect(f.all('appleCredentials')[0].state).toBe('active');
    await f.call(deleteMyAccount);
    const profile = f.all('profiles')[0]; f.seed('profiles', profile._id, { ...profile, deletionScheduledAt: Date.now() - 1 });
    await f.call(executeScheduledDeletion, { userId: 'user' });
    expect(f.rows.has('user')).toBe(false);
    expect(f.all('appleCredentials')[0]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(f.all('appleCredentials')[0].userId).toBeUndefined();
    expect(f.all('appleDeletionGuards')).toHaveLength(1);
    expect(JSON.stringify(f.all('appleDeletionGuards'))).not.toContain('dummy-subject');
    await expect(f.call({ _handler: (ctx: any) => assertAppleCallback(ctx, { subjectHash: f.all('appleDeletionGuards')[0].subjectHash, audience: 'com.arsiktech.numa', issuedAt: Date.now() }) })).rejects.toThrow(/deletion/);
  });
  it("erases a legacy tokenless account without waiting for external revocation", async () => {
    const f = fixture(); f.seed('authAccounts', 'apple', { userId: 'user', provider: 'apple-native', providerAccountId: 'dummy-legacy' });
    await f.call(deleteMyAccount);
    expect(f.rows.has('user')).toBe(false); expect(f.all('appleCredentials')).toHaveLength(0);
    expect(f.all('appleDeletionGuards')).toHaveLength(1);
  });
  it("leases racing work, rejects stale receipts, retries, wipes secrets and cleans receipts", async () => {
    const f = fixture(); let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    f.seed('appleCredentials', 'job', { state: 'pending', attempts: 0, subjectHash: 'hash', audience: 'com.arsiktech.numa', envelope: { iv: 'dummy', ciphertext: 'dummy' }, expiresAt: now + APPLE_RETENTION_MS, updatedAt: now });
    expect(await f.call(claim, { id: 'job' })).toMatchObject({ attempts: 1 });
    expect(await f.call(claim, { id: 'job' })).toBeNull();
    await f.call(finish, { id: 'job', attempt: 1, ok: false });
    now += 120001;
    expect(await f.call(claim, { id: 'job' })).toMatchObject({ attempts: 2 });
    await f.call(finish, { id: 'job', attempt: 1, ok: true });
    expect(f.all('appleCredentials')[0].state).toBe('pending');
    await f.call(finish, { id: 'job', attempt: 2, ok: true });
    expect(f.all('appleCredentials')[0]).toMatchObject({ state: 'done' });
    expect(f.all('appleCredentials')[0].envelope).toBeUndefined(); expect(f.all('appleCredentials')[0].subjectHash).toBeUndefined();
    await f.call(cleanup, { id: 'job' }); expect(f.all('appleCredentials')).toHaveLength(1);
    now += APPLE_RETENTION_MS; await f.call(cleanup, { id: 'job' }); expect(f.all('appleCredentials')).toHaveLength(0);
    f.seed('appleDeletionGuards', 'guard', { subjectHash: 'hash', expiresAt: now });
    await f.call(cleanupGuard, { id: 'guard' }); expect(f.all('appleDeletionGuards')).toHaveLength(0);
  });
  it("bounds failed/interrupted work and refuses late callback after marker expiry", async () => {
    const f = fixture(); const now = Date.now();
    f.seed('appleCredentials', 'job', { state: 'pending', attempts: 8, envelope: { iv: 'dummy', ciphertext: 'dummy' }, expiresAt: now + APPLE_RETENTION_MS, updatedAt: now });
    await f.call(finish, { id: 'job', attempt: 8, ok: false });
    expect(f.all('appleCredentials')[0].envelope).toBeUndefined();
    await expect(f.call({ _handler: (ctx: any) => assertAppleCallback(ctx, { subjectHash: 'hash', audience: 'com.arsiktech.numa', issuedAt: now - 660001 }) })).rejects.toThrow(/expired/);
    await f.call({ _handler: (ctx: any) => beginAppleDeletion(ctx, 'user' as any) });
  });
  it("signed revocation deletion is idempotent and a delayed event cannot erase reauthorized accounts", async () => {
    const f = fixture(); const now = Date.now();
    f.seed('authAccounts', 'apple', { userId: 'user', provider: 'apple-native', providerAccountId: 'dummy-notify' });
    f.seed('appleCredentials', 'credential', { userId: 'user', subjectHash: await sha256Hex('dummy-notify'), audience: 'com.arsiktech.numa', state: 'active', attempts: 0, updatedAt: now - 10000 });
    const event = { subject: 'dummy-notify', audience: 'com.arsiktech.numa', at: now - 1000, eventId: 'dummy-notification' };
    await f.call(deleteForAppleRevocation, event);
    expect(f.rows.has('user')).toBe(false); expect(f.all('appleCredentials')).toHaveLength(0);
    await f.call(deleteForAppleRevocation, event);
    expect(f.all('appleDeletionGuards')).toHaveLength(2);
    const next = fixture();
    next.seed('authAccounts', 'apple', { userId: 'user', provider: 'apple-native', providerAccountId: 'dummy-notify' });
    next.seed('appleCredentials', 'credential', { userId: 'user', subjectHash: await sha256Hex('dummy-notify'), audience: 'com.arsiktech.numa', state: 'active', attempts: 0, updatedAt: now });
    await next.call(deleteForAppleRevocation, { ...event, eventId: 'other-event' });
    expect(next.rows.has('user')).toBe(true); expect(next.all('appleCredentials')).toHaveLength(1);
  });

});
