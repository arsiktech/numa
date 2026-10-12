import type { CategorySummary, Summary } from '@/domain/summary';
import { compositionAt } from './composition';

const cat = (category: CategorySummary['category'], cents: number): CategorySummary => ({ category, cents, liquidCents: cents, cashCents: category === 'cash' ? cents : 0, share: 0 });
const current: Summary = {
  ownCents: 100_000, oweCents: 20_000, netCents: 80_000, liquidCents: 100_000, cashCents: 30_000,
  categories: [cat('cash', 30_000), cat('crypto', 50_000), cat('property', 20_000)], unknown: [], stale: [],
} as Summary;

describe('compositionAt', () => {
  it('is today when nothing is under the finger', () => {
    expect(compositionAt(null, current, 'cloud')).toMatchObject({ ownCents: 100_000, oweCents: 20_000, netCents: 80_000 });
  });

  it('shows the split a saved snapshot recorded, with its own debts', () => {
    const c = compositionAt({ t: 1, cents: 50_000, parts: { liquidCents: 20_000, investedCents: 30_000, hardCents: 10_000, oweCents: 10_000 } }, current, 'cloud');
    expect(c.ownCents).toBe(60_000);
    expect(c.oweCents).toBe(10_000);
    expect(c.netCents).toBe(50_000);
    expect(c.categories.map((x) => [x.category, x.cents])).toEqual([['cash', 20_000], ['stocks', 30_000], ['property', 10_000]]);
    expect(c.names?.stocks).toBe('Invested');
  });

  it('lets crypto and stocks absorb a move inside the day, with cash and debts unchanged', () => {
    const c = compositionAt({ t: 1, cents: 70_000 }, current, 'cloud');
    expect(c.ownCents).toBe(90_000);
    expect(c.oweCents).toBe(20_000);
    expect(c.categories.find((x) => x.category === 'cash')?.cents).toBe(30_000);
    expect(c.categories.find((x) => x.category === 'crypto')?.cents).toBe(40_000);
    expect(c.categories.reduce((s, x) => s + x.cents, 0)).toBe(90_000);
  });

  it('scales every block when the market alone cannot explain the difference', () => {
    const c = compositionAt({ t: 1, cents: 10_000 }, current, 'cloud');
    expect(c.ownCents).toBe(30_000);
    expect(c.categories.find((x) => x.category === 'cash')?.cents).toBe(9_000);
  });

  it('scales the demo together', () => {
    const c = compositionAt({ t: 1, cents: 180_000 }, current, 'demo');
    expect(c.ownCents).toBe(200_000);
    expect(c.categories.find((x) => x.category === 'property')?.cents).toBe(40_000);
  });

  it('shows nothing owned rather than negative blocks', () => {
    expect(compositionAt({ t: 1, cents: -30_000 }, current, 'cloud').categories).toEqual([]);
  });
});
