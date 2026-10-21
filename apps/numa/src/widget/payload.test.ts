import { fromSnapshot } from '@/data/fromSnapshot';
import { itemsFrom } from '@/data/items';
import { moneyMap } from '@/data/moneyMap';
import { monthCalendar } from '@/flow/calendar';
import { monthOf, transactionsIn } from '@/flow/month';
import { localDay, sampleFx, sampleInput, sampleNow, sampleSnapshot, sampleTransaction } from './fixtures';
import { datedHistory, widgetDailyChange, widgetPayload, widgetTrend } from './payload';
import galleryReady from './samples/ready.json';
import galleryLarge from './samples/largeValues.json';

describe('widget v2 payload and legacy contract', () => {
  it('retains every v1 field, without emitting an untimed diagonal to an old binary', () => {
    const payload = widgetPayload(sampleInput());
    const { net, today, up, line, updatedAt } = payload;
    expect({ net, today, up, line, updatedAt }).toEqual({
      net: '−€260', today: '+€8.40 quote change today', up: true, line: [], updatedAt: sampleNow,
    });
    expect(payload).toMatchObject({ version: 2, privacy: 'visible', syncedAt: sampleNow });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(expect.objectContaining({ net, today, up, line, updatedAt }));
  });

  it('keeps an actual source timestamp distinct from the app-observation time and minute clock', () => {
    const input = sampleInput();
    const later = widgetPayload({ ...input, now: sampleNow + 60_000 });
    expect(later.updatedAt).toBe(sampleNow);
    expect(later.syncedAt).toBe(sampleNow);
    expect(later.freshness).toMatchObject({ sourceAsOf: sampleNow - 120_000, quotesAsOf: sampleNow - 120_000, quotes: 'current' });
    expect(later.netWorth.trend?.points.at(-1)?.t).toBe(localDay(20));
  });

  it('reproduces the shared summary and Money map without counting lent assets twice', () => {
    const input = sampleInput();
    const payload = widgetPayload(input);
    const map = moneyMap(input.snapshot, itemsFrom(input.snapshot, input.data, input.now, input.fx), 'EUR', input.fx);
    // Five EUR assets total €500. Quotes are USD: 2×$25 / 1.25 = €40, plus $125 / 1.25 = €100.
    const expectedOwnCents = (200 + 80 + 120 + 60 + 40) * 100 + Math.round((2 * 25 + 125) / sampleFx.usdPerEur * 100);
    expect(expectedOwnCents).toBe(64_000);
    expect(input.summary).toMatchObject({ ownCents: expectedOwnCents, oweCents: 90_000, netCents: expectedOwnCents - 90_000 });
    expect(map).toMatchObject({ ownCents: 56_000, owedToYouCents: 8000, youOweCents: 90_000, netCents: -26_000 });
    expect(payload.moneyMap).toMatchObject({ state: 'ready', toYou: { exact: '€80.00' }, youOwe: { exact: '€900.00' }, toFraction: 8000 / 90_000, oweFraction: 1 });
    expect(payload.blocks).toMatchObject({ state: 'ready', own: { exact: '€640.00' }, owe: { exact: '€900.00' }, net: { exact: '−€260.00' }, ownFraction: 64_000 / 90_000, oweFraction: 1 });
    expect(payload.blocks.categories?.map((c) => [c.key, c.value.exact, c.fraction])).toEqual([
      ['crypto', '€40.00', 4000 / 64_000], ['stocks', '€100.00', 10_000 / 64_000],
      ['business', '€60.00', 6000 / 64_000], ['property', '€120.00', 12_000 / 64_000],
      ['cash', '€200.00', 20_000 / 64_000], ['things', '€120.00', 12_000 / 64_000],
    ]);
    expect(payload.blocks.categories?.reduce((sum, c) => sum + c.fraction, 0)).toBeCloseTo(1);
  });

  it('keeps tiny categories in the external legend and preserves very large and negative totals', () => {
    const input = sampleInput();
    const tiny = widgetPayload({ ...input, summary: {
      ...input.summary, ownCents: 1_000_000, oweCents: 2_000_000, netCents: -1_000_000,
      categories: [
        { category: 'cash', cents: 999_999, cashCents: 999_999, liquidCents: 999_999, marketCents: 0, marketLiquidCents: 0, marketCashCents: 0, share: 0.999999 },
        { category: 'things', cents: 1, cashCents: 0, liquidCents: 0, marketCents: 0, marketLiquidCents: 0, marketCashCents: 0, share: 0.000001 },
      ],
    } });
    expect(tiny.blocks.categories?.[1]).toMatchObject({ key: 'things', fraction: 0.000001, percent: '<1%', value: { exact: '€0.01' } });
    const large = widgetPayload({ ...input, summary: { ...input.summary, netCents: -8_000_000_000_000_000 } });
    expect(large.netWorth.value?.text).toBe('−€80,000,000,000,000');
    expect(large.netWorth.value?.compact).not.toContain('Infinity');
  });

  it('uses the exact local month calendar, Monday alignment, day keys, and existing future filter', () => {
    const input = sampleInput();
    const payload = widgetPayload(input).spending;
    const month = monthOf(input.now);
    const cal = monthCalendar(transactionsIn(input.snapshot.transactions, month, new Date(input.now)), month, 'EUR', sampleFx, input.now);
    expect(payload).toMatchObject({ state: 'ready', month: 'October', monthKey: '2026-10', lead: 3, total: { exact: '€36.00' }, validUntil: new Date(2026, 9, 22).getTime() });
    expect(payload.days).toHaveLength(31);
    expect(payload.days?.[2]).toMatchObject({ key: '2026-10-03', day: 3, level: 4, unknown: false, future: false });
    expect(payload.days?.[11].level).toBe(cal.days[11].level);
    expect(payload.days?.[14].level).toBe(0); // Income does not leak into spending intensity.
    expect(payload.days?.[21]).toMatchObject({ future: true, level: 0 });
    expect(payload.days?.[28]).toMatchObject({ future: true, level: 0 });
    expect(JSON.stringify(payload)).not.toMatch(/example-t|txIds|income|accountId/);
  });

  it('matches local month boundaries rather than UTC grouping', () => {
    const s = sampleSnapshot();
    const at = new Date(2026, 9, 1, 0, 5).getTime();
    s.transactions = [sampleTransaction('example-midnight', 1, 1234, { occurredAt: at })];
    const spending = widgetPayload(sampleInput(s)).spending;
    expect(spending.days?.[0]).toMatchObject({ key: '2026-10-01', level: 4 });
    expect(spending.total?.exact).toBe('€12.34');
  });

  it.each(['EUR', 'USD'] as const)('caps the 23:30 clock allowance at local midnight for a next-day %s expense', (currency) => {
    const now = new Date(2026, 9, 21, 23, 30).getTime();
    const nextMidnight = new Date(2026, 9, 22).getTime();
    const snapshot = sampleSnapshot();
    snapshot.transactions = [
      sampleTransaction('example-elapsed', 3, 3200),
      sampleTransaction('example-same-day-slack', 21, 400, { occurredAt: new Date(2026, 9, 21, 23, 45).getTime() }),
    ];
    // Missing FX makes an accidentally included USD expense change coverage as well as shading.
    const baseline = widgetPayload(sampleInput(snapshot, null, now)).spending;
    const nextDay = sampleTransaction('example-next-day-slack', 22, 5_000_000, {
      currency, occurredAt: new Date(2026, 9, 22, 0, 10).getTime(),
    });
    const atBoundary = sampleTransaction('example-at-midnight', 22, 7_000_000, { currency, occurredAt: nextMidnight });
    // Both excluded records really do fit the shared one-hour allowance in every parent timezone.
    expect(transactionsIn([nextDay, atBoundary], monthOf(now), new Date(now))).toHaveLength(2);
    snapshot.transactions.push(nextDay, atBoundary);
    const spending = widgetPayload(sampleInput(snapshot, null, now)).spending;
    expect(spending).toEqual(baseline); // Includes total, FX state, every shade, and every description.
    expect(spending).toMatchObject({ state: 'ready', validUntil: nextMidnight, total: { exact: '€36.00' } });
    expect(spending.days?.[2]).toMatchObject({ level: 4, description: '3 October: €32.00 spent' });
    expect(spending.days?.[20]).toMatchObject({ level: 2, future: false, unknown: false, description: '21 October: €4.00 spent' });
    expect(spending.days?.[21]).toMatchObject({ level: 0, future: true, unknown: false, description: '22 October: future date' });
  });

  it('keeps a near-midnight month empty when the only expense is on the future local day', () => {
    const now = new Date(2026, 9, 21, 23, 30).getTime();
    const snapshot = sampleSnapshot();
    snapshot.transactions = [sampleTransaction('example-only-future', 22, 5000, {
      currency: 'USD', occurredAt: new Date(2026, 9, 22, 0, 10).getTime(),
    })];
    const spending = widgetPayload(sampleInput(snapshot, null, now)).spending;
    expect(spending).toMatchObject({ state: 'empty', total: { exact: '€0.00' }, message: 'No spending logged this month' });
    expect(spending.days?.every((day) => day.level === 0 && !day.unknown)).toBe(true);
  });

  it.each([
    { year: 2026, month: 2, count: 31, lead: 6, rows: 6 },
    { year: 2028, month: 1, count: 29, lead: 1, rows: 5 },
  ])('keeps actual day counts and alignment for $year/$month', ({ year, month, count, lead, rows }) => {
    const s = sampleSnapshot();
    s.assets = []; s.holdings = []; s.liabilities = []; s.wealthSnapshots = [];
    s.transactions = [sampleTransaction('example-boundary', 1, 1234, { occurredAt: new Date(year, month, 1, 0, 5).getTime() })];
    const spending = widgetPayload(sampleInput(s, sampleFx, new Date(year, month, 15, 12).getTime())).spending;
    expect(spending.days).toHaveLength(count);
    expect(spending.lead).toBe(lead);
    expect(Math.ceil((spending.lead! + spending.days!.length) / 7)).toBe(rows);
    expect(spending.days?.[0].level).toBe(4);
    expect(spending.total?.exact).toBe('€12.34');
  });

  it('marks missing FX as partial/unavailable, never as a complete zero', () => {
    const input = sampleInput(sampleSnapshot(), null);
    const payload = widgetPayload(input);
    expect(payload.netWorth.state).toBe('unavailable');
    expect(payload.blocks.state).toBe('unavailable');
    expect(payload.moneyMap.state).toBe('partial');
    expect(payload.spending).toMatchObject({ state: 'partial', total: { exact: '€16.00' } });
    expect(payload.spending.days?.[2]).toMatchObject({ unknown: true });
    expect(payload.spending.days?.[2].description).toContain('unconverted');
    const s = sampleSnapshot();
    s.assets[1] = { ...s.assets[1], currency: 'USD' };
    expect(widgetPayload(sampleInput(s, null)).moneyMap).toMatchObject({ state: 'partial', toYou: { text: '€0' } });
  });

  it('provides empty states for every infographic', () => {
    const snapshot = sampleSnapshot();
    snapshot.assets = []; snapshot.holdings = []; snapshot.liabilities = []; snapshot.transactions = []; snapshot.wealthSnapshots = [];
    const payload = widgetPayload(sampleInput(snapshot));
    for (const section of [payload.netWorth, payload.moneyMap, payload.spending, payload.blocks]) expect(section.state).toBe('empty');
    expect(payload.spending.days?.every((d) => d.level === 0 && !d.unknown)).toBe(true);
  });

  it('does not serialize any financial content when hidden, including activity, ratios and freshness', () => {
    const input = sampleInput();
    const hidden = widgetPayload({ ...input, hidden: true });
    expect(hidden).toEqual({
      version: 2, privacy: 'hidden', syncedAt: sampleNow, updatedAt: sampleNow,
      net: '••••', today: '', up: true, line: [],
      netWorth: { state: 'hidden' }, moneyMap: { state: 'hidden' }, spending: { state: 'hidden' }, blocks: { state: 'hidden' },
    });
    const guarded = { ...input, hidden: true };
    Object.defineProperty(guarded, 'snapshot', { get() { throw new Error('Hidden content must not be read'); } });
    expect(widgetPayload(guarded)).toEqual(hidden);
    expect(JSON.stringify(hidden)).not.toMatch(/fraction|category|days|points|quote|EUR|example|8000|90000/i);
  });

  it('validates finite cents, FX and times before publication', () => {
    const input = sampleInput();
    const bad = widgetPayload({ ...input, summary: { ...input.summary, netCents: NaN, ownCents: Infinity } });
    expect(bad.net).toBe('—');
    expect(bad.blocks.state).toBe('unavailable');
    const invalidFx = widgetPayload({ ...input, fx: { usdPerEur: Infinity, asOf: '2026-10-21' } });
    for (const section of [invalidFx.netWorth, invalidFx.moneyMap, invalidFx.spending, invalidFx.blocks]) expect(section.state).toBe('unavailable');
    expect(widgetPayload({ ...input, now: NaN }).netWorth.state).toBe('unavailable');
    expect(widgetPayload({ ...input, syncedAt: Infinity }).syncedAt).toBe(0);
    expect(JSON.stringify(bad)).not.toMatch(/NaN|Infinity/);
  });
});

describe('synthetic gallery fixture reconciliation', () => {
  it('keeps the ready fixture amounts and category widths tied to the real payload contract', () => {
    const fixture = galleryReady;
    const actual = widgetPayload(sampleInput());
    expect(fixture.net).toBe(actual.net);
    expect(fixture.blocks.own).toEqual(actual.blocks.own);
    expect(fixture.blocks.net).toEqual(actual.blocks.net);
    expect(fixture.blocks.ownFraction).toBe(actual.blocks.ownFraction);
    expect(fixture.blocks.categories.map((c: { key: string; fraction: number }) => [c.key, c.fraction])).toEqual(actual.blocks.categories?.map((c) => [c.key, c.fraction]));
    expect(fixture.blocks.categories.reduce((n: number, c: { fraction: number }) => n + c.fraction, 0)).toBeCloseTo(1);
    expect(fixture.netWorth.daily).toMatchObject({ amount: actual.netWorth.daily?.amount, period: 'quoteChange', currency: 'EUR', fxAsOf: sampleFx.asOf });
  });

  it('ties the large spending total, dates, descriptions and shades to the same synthetic expenses', () => {
    const snapshot = sampleSnapshot();
    snapshot.transactions = [
      sampleTransaction('example-large-first', 3, 11_200_000_000),
      sampleTransaction('example-large-second', 12, 1_600_000_000),
    ];
    const actual = widgetPayload(sampleInput(snapshot)).spending;
    expect(actual.total?.exact).toBe('€128,000,000.00');
    expect(galleryLarge.spending.total).toEqual(actual.total);
    expect(galleryLarge.spending.days).toEqual(actual.days);
    expect(galleryLarge.spending.monthKey).toBe(actual.monthKey);
    expect(galleryLarge.spending.lead).toBe(actual.lead);
    expect(galleryLarge.blocks.categories.reduce((sum, category) => sum + category.fraction, 0)).toBeCloseTo(1);
  });
});

describe('honest dated history', () => {
  const point = (day: number, cents = day * 100) => ({ t: localDay(day), cents });
  it('does not fabricate a current point or stretch zero, one or two observations into a line', () => {
    for (const points of [[], [point(1)], [point(1), point(5)]]) {
      expect(widgetTrend(points, sampleNow, 'EUR')).toBeUndefined();
      const input = sampleInput();
      const payload = widgetPayload({ ...input, data: { ...input.data, history: points } });
      expect(payload.netWorth.historyMessage).toContain('3 dated observations');
      expect(payload.line).toEqual([]);
    }
  });
  it('sorts, deduplicates and rejects non-finite, future and old points', () => {
    const points = [point(20), point(1), point(5), point(5, 700), point(8, NaN), point(7, Infinity), { t: NaN, cents: 1 }, point(29), { t: sampleNow - 31 * 86_400_000, cents: 1 }];
    expect(datedHistory(points, sampleNow)).toEqual([point(1), point(5, 700), point(20)]);
    expect(widgetTrend(points, sampleNow, 'EUR')?.points).toEqual([
      { t: localDay(1), y: 0 }, { t: localDay(5), y: 600 / 1900 }, { t: localDay(20), y: 1 },
    ]);
    expect(widgetTrend([point(1), point(1), point(20)], sampleNow, 'EUR')).toBeUndefined();
  });
  it('keeps timestamp distances rather than equidistant samples and keeps flat data finite', () => {
    const trend = widgetTrend([point(1), point(2), point(20)], sampleNow, 'EUR')!;
    expect((trend.points[1].t - trend.points[0].t) / (trend.points[2].t - trend.points[0].t)).toBeCloseTo(1 / 19);
    expect(widgetTrend([point(1, -500), point(5, -500), point(20, -500)], sampleNow, 'EUR')?.points.map((p) => p.y)).toEqual([0.5, 0.5, 0.5]);
  });
  it('does not hide missing conversion in history while the current portfolio is in one currency', () => {
    const s = sampleSnapshot();
    s.holdings = []; s.transactions = [];
    s.wealthSnapshots[0] = { ...s.wealthSnapshots[0], currency: 'USD' };
    expect(widgetPayload(sampleInput(s, null)).netWorth).toMatchObject({ state: 'ready', historyMessage: 'History needs exchange rates' });
    expect(widgetPayload(sampleInput(s, null)).netWorth.trend).toBeUndefined();
  });
});

describe('quote coverage, not a new daily return estimator', () => {
  it.each([NaN, Infinity, -100, 0])('keeps unavailable/ambiguous quote change %s out of daily change', (changePercent) => {
    const input = sampleInput();
    input.snapshot.holdings[0] = { ...input.snapshot.holdings[0], changePercent };
    expect(widgetDailyChange(input)).toMatchObject({ direction: 'unknown', text: 'Quote change unavailable', asOf: null });
  });
  it('does not silently treat a missing domain change or wallet change as zero', () => {
    const input = sampleInput();
    input.data.holdings = input.data.holdings.map((h) => h.id === 'example-stock' ? { ...h, changeTodayCents: undefined } : h);
    expect(widgetDailyChange(input).direction).toBe('unknown');
    const s = sampleSnapshot();
    s.wallets = [{ id: 'example-wallet', label: 'Example wallet', address: 'example-not-an-address', addressType: 'evm', includeInNetWorth: true, createdAt: sampleNow, snapshot: null }];
    expect(widgetDailyChange({ ...sampleInput(), snapshot: s }).direction).toBe('unknown');
  });
  it('rejects stale/missing quotes and reports their actual freshness', () => {
    const s = sampleSnapshot();
    s.holdings[0] = { ...s.holdings[0], quoteStale: true, quoteUpdatedAt: sampleNow - 2 * 86_400_000 };
    const payload = widgetPayload(sampleInput(s));
    expect(payload.netWorth.daily?.direction).toBe('unknown');
    expect(payload.freshness).toMatchObject({ quotes: 'stale', quotesAsOf: sampleNow - 2 * 86_400_000, stale: true });
    s.holdings[0] = { ...s.holdings[0], quoteUpdatedAt: null, quoteProvider: null };
    expect(widgetPayload(sampleInput(s)).freshness?.quotes).toBe('partial');
    const empty = sampleSnapshot(); empty.holdings = [];
    const data = fromSnapshot(empty, sampleFx, new Date(sampleNow));
    expect(widgetDailyChange({ snapshot: empty, data, fx: sampleFx, now: sampleNow }).text).toBe('No market prices today');
  });

  it.each([
    { age: 86_400_000 - 1, available: true },
    { age: 86_400_000, available: false },
    { age: 86_400_000 + 1, available: false },
    { age: 0, available: true },
    { age: -1, available: false },
    { age: -30_000, available: false },
    { age: -60_000, available: false },
    { age: -60_001, available: false },
  ])('uses strict 24-hour expiry and rejects every future quote: $age ms', ({ age, available }) => {
    const snapshot = sampleSnapshot();
    snapshot.holdings = snapshot.holdings.map((holding) => ({ ...holding, quoteUpdatedAt: sampleNow - age }));
    const payload = widgetPayload(sampleInput(snapshot));
    expect(payload.netWorth.daily?.direction).toBe(available ? 'up' : 'unknown');
    expect(payload.freshness?.quotes).toBe(available ? 'current' : 'stale');
    if (!available) expect(payload.netWorth.daily).toEqual({ text: 'Quote change unavailable', direction: 'unknown', asOf: null });
  });

  it.each([1, 30_000, 60_000])('rejects tomorrow quote evidence %s ms after local midnight boundary', (offset) => {
    const now = new Date(2026, 9, 21, 23, 59, 59, 999).getTime();
    const snapshot = sampleSnapshot();
    snapshot.holdings = snapshot.holdings.map((holding) => ({ ...holding, quoteUpdatedAt: now + offset }));
    const payload = widgetPayload(sampleInput(snapshot, sampleFx, now));
    expect(payload.netWorth.daily).toEqual({ text: 'Quote change unavailable', direction: 'unknown', asOf: null });
    expect(payload.freshness?.quotes).toBe('stale');
  });

  it.each([null, 0, -1, NaN, Infinity, 253_402_300_799_001])('rejects invalid quote timestamps %s before publishing daily metadata', (quoteUpdatedAt) => {
    const input = sampleInput();
    // Mutate the publication input after mapping, so upstream Date formatting cannot mask the guard.
    input.snapshot.holdings[0] = { ...input.snapshot.holdings[0], quoteUpdatedAt };
    expect(widgetDailyChange(input)).toEqual({ text: 'Quote change unavailable', direction: 'unknown', asOf: null });
  });

  it('uses the actual quote date when publication crosses local midnight without changing its timestamp', () => {
    const quoteTime = new Date(2026, 9, 21, 23, 50).getTime();
    const now = new Date(2026, 9, 22, 0, 10).getTime();
    const snapshot = sampleSnapshot();
    snapshot.holdings = snapshot.holdings.map((holding) => ({ ...holding, quoteUpdatedAt: quoteTime }));
    const daily = widgetDailyChange(sampleInput(snapshot, sampleFx, now));
    expect(daily).toMatchObject({ direction: 'up', asOf: quoteTime, amount: '+€8.40', period: 'quoteChange', currency: 'EUR' });
    expect(daily.text).toBe('+€8.40 quote change as of 21 Oct 2026');
    expect(daily.text).not.toContain('today');
  });

  it.each(['2026-07-01', '2026-10-15', '2026-10-22', '2026-02-30', '2026-10-021'])('withholds a converted estimate for noncurrent FX %s while flagging retained totals', (asOf) => {
    const payload = widgetPayload(sampleInput(sampleSnapshot(), { ...sampleFx, asOf }));
    expect(payload.netWorth).toMatchObject({ state: 'ready', value: { exact: '−€260.00' }, daily: { direction: 'unknown', text: 'Quote change unavailable' } });
    expect(payload.freshness).toMatchObject({ quotes: 'current', fxRequired: true, fxAsOf: asOf, stale: true });
    expect(payload.netWorth.daily?.amount).toBeUndefined();
  });

  it('allows the inclusive fifth UTC FX day for an otherwise current converted estimate', () => {
    expect(widgetDailyChange(sampleInput(sampleSnapshot(), { ...sampleFx, asOf: '2026-10-16' })).direction).toBe('up');
  });

  it.each([null, { ...sampleFx, asOf: '2026-07-01' }, { ...sampleFx, usdPerEur: Infinity }])('does not require irrelevant FX for a USD quote change', (fx) => {
    const snapshot = sampleSnapshot();
    snapshot.portfolio = { ...snapshot.portfolio, defaultCurrency: 'USD' };
    snapshot.assets = []; snapshot.liabilities = []; snapshot.transactions = []; snapshot.wealthSnapshots = [];
    const payload = widgetPayload(sampleInput(snapshot, fx));
    expect(payload.netWorth.daily).toMatchObject({ direction: 'up', currency: 'USD', period: 'quoteChange', amount: '+$10.50' });
    expect(payload.netWorth.daily?.fxAsOf).toBeUndefined();
    expect(payload.freshness).toMatchObject({ quotes: 'current', stale: false, fxRequired: false });
  });
});
