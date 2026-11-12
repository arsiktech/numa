import { barShares } from './lens';

describe('barShares', () => {
  it('draws the debt bar longer when you owe more than you own', () => {
    // €554,392 owned against €689,849 owed, as in a negative net worth.
    const s = barShares(55_439_200, 68_984_900, -13_545_700);
    expect(s.balance).toBe(1);
    expect(s.own).toBeCloseTo(0.8036, 3);
  });
  it('draws both bars full when net worth is positive, since owe plus net equals own', () => {
    expect(barShares(98_497_800, 8_544_000, 89_953_800)).toEqual({ own: 1, balance: 1 });
  });
  it('keeps both bars full when there is nothing to draw', () => {
    expect(barShares(0, 0, 0)).toEqual({ own: 1, balance: 1 });
  });
});
