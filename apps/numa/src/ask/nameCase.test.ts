import { parse, type AskContext } from './parse';
const ctx: AskContext = { currency: 'EUR', now: new Date('2026-10-20T12:00:00Z'), categories: [], assets: [], liabilities: [], holdings: [] };
it.each(['QA first account', 'eBay cash', 'ACME savings'])('preserves explicit account capitalization: %s', (name) => {
  const result = parse(`${name} balance 100 EUR`, ctx);
  expect(result).toMatchObject({ type: 'draft', draft: { type: 'asset', name, amountCents: 10000, currency: 'EUR', existing: null } });
});
