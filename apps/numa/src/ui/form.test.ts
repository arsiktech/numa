import { toCents } from './form';

describe('toCents', () => {
  it.each([
    ['12,50', 1250], ['0,5', 50], ['4,50', 450], ['12,500.5', 1250050], ['1,234', 123400],
    ['1 234,50', 123450], ['€12.50', 1250], ['$ 7', 700], ['12', 1200], ['99,999,999.99', 9999999999], ['123456789.12', 12345678912],
  ])('%s is %i cents', (text, cents) => expect(toCents(text)).toBe(cents));

  it.each(['0,125', '1.234', 'abc', '', '-5', '1.2.3'])('%p is not an amount', (text) => expect(toCents(text)).toBeNull());
});
