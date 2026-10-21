// @vitest-environment node
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from 'convex/server';
import { finalizeSignIn, discardSignIn, checkSignIn, bindSession, nativeIdentity } from './appleLifecycle';
import { executeScheduledDeletion } from './users';
import { privacyFixture } from "../src/test/privacyFixture";
import { b64 } from "./lib/appleTokens";
import { sha256Hex } from "./lib/appleIdentity";
const state = vi.hoisted(() => ({ config: null as any, sdkStore: null as any, sdkCreate: null as any, create: vi.fn(), run: vi.fn(), query: vi.fn() }));
vi.mock('@convex-dev/auth/server', async (importOriginal) => {
  const sdk = await importOriginal<any>();
  return { ...sdk, convexAuth: (config: any) => { state.config = config; state.sdkCreate = sdk.createAccount; state.sdkStore = sdk.convexAuth(config).store; return {}; }, createAccount: (...args: any[]) => state.create(...args) };
});
await import('./auth');
const u = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (v: unknown) => u(new TextEncoder().encode(JSON.stringify(v)));
let rsa: CryptoKeyPair, pub: JsonWebKey, privatePem: string;
const nonce = 'dummy-auth-nonce';
const now = Date.now();
async function token(extra: Record<string, unknown> = {}) {
  const h = text({ alg: 'RS256', kid: 'auth-test-key' });
  const b = text({ iss: 'https://appleid.apple.com', aud: 'com.arsiktech.numa', sub: 'dummy-auth-sub', nonce: await sha256Hex(nonce), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 600, ...extra });
  return `${h}.${b}.${u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', rsa.privateKey, new TextEncoder().encode(`${h}.${b}`))))}`;
}
beforeAll(async () => {
  rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
  pub = await crypto.subtle.exportKey('jwk', rsa.publicKey);
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
  privatePem = `-----BEGIN PRIVATE KEY-----
${b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', ec.privateKey)))}
-----END PRIVATE KEY-----`;
});
beforeEach(() => {
  state.create.mockReset(); state.run.mockReset(); state.query.mockReset();
  vi.stubEnv('APPLE_TEAM_ID', 'DUMMYTEAM1'); vi.stubEnv('APPLE_KEY_ID', 'DUMMYKEY01'); vi.stubEnv('APPLE_PRIVATE_KEY', privatePem); vi.stubEnv('APPLE_TOKEN_ENCRYPTION_KEY', b64(new Uint8Array(32).fill(5)));
  vi.spyOn(Date, 'now').mockReturnValue(now);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const authorize = (credentials: object) => state.config.providers.find((p: any) => p.id === 'apple-native').authorize(credentials, { runMutation: state.run, runQuery: state.query });
function authFixture(existingUserId: string | null = null) {
  const f = privacyFixture(); f.signIn(null);
  if (existingUserId) f.seed('authAccounts', 'existing-apple', { userId: existingUserId, provider: 'apple-native', providerAccountId: 'dummy-auth-sub' });
  const call = (registered: any, args: any) => f.call({ _handler: async (ctx: any, input: any) => {
    ctx.db.replace = async (id: string, value: object) => f.seed('appleCredentials', id, value);
    // The shared adapter intentionally implements only privacy expressions.
    // Extend this suite locally for the SDK's verified-email query.
    const query = ctx.db.query;
    ctx.db.query = (table: string) => {
      const q = query(table); const filter = q.filter;
      q.filter = (fn: any) => filter((ops: any) => fn({ ...ops, neq: (field: any, value: unknown) => (row: any) => field(row) !== value }));
      return q;
    };
    try { return await registered._handler(ctx, input); }
    finally { ctx.db.query = query; }
  } }, args);
  state.query.mockImplementation((_ref: any, args: any) => call(checkSignIn, args));
  state.run.mockImplementation((ref: any, args: any) => {
    const name = typeof ref === 'string' ? ref : getFunctionName(ref);
    if (name === 'auth:store') return call(state.sdkStore, args); // Real pinned SDK session creation, hook and cleanup.
    if (name === 'appleLifecycle:bindSession') return call(bindSession, args);
    return call(name.endsWith(':finalizeSignIn') ? finalizeSignIn : discardSignIn, args);
  });
  // Exercise actual pinned account creation, including its existing-account
  // callback bypass, instead of a second implementation of SDK account rules.
  state.create.mockImplementation((...args: any[]) => state.sdkCreate(...args));

  return f;
}
function providerFetch(exchangeToken: string) {
  const fetcher = vi.fn(async (url: string) => {
    if (url === 'https://appleid.apple.com/auth/keys') return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'auth-test-key', kty: 'RSA' }] }));
    if (url === 'https://appleid.apple.com/auth/token') return new Response(JSON.stringify({ id_token: exchangeToken, refresh_token: 'dummy-server-only-refresh' }));
    throw new Error('Unexpected endpoint');
  }); vi.stubGlobal('fetch', fetcher); return fetcher;
}
it('actual registered authorize exchanges before account creation and atomically stores only ciphertext', async () => {
  const f = authFixture(); const signed = await token(); const fetcher = providerFetch(signed);
  expect(await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy-code' })).toHaveProperty('userId');
  expect(fetcher.mock.calls.some(c => c[0] === 'https://appleid.apple.com/auth/token')).toBe(true);
  expect(f.all('appleCredentials')).toHaveLength(1);
  expect(JSON.stringify(f.all('appleCredentials'))).not.toContain('dummy-server-only-refresh');
  expect(f.all('users').some(u => u.appleLifecycle !== undefined)).toBe(false);
});
it('actual authorize refuses missing code and mismatched exchange subject before creating an account', async () => {
  authFixture(); const signed = await token(); providerFetch(await token({ sub: 'other' }));
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/update|current.*client/i);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/mismatch/);
  expect(state.create).not.toHaveBeenCalled();
});
it('missing configuration preserves existing verified Apple access but never creates a new account', async () => {
  vi.stubEnv('APPLE_PRIVATE_KEY', ''); const signed = await token(); providerFetch(signed);
  const f = authFixture('user');
  expect(await authorize({ identityToken: signed, nonce })).toMatchObject({ userId: 'user', sessionId: expect.any(String) });
  expect(f.all('appleCredentials')).toHaveLength(1);
  expect(f.all('appleCredentials')[0].envelope).toBeUndefined();
  authFixture(); await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/update|current.*client/i);
});
it('rechecks deletion after an in-flight exchange and refuses account switching', async () => {
  const f = authFixture('user'); const signed = await token();
  const fetcher = providerFetch(signed);
  fetcher.mockImplementation(async (url: string) => {
    if (url.endsWith('/keys')) return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'auth-test-key', kty: 'RSA' }] }));
    f.seed('appleDeletionGuards', 'guard', { subjectHash: await sha256Hex('dummy-auth-sub'), expiresAt: now + 660000 });
    // Existing-account SDK branch bypasses callbacks, so finalization must see the guard.
    f.seed('profiles', 'deleting', { userId: 'user', deletionStartedAt: now });
    return new Response(JSON.stringify({ id_token: signed, refresh_token: 'dummy' }));
  });
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/deletion/);
  expect(f.all('appleCredentials').every(row => row.userId === undefined && row.state === 'pending')).toBe(true);
  const other = authFixture('user'); other.seed('users','other',{}); other.signIn('other'); providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/another Numa Pro account/);
});

it("legacy Apple OAuth only reuses a live account and cannot create or recreate tokenless accounts", async () => {
  const f = authFixture();
  const callback = { _handler: state.config.callbacks.createOrUpdateUser };
  const args = { provider: { id: "apple", type: "oidc" }, type: "oauth", profile: {}, existingUserId: null as string | null };
  await expect(f.call(callback, args)).rejects.toThrow(/current Apple sign-in/);
  expect(await f.call(callback, { ...args, existingUserId: "user" })).toBe("user");
  f.rows.delete("user");
  await expect(f.call(callback, { ...args, existingUserId: "user" })).rejects.toThrow(/no longer exists/);
});

it('rejects a switched account before issuing or discarding a new Apple token', async () => {
  const f = authFixture('user'); f.seed('users', 'other', {}); f.signIn('other');
  const signed = await token(); const fetcher = providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/another Numa Pro account/);
  expect(fetcher.mock.calls.some(c => c[0] === 'https://appleid.apple.com/auth/token')).toBe(false);
  expect(state.create).not.toHaveBeenCalled(); expect(f.all('appleCredentials')).toHaveLength(0);
});

const emailClaims = { email: 'linked@invalid.test', email_verified: true, is_private_email: false };
it('rejects a new subject targeting a deletion-started verified-email user before exchange or discard', async () => {
  const f = authFixture(); f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
  f.seed('profiles', 'started', { userId: 'user', deletionStartedAt: now });
  const signed = await token(emailClaims); const fetcher = providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/deletion has started/);
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0);
  expect(state.create).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled();
  expect(f.jobs).toHaveLength(0); expect(f.all('appleCredentials')).toHaveLength(0);
});
it.each([false, true])('links a live verified-email target and permits scheduled grace access: %s', async grace => {
  const f = authFixture(); f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
  if (grace) f.seed('profiles', 'grace', { userId: 'user', deletionScheduledAt: now + 100000 });
  const signed = await token(emailClaims); providerFetch(signed);
  const result = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' });
  expect(result).toMatchObject({ userId: 'user', sessionId: expect.any(String) });
  expect(f.all('users')).toHaveLength(1);
  expect(f.all('authSessions')).toEqual([expect.objectContaining({ _id: result.sessionId, userId: 'user', appleSubject: 'dummy-auth-sub' })]);
});
it('legacy subject ownership wins over changed verified email and rejects started deletion before exchange', async () => {
  const f = authFixture(); f.seed('authAccounts', 'legacy', { userId: 'user', provider: 'apple', providerAccountId: 'dummy-auth-sub' });
  f.seed('users', 'email-owner', { email: emailClaims.email, emailVerificationTime: now - 1 });
  f.seed('profiles', 'started', { userId: 'user', deletionStartedAt: now });
  const signed = await token(emailClaims); const fetcher = providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/deletion has started/);
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0); expect(f.jobs).toHaveLength(0);
  f.rows.delete('started');
  expect(await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).toMatchObject({ userId: 'user' });
  expect(f.all('authAccounts').find(a => a.provider === 'apple-native')?.userId).toBe('user');
});
it('does not trust caller email or link an unverified/relay claim', async () => {
  for (const claims of [{ email_verified: false }, { is_private_email: true }]) {
    const f = authFixture(); f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
    f.seed('profiles', 'started', { userId: 'user', deletionStartedAt: now });
    const signed = await token({ ...emailClaims, ...claims }); providerFetch(signed);
    const result = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy', email: emailClaims.email });
    expect(result.userId).not.toBe('user');
  }
});
it('reads provenance only from the exact SDK session, not another session or linked auth account', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const result = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' });
  f.signIn(`user|${result.sessionId}`);
  expect(await f.call(nativeIdentity)).toMatchObject({ userId: 'user', sessionId: result.sessionId, subject: 'dummy-auth-sub' });
  for (const method of ['password', 'google']) {
    const id = `${method}-session`; f.seed('authSessions', id, { userId: 'user', expirationTime: now + 100000 }); f.signIn(`user|${id}`);
    expect(await f.call(nativeIdentity)).toMatchObject({ userId: 'user', sessionId: id, exists: true, subject: null });
  }
  f.seed('authSessions', 'other-session', { userId: 'other', expirationTime: now + 100000, appleSubject: 'other-subject' }); f.signIn('user|other-session');
  expect(await f.call(nativeIdentity)).toMatchObject({ subject: null });
  f.rows.delete('user'); expect(await f.call(nativeIdentity)).toMatchObject({ exists: false, subject: null });
});
it('uses the pinned SDK session hook to reject deletion racing after finalization', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const run = state.run.getMockImplementation()!;
  state.run.mockImplementation(async (ref: any, args: any) => {
    if (ref === 'auth:store') f.seed('profiles', 'late-start', { userId: 'user', deletionStartedAt: now });
    return run(ref, args);
  });
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' })).rejects.toThrow(/deletion has started/);
  expect(f.all('authSessions')).toHaveLength(0);
});

it('migrates existing legacy-only subject ownership without token configuration', async () => {
  vi.stubEnv('APPLE_PRIVATE_KEY', ''); const f = authFixture();
  f.seed('authAccounts', 'legacy', { userId: 'user', provider: 'apple', providerAccountId: 'dummy-auth-sub' });
  const signed = await token(); const fetcher = providerFetch(signed);
  expect(await authorize({ identityToken: signed, nonce })).toMatchObject({ userId: 'user' });
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0);
  expect(f.all('authAccounts').filter(a => a.provider === 'apple-native')).toHaveLength(1);
  expect(f.all('users')).toHaveLength(1);
});
it('preserves SDK session reuse and normal replacement cleanup without leaking provenance to another method', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const first = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' });
  const reused = await state.run('auth:store', { args: { type: 'signIn', userId: 'user', sessionId: first.sessionId, generateTokens: false } });
  expect(reused.sessionId).toBe(first.sessionId); expect(f.all('authSessions')).toHaveLength(1);
  f.seed('authRefreshTokens', 'old-refresh', { sessionId: first.sessionId, expirationTime: now + 100000 });
  f.signIn(`user|${first.sessionId}`);
  const second = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' });
  expect(second.sessionId).not.toBe(first.sessionId); expect(f.rows.has(first.sessionId)).toBe(false);
  expect(f.rows.has('old-refresh')).toBe(false);
  // The ordinary SDK path still creates an unmarked session, even for this linked user.
  f.signIn(`user|${second.sessionId}`);
  const independent = await state.run('auth:store', { args: { type: 'signIn', userId: 'user', generateTokens: false } });
  expect(f.rows.get(independent.sessionId).appleSubject).toBeUndefined();
});

it('retains the SDK configured total session duration', async () => {
  vi.stubEnv('AUTH_SESSION_TOTAL_DURATION_MS', '123456');
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const result = await authorize({ identityToken: signed, nonce, authorizationCode: 'dummy' });
  expect(f.rows.get(result.sessionId).expirationTime).toBe(now + 123456);
});

it('does not recreate a pre-exchange email target fully erased during exchange', async () => {
  const f = authFixture();
  f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
  f.seed('profiles', 'delete-profile', { userId: 'user', deletionScheduledAt: now - 1 });
  const signed = await token(emailClaims);
  const fetcher = providerFetch(signed);
  fetcher.mockImplementation(async (url: string) => {
    if (url.endsWith('/keys')) return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'auth-test-key', kty: 'RSA' }] }));
    expect(url).toBe('https://appleid.apple.com/auth/token');
    // Real registered cascade, no subject guard exists for this unlinked subject.
    await f.call(executeScheduledDeletion, { userId: 'user' });
    expect(f.rows.has('user')).toBe(false);
    expect(f.all('appleDeletionGuards')).toHaveLength(0);
    return new Response(JSON.stringify({ id_token: signed, refresh_token: 'synthetic-in-flight-refresh' }));
  });
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'synthetic-code' })).rejects.toThrow(/no longer exists|target changed/);
  expect(f.all('users')).toHaveLength(0);
  expect(f.all('authAccounts')).toHaveLength(0);
  expect(f.all('authSessions')).toHaveLength(0);
  expect(f.all('appleCredentials')).toEqual([expect.objectContaining({ state: 'pending', envelope: expect.any(Object) })]);
  expect(f.all('appleCredentials')[0].userId).toBeUndefined();
});

it('does not rebind an in-flight email-only sign-in to a different verified owner', async () => {
  const f = authFixture(); f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
  const signed = await token(emailClaims); const fetcher = providerFetch(signed);
  fetcher.mockImplementation(async (url: string) => {
    if (url.endsWith('/keys')) return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'auth-test-key', kty: 'RSA' }] }));
    f.seed('users', 'user', { email: 'changed@invalid.test', emailVerificationTime: now - 1 });
    f.seed('users', 'new-email-owner', { email: emailClaims.email, emailVerificationTime: now - 1 });
    return new Response(JSON.stringify({ id_token: signed, refresh_token: 'synthetic-in-flight-refresh' }));
  });
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'synthetic-code' })).rejects.toThrow(/target changed/);
  expect(f.all('users').map(row => row._id).sort()).toEqual(['new-email-owner', 'user']);
  expect(f.all('authAccounts')).toHaveLength(0); expect(f.all('authSessions')).toHaveLength(0);
  expect(f.all('appleCredentials').every(row => row.userId === undefined && row.state === 'pending')).toBe(true);
});

// Old deployed native and web send exactly these fields. Neither sends code;
// old web also omits redirectURI. All cases use real signed Apple claims and SDK store.
it.each(['com.arsiktech.numa', 'com.arsiktech.numa.web'])('old payload returns its subject owner with exact SDK session: %s', async aud => {
  const f = authFixture('user'); const signed = await token({ aud }); const fetcher = providerFetch(signed);
  const result = await authorize({ identityToken: signed, nonce, name: 'Returning Apple' });
  expect(result).toMatchObject({ userId: 'user', sessionId: expect.any(String) });
  expect(f.all('users')).toHaveLength(1);
  expect(f.all('authSessions')).toEqual([expect.objectContaining({ _id: result.sessionId, userId: 'user', appleSubject: 'dummy-auth-sub' })]);
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0);
});
it.each(['com.arsiktech.numa', 'com.arsiktech.numa.web'])('old new signup requires update without account/session/token writes: %s', async aud => {
  const f = authFixture(); const signed = await token({ aud }); providerFetch(signed);
  const before = [...f.rows];
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/update|current.*client/i);
  expect([...f.rows]).toEqual(before); expect(f.jobs).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
});
it.each(['password', 'google'])('verified email alone never grants identity-only ownership: %s', async provider => {
  const f = authFixture(); f.seed('users', 'user', { email: emailClaims.email, emailVerificationTime: now - 1 });
  f.seed('authAccounts', 'email-only', { userId: 'user', provider, providerAccountId: emailClaims.email });
  const signed = await token(emailClaims); providerFetch(signed); const before = [...f.rows];
  await expect(authorize({ identityToken: signed, nonce, legacy: true, clientVersion: 'old' })).rejects.toThrow(/update|current.*client/i);
  expect([...f.rows]).toEqual(before); expect(state.create).not.toHaveBeenCalled();
});
it.each([undefined, null, '', 123, false, {}, []])('supplied invalid code never falls back: %j', async authorizationCode => {
  const f = authFixture('user'); const signed = await token(); const fetcher = providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode })).rejects.toThrow(/code/i);
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0);
});
it.each(['wrong', 'replayed'])('provider-rejected supplied %s code never falls back', async authorizationCode => {
  const f = authFixture('user'); const signed = await token(); const fetcher = providerFetch(signed);
  fetcher.mockImplementation(async (url: string) => url.endsWith('/keys')
    ? new Response(JSON.stringify({ keys: [{ ...pub, kid: 'auth-test-key', kty: 'RSA' }] }))
    : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
  await expect(authorize({ identityToken: signed, nonce, authorizationCode })).rejects.toThrow(/exchange failed/);
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(1);
});
it.each([{ sub: 'different-subject' }, { aud: 'com.arsiktech.numa.web' }, { nonce: 'different-nonce' }])('mismatched exchanged identity never falls back: %j', async claims => {
  const f = authFixture('user'); const signed = await token(); providerFetch(await token(claims));
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'provided-code' })).rejects.toThrow();
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
});
it.each([undefined, null, '', 1, false, 'https://evil.invalid'])('supplied bad web redirect rejects even with omitted code: %j', async redirectURI => {
  const f = authFixture('user'); const signed = await token({ aud: 'com.arsiktech.numa.web' }); providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, redirectURI })).rejects.toThrow(/redirect/);
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
});
it('valid current web signup still exchanges with its exact redirect', async () => {
  const f = authFixture(); const signed = await token({ aud: 'com.arsiktech.numa.web' }); const fetcher = providerFetch(signed);
  const result = await authorize({ identityToken: signed, nonce, authorizationCode: 'current-code', redirectURI: 'https://numaworth.com' });
  expect(result.sessionId).toEqual(expect.any(String)); expect(f.all('appleCredentials')[0].envelope).toBeDefined();
  const call = fetcher.mock.calls.find(c => c[0].endsWith('/auth/token'));
  expect(call).toBeDefined();
});
it('legacy-only subject migrates to same user without trusting changed email', async () => {
  const f = authFixture(); f.seed('authAccounts', 'legacy', { userId: 'user', provider: 'apple', providerAccountId: 'dummy-auth-sub' });
  f.seed('users', 'email-owner', { email: emailClaims.email, emailVerificationTime: now - 1 });
  const signed = await token(emailClaims); providerFetch(signed);
  expect(await authorize({ identityToken: signed, nonce })).toMatchObject({ userId: 'user' });
  expect(f.all('users')).toHaveLength(2);
  expect(f.all('authAccounts').find(a => a.provider === 'apple-native')?.userId).toBe('user');
});
it('identity-only returning sign-in retains the ready encrypted credential byte-for-byte', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  await authorize({ identityToken: signed, nonce, authorizationCode: 'initial-code' });
  const before = f.all('appleCredentials'); f.signIn(null);
  await authorize({ identityToken: signed, nonce });
  expect(f.all('appleCredentials')).toEqual(before);
});
it('identity-only keeps scheduled deletion grace but rejects started/completed deletion', async () => {
  const signed = await token(); providerFetch(signed);
  const f = authFixture('user'); f.seed('profiles', 'grace', { userId: 'user', deletionScheduledAt: now + 10000 });
  expect(await authorize({ identityToken: signed, nonce })).toMatchObject({ userId: 'user' });
  f.signIn(null); f.seed('profiles', 'grace', { userId: 'user', deletionStartedAt: now });
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/deletion/);
  const deleted = authFixture('user'); deleted.rows.delete('user');
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/no longer exists/);
});
it.each(['erase', 'change-owner'])('identity-only pins original target through callback/finalization: %s', async race => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const create = state.create.getMockImplementation()!;
  state.create.mockImplementation(async (...args: any[]) => {
    if (race === 'erase') { f.rows.delete('user'); f.rows.delete('existing-apple'); }
    else { f.seed('users', 'other', {}); f.seed('authAccounts', 'existing-apple', { userId: 'other', provider: 'apple-native', providerAccountId: 'dummy-auth-sub' }); }
    return create(...args);
  });
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/no longer exists|target changed|mismatch/);
  expect(f.all('authSessions')).toHaveLength(0); expect(f.all('appleCredentials')).toHaveLength(0);
});
it('identity-only rechecks subject guard immediately before finalization', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed); const run = state.run.getMockImplementation()!;
  state.run.mockImplementation(async (ref: any, args: any) => {
    if (getFunctionName(ref) === 'appleLifecycle:finalizeSignIn') f.seed('appleDeletionGuards', 'late', { subjectHash: await sha256Hex('dummy-auth-sub'), expiresAt: now + 660000 });
    return run(ref, args);
  });
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow(/deletion/);
  expect(f.all('authSessions')).toHaveLength(0);
});
it.each([{ aud: 'wrong-audience' }, { iat: Math.floor(now / 1000) - 601 }, { nonce: 'wrong-hash' }])('identity-only retains verified audience/freshness/nonce checks: %j', async claims => {
  const f = authFixture('user'); const signed = await token(claims); providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce })).rejects.toThrow();
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
});
it('identity-only rejects a tampered signature', async () => {
  const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  const parts = signed.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await expect(authorize({ identityToken: parts.join('.'), nonce })).rejects.toThrow(/signature/);
  expect(f.all('authSessions')).toHaveLength(0);
});
it('supplied code cannot silently downgrade when configuration is missing', async () => {
  vi.stubEnv('APPLE_PRIVATE_KEY', ''); const f = authFixture('user'); const signed = await token(); providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'provided' })).rejects.toThrow(/exchange.*unavailable/i);
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
});
it('old unmarked session refresh uses the pinned SDK store without Apple exchange or provenance backfill', async () => {
  const f = authFixture('user');
  vi.stubEnv('JWT_PRIVATE_KEY', `-----BEGIN PRIVATE KEY-----
${b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)))}
-----END PRIVATE KEY-----`);
  vi.stubEnv('CONVEX_SITE_URL', 'https://synthetic.invalid');
  f.seed('authSessions', 'old-session', { userId: 'user', expirationTime: now + 100000 });
  f.seed('authRefreshTokens', 'old-refresh', { sessionId: 'old-session', expirationTime: now + 100000 });
  const fetcher = vi.fn(() => { throw new Error('refresh must not call Apple'); }); vi.stubGlobal('fetch', fetcher);
  const result = await state.run('auth:store', { args: { type: 'refreshSession', refreshToken: 'old-refresh|old-session' } });
  expect(result).toMatchObject({ token: expect.any(String), refreshToken: expect.any(String) });
  const claims = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString());
  expect(claims.sub).toBe('user|old-session'); expect(f.rows.get('old-session').appleSubject).toBeUndefined();
  expect(f.rows.get('old-refresh').firstUsedTime).toBe(now); expect(fetcher).not.toHaveBeenCalled();
});

it.each([null, '', 9, 'https://evil.invalid'])('supplied bad web redirect with a code never downgrades: %j', async redirectURI => {
  const f = authFixture('user'); const signed = await token({ aud: 'com.arsiktech.numa.web' }); const fetcher = providerFetch(signed);
  await expect(authorize({ identityToken: signed, nonce, authorizationCode: 'provided', redirectURI })).rejects.toThrow(/redirect/);
  expect(f.all('authSessions')).toHaveLength(0); expect(state.create).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(c => c[0].endsWith('/auth/token'))).toHaveLength(0);
});

it.each(['another-subject', 'pending-revocation'])('identity-only cannot relabel or reactivate an existing encrypted grant: %s', async variant => {
  const f = authFixture('user');
  const capturedSubject = variant === 'another-subject' ? 'second-owned-apple' : 'dummy-auth-sub';
  if (variant === 'another-subject') f.seed('authAccounts', 'second-owned-apple', { userId: 'user', provider: 'apple-native', providerAccountId: capturedSubject });
  const captured = await token({ sub: capturedSubject }); providerFetch(captured);
  await authorize({ identityToken: captured, nonce, authorizationCode: 'captured-code' });
  f.signIn(null);
  if (variant === 'pending-revocation') {
    const row = f.all('appleCredentials')[0];
    f.seed('appleCredentials', row._id, { ...row, state: 'pending', attempts: 1, leaseUntil: now + 5000, expiresAt: now + 60000 });
  }
  const before = structuredClone(f.all('appleCredentials'));
  const sessions = structuredClone(f.all('authSessions'));
  const old = await token(); providerFetch(old);
  await expect(authorize({ identityToken: old, nonce })).rejects.toThrow(/fresh|current|update/i);
  expect(f.all('appleCredentials')).toEqual(before);
  expect(f.all('authSessions')).toEqual(sessions);
});
