import { widgetPayload } from './payload';

const now = Date.UTC(2026, 9, 12, 12);
const DAY = 86_400_000;
const base = { netCents: 4_203_500, todayCents: 12_000, points: [{ t: now - 40 * DAY, cents: 1 }, { t: now - 20 * DAY, cents: 4_000_000 }, { t: now - 10 * DAY, cents: 4_100_000 }], currency: 'EUR' as const, hidden: false, available: true, now };

describe('widgetPayload', () => {
  it('shows net worth, today’s move and the last 30 days, scaled', () => {
    expect(widgetPayload(base)).toEqual({ net: '€42,035', today: '+€120 today', up: true, line: [0, 0.491, 1], updatedAt: now });
    expect(widgetPayload({ ...base, todayCents: -8000 })).toMatchObject({ today: '−€80 today', up: false });
  });
  it('shows dots and no line when amounts are hidden', () => {
    expect(widgetPayload({ ...base, hidden: true })).toEqual({ net: '••••', today: '', up: true, line: [], updatedAt: now });
  });
  it('never shows a made-up total', () => {
    expect(widgetPayload({ ...base, available: false })).toMatchObject({ net: '—', today: 'Needs today’s exchange rate', line: [] });
    expect(widgetPayload({ ...base, todayCents: null, points: [] })).toMatchObject({ today: 'No market prices today', line: [] });
  });
});
