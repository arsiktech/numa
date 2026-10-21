describe('Apple web sign-in recovery', () => {
  const originals = Object.fromEntries(['document', 'window', 'location', 'AppleID'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let tags: { onload?: () => void; onerror?: () => void; remove: jest.Mock }[];
  beforeEach(() => {
    jest.resetModules(); jest.useFakeTimers(); tags = [];
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ remove: jest.fn() }), head: { appendChild: (tag: typeof tags[number]) => tags.push(tag) } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://numaworth.com' } } });
    Object.defineProperty(globalThis, 'AppleID', { configurable: true, writable: true, value: undefined });
  });
  afterEach(() => {
    jest.useRealTimers();
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  it('ends a stalled SDK load with an error instead of an endless spinner', async () => {
    const { appleWebSignIn } = jest.requireActual<typeof import('./appleWeb')>('./appleWeb');
    let outcome = 'pending';
    void appleWebSignIn('nonce').then(() => { outcome = 'success'; }, () => { outcome = 'error'; });
    await jest.advanceTimersByTimeAsync(9000);
    expect(outcome).toBe('error');
    expect(tags[0].remove).toHaveBeenCalled();
  });
  it('allows a new attempt when the script loads without its API', async () => {
    const { appleWebSignIn } = jest.requireActual<typeof import('./appleWeb')>('./appleWeb');
    const first = appleWebSignIn('nonce').catch(() => null);
    tags[0].onload?.(); await first;
    const second = appleWebSignIn('nonce').catch(() => null);
    expect(tags).toHaveLength(2);
    tags[1].onerror?.(); await second;
  });
  it('cancels a pending popup and ignores a late identity response', async () => {
    let finish: (v: unknown) => void = () => {};
    Object.defineProperty(globalThis, 'AppleID', { configurable: true, writable: true, value: { auth: { init: jest.fn(), signIn: () => new Promise((resolve) => { finish = resolve; }) } } });
    const { appleWebSignIn } = jest.requireActual<typeof import('./appleWeb')>('./appleWeb');
    const controller = new AbortController(); let result: unknown = 'pending';
    const pending = appleWebSignIn('nonce', controller.signal).then((value: unknown) => { result = value; });
    await Promise.resolve(); controller.abort(); await jest.advanceTimersByTimeAsync(0);
    expect(result).toBe('cancelled');
    finish({ authorization: { id_token: 'test-only-token' } }); await pending;
    expect(result).toBe('cancelled');
  });
  it('captures the authorization code instead of discarding it', async () => {
    const init = jest.fn();
    Object.defineProperty(globalThis, 'AppleID', { configurable: true, value: { auth: { init, signIn: async () => ({ authorization: { id_token: 'fixture-token', code: 'fixture-code' } }) } } });
    const { appleWebSignIn } = jest.requireActual<typeof import('./appleWeb')>('./appleWeb');
    expect(await appleWebSignIn('hashed')).toMatchObject({ identityToken: 'fixture-token', authorizationCode: 'fixture-code' });
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ responseType: 'code id_token' }));
  });

});
