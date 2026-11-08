import { convertCents, fetchFxRate, isFxCurrent, loadFx, parseFrankfurter, readSavedFx, type FxRate } from './fx';

describe('FX observation evidence (UTC calendar days)', () => {
  const monday = Date.UTC(2026, 0, 19, 23, 59);
  it('accepts a normal Friday-to-Monday publication gap throughout the UTC day', () => {
    expect(isFxCurrent({ usdPerEur: 1.17, asOf: '2026-01-16' }, monday)).toBe(true);
  });
  it('accepts an Easter-like Thursday-to-Tuesday five-day gap, inclusive, and rejects day six', () => {
    const fx = { usdPerEur: 1.17, asOf: '2026-04-02' };
    expect(isFxCurrent(fx, Date.UTC(2026, 3, 7, 23, 59, 59))).toBe(true);
    expect(isFxCurrent(fx, Date.UTC(2026, 3, 8))).toBe(false);
  });
  it.each(['2026-1-16', '2026-01-16T00:00:00Z', '2026-02-30', '2025-02-29', '2026-00-16', '2026-13-01', '0000-01-01', '', 'tomorrow'])('rejects a malformed or invalid civil date: %s', (asOf) => {
    expect(isFxCurrent({ usdPerEur: 1.17, asOf }, monday)).toBe(false);
  });
  it('validates leap days exactly and crosses UTC month/year boundaries', () => {
    expect(isFxCurrent({ usdPerEur: 1.17, asOf: '2024-02-29' }, Date.UTC(2024, 2, 5))).toBe(true);
    expect(isFxCurrent({ usdPerEur: 1.17, asOf: '2025-12-31' }, Date.UTC(2026, 0, 5))).toBe(true);
  });
  it('rejects future UTC dates and months-old observations, including rates accepted by the existing cache parser', () => {
    expect(isFxCurrent({ usdPerEur: 1.17, asOf: '2026-01-20' }, monday)).toBe(false);
    const cached = readSavedFx('{"usdPerEur":1.17,"asOf":"2025-06-03"}');
    expect(cached).not.toBeNull(); expect(isFxCurrent(cached, monday)).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid numeric rate %s', (usdPerEur) => {
    expect(isFxCurrent({ usdPerEur, asOf: '2026-01-19' }, monday)).toBe(false);
  });
  it('rejects absent rates and invalid clocks', () => {
    expect(isFxCurrent(null, monday)).toBe(false);
    for (const now of [NaN, Infinity, 9e20]) expect(isFxCurrent({ usdPerEur: 1.17, asOf: '2026-01-19' }, now)).toBe(false);
  });
  it('leaves conversion, parsing and saved-rate semantics available for last-known headlines', () => {
    const stale = parseFrankfurter({ rates: { USD: 1.2 }, date: '2025-06-03' });
    expect(stale).toEqual(readSavedFx('{"usdPerEur":1.2,"asOf":"2025-06-03"}'));
    expect(convertCents(12000, 'USD', 'EUR', stale)).toBe(10000);
    expect(convertCents(12000, 'USD', 'USD', null)).toBe(12000);
  });
});

describe('loading the rate without holding Home', () => {
  const now = Date.UTC(2026, 0, 19);
  const current = { usdPerEur: 1.1, asOf: '2026-01-19' };
  const old = { usdPerEur: 1.05, asOf: '2025-06-03' };
  const today = { usdPerEur: 1.2, asOf: '2026-01-19' };
  const run = (raw: string | null, fetchRate: () => Promise<FxRate | null>) => {
    const published: (FxRate | null)[] = [];
    const saves: string[] = [];
    const done = loadFx({ readSaved: async () => raw, fetchRate, save: (v) => saves.push(v), now }, (fx) => published.push(fx));
    return { published, saves, done };
  };

  it('shows a current saved rate before the request finishes, then today\'s rate', async () => {
    let finish!: (fx: FxRate | null) => void;
    const r = run(JSON.stringify(current), () => new Promise((resolve) => { finish = resolve; }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.published).toEqual([current]);
    finish(today);
    await r.done;
    expect(r.published).toEqual([current, today]);
    expect(r.saves).toEqual([JSON.stringify(today)]);
  });
  it('does not flash an old saved rate when today\'s rate arrives', async () => {
    const r = run(JSON.stringify(old), async () => today);
    await r.done;
    expect(r.published).toEqual([today]);
  });
  it('falls back to an old saved rate when the request fails', async () => {
    const r = run(JSON.stringify(old), async () => null);
    await r.done;
    expect(r.published).toEqual([old]);
    expect(r.saves).toEqual([]);
  });
  it('still publishes when there is no rate at all, so Home can say totals are unavailable', async () => {
    const r = run(null, async () => null);
    await r.done;
    expect(r.published).toEqual([null]);
  });
  it('survives unreadable storage', async () => {
    const published: (FxRate | null)[] = [];
    await loadFx({ readSaved: async () => { throw new Error('denied'); }, fetchRate: async () => null, save: () => {}, now }, (fx) => published.push(fx));
    expect(published).toEqual([null]);
  });
  it('gives up on a request that hangs', async () => {
    const hanging = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    await expect(fetchFxRate(hanging, 5)).resolves.toBeNull();
  });
  it('reads a good response and rejects a failed one', async () => {
    const reply = (ok: boolean) => (async () => ({ ok, json: async () => ({ rates: { USD: 1.2 }, date: '2026-01-19' }) })) as unknown as typeof fetch;
    await expect(fetchFxRate(reply(true))).resolves.toEqual(today);
    await expect(fetchFxRate(reply(false))).resolves.toBeNull();
  });
});
