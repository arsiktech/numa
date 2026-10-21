import { attributeMovers, collapseMovers, roundedCents, type MovementEvidence } from './movers';

const estimate = (id: string, changeCents: number | null, extra: Partial<MovementEvidence> = {}): MovementEvidence => ({ id, name: `Synthetic ${id}`, group: 'Stocks', status: 'estimate', changeCents, ...extra });
const displayedTotal = (m: ReturnType<typeof attributeMovers>) => [...m.gainers, ...m.losers].reduce((sum, r) => sum + r.cents, 0) + (m.unexplainedCents ?? 0);

describe('movement reconciliation', () => {
  it('rounds each row to cents, sorts contributions and reconciles the headline exactly', () => {
    const result = attributeMovers(200, [estimate('small', 10.2), estimate('large', 250.6), estimate('loss', -80.6)]);
    expect(result.gainers.map((r) => [r.id, r.cents])).toEqual([['large', 251], ['small', 10]]);
    expect(result.losers[0].cents).toBe(-81);
    expect(result.estimatedCents).toBe(180);
    expect(result.unexplainedCents).toBe(20);
    expect(displayedTotal(result)).toBe(200);
  });
  it('gives a growing debt the loss sign and a shrinking debt the gain sign', () => {
    const result = attributeMovers(-400, [estimate('loan-growth', 600, { debt: true, percent: 0.06 }), estimate('loan-shrink', -200, { debt: true })]);
    expect(result.losers[0]).toMatchObject({ cents: -600, debt: true, percent: 0.06 });
    expect(result.gainers[0]).toMatchObject({ cents: 200, debt: true });
    expect(result.unexplainedCents).toBe(0);
  });
  it('keeps stale, missing and invalid prices outside gainers and losers', () => {
    const result = attributeMovers(30, [estimate('stale', 90, { status: 'stale' }), estimate('missing', null, { status: 'missing' }), estimate('invalid', NaN), estimate('infinite', Infinity)]);
    expect(result.gainers).toEqual([]); expect(result.losers).toEqual([]);
    expect(result.coverage).toHaveLength(4);
    expect(result.coverage.every((r) => !r.flat)).toBe(true);
    expect(result.coverage[0].reason).toContain('stale');
    expect(result.unexplainedCents).toBe(30);
    expect(result.nothingMoved).toBe(false);
  });
  it('keeps a negative unexplained remainder and omits only an exact zero', () => {
    expect(attributeMovers(100, [estimate('a', 150)]).unexplainedCents).toBe(-50);
    expect(attributeMovers(150, [estimate('a', 150)]).unexplainedCents).toBe(0);
  });
  it('collapses N more as the sum of their displayed rows, preserving the whole result', () => {
    const result = attributeMovers(500, Array.from({ length: 9 }, (_, i) => estimate(`row-${i}`, 80 - i * 3.1)));
    const collapsed = collapseMovers(result.gainers, 3);
    expect(collapsed.shown).toHaveLength(3);
    expect(collapsed.moreCount).toBe(6);
    expect(collapsed.moreCents).toBe(collapsed.more.reduce((sum, r) => sum + r.cents, 0));
    expect(collapsed.shown.reduce((sum, r) => sum + r.cents, 0) + collapsed.moreCents + result.unexplainedCents!).toBe(500);
    expect(collapseMovers(result.gainers, 0).moreCount).toBe(9);
  });
  it('distinguishes a calm empty day from an unknown day with a zero headline', () => {
    expect(attributeMovers(0, []).nothingMoved).toBe(true);
    expect(attributeMovers(0, [estimate('flat', 0)]).nothingMoved).toBe(true);
    expect(attributeMovers(0, [estimate('unknown', null, { status: 'missing' })]).nothingMoved).toBe(false);
    expect(attributeMovers(0, [estimate('up', 10), estimate('down', -10)]).nothingMoved).toBe(false);
  });
  it('never turns missing totals, nonfinite values or unsafe cents into zero', () => {
    expect(roundedCents(null)).toBeNull(); expect(roundedCents(NaN)).toBeNull();
    expect(roundedCents(Infinity)).toBeNull(); expect(roundedCents(Number.MAX_VALUE)).toBeNull();
    expect(attributeMovers(null, []).available).toBe(false);
    expect(attributeMovers(NaN, [estimate('a', 1)]).headlineCents).toBeNull();
    expect(attributeMovers(Number.MAX_SAFE_INTEGER, [estimate('a', -Number.MAX_SAFE_INTEGER)]).available).toBe(false);
  });
  it('does not duplicate the same evidence or leak nonfinite percentages', () => {
    const result = attributeMovers(25, [estimate('same-position', 25, { percent: NaN }), estimate('same-position', 25)]);
    expect(result.gainers).toHaveLength(1);
    expect(result.gainers[0].percent).toBeNull();
    expect(result.unexplainedCents).toBe(0);
  });
});
