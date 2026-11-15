import { parseQuantity } from './csv';

describe('parseQuantity reads a comma like the rest of the app', () => {
  it.each([
    ['1,000', 1000], ['12,500', 12500], ['1,234,567', 1234567], ['1,234.5', 1234.5],
    ['0,5', 0.5], ['0,125', 0.125], ['1,5', 1.5], ['12,34', 12.34], ['0.12345678', 0.12345678], ['1 000', 1000],
  ])('%s is %d', (raw, value) => expect(parseQuantity(raw)).toBe(value));
  it.each(['', '0'])('"%s" is no quantity', (raw) => expect(parseQuantity(raw)).toBeNull());
});
