import { convertCents, isFxCurrent, parseFrankfurter, readSavedFx } from './fx';

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
