import { changeLabel, seriesFor, tickLabel, todayFromMarkets } from './series';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 12, 9);

describe('seriesFor', () => {
  it('starts at the last saved value before the range and ends live', () => {
    const history = [{ t: now - 10 * DAY, cents: 100 }, { t: now - 3 * DAY, cents: 200 }];
    const { points, hasHistory } = seriesFor(history, now, 250, '1W');
    expect(hasHistory).toBe(true);
    expect(points).toEqual([{ t: now - 7 * DAY, cents: 100 }, { t: now - 3 * DAY, cents: 200 }, { t: now, cents: 250 }]);
  });
  it('carries the earlier value to the start of the range', () => {
    const { points } = seriesFor([{ t: now - 40 * DAY, cents: 100 }], now, 250, '1M');
    expect(points).toEqual([{ t: now - 30 * DAY, cents: 100 }, { t: now, cents: 250 }]);
  });
  it('says when there is no history yet instead of inventing one', () => {
    const { points, hasHistory } = seriesFor([], now, 250, '1Y');
    expect(hasHistory).toBe(false);
    expect(points.map((p) => p.cents)).toEqual([250, 250]);
  });
});

describe('stale carry and today', () => {
  it('does not stretch a value saved long before the range', () => {
    const { hasHistory } = seriesFor([{ t: now - 5 * DAY, cents: 100 }], now, 250, '1D');
    expect(hasHistory).toBe(false);
  });
  it('draws today from market moves only when a price is current', () => {
    expect(todayFromMarkets(now, 1_000, 40)?.points.map((p) => p.cents)).toEqual([960, 1_000]);
    expect(todayFromMarkets(now, 1_000, null)).toBeNull();
  });
});

describe('scrub axis labels', () => {
  it('names time the way each range reads', () => {
    const t = new Date(2026, 9, 14, 14, 37).getTime();
    expect(tickLabel(t, '1D')).toBe('14:00');
    expect(tickLabel(t, '1W')).toBe('Wed');
    expect(tickLabel(t, '1M')).toBe('14 Oct');
    expect(tickLabel(t, '1Y')).toBe('Oct');
    expect(tickLabel(new Date(2026, 0, 3).getTime(), '1Y')).toBe('2026');
    expect(tickLabel(t, 'ALL')).toBe('Oct 26');
  });

  it('shows change from the start, rounded the way people read it', () => {
    expect(changeLabel(134, 100)).toBe('+34%');
    expect(changeLabel(84, 100)).toBe('−16%');
    expect(changeLabel(100.78, 100)).toBe('+0.8%');
    expect(changeLabel(100, 100)).toBe('0%');
    expect(changeLabel(-50, -100)).toBe('+50%');
    expect(changeLabel(5, 0)).toBeNull();
  });
});
