import { parseTable } from './csv';
import { isWealthLog, linesOf, readWealthLog, todayFromLatest } from './wealthLog';

// Made-up numbers in the shape of a real wealth log: group subtotals, repeated date columns
// written month first, a borrowed stablecoin and blank cells.
const LOG = [
  'DATE,TOTAL BALANCE,LIQUID BALANCE,SHARE,,,,,FIAT,,,CRYPTO,,,,STOCKS,,,HARD ASSETS (NOT LIQUID),,',
  ',,,,FIAT,CRYPTO,STOCKS,HARD ASSETS,,EUR,USD,,STABLE$,BTC,ETH,,TESLA,AAPL,,REAL ESTATE,CAR',
  'Jan 5 2026,"€10,500","€10,500",1/5/2026,"€2,000","€8,000",€500,€0,1/5/2026,"€2,000",€0,1/5/2026,"-€1,000","€6,000","€3,000",1/5/2026,€300,€200,1/5/2026,€0,€0',
  'Feb 20 2026,"€25,000","€5,000",2/20/2026,"-€4,000","€8,500",€500,"€20,000",2/20/2026,"-€4,000",,2/20/2026,"-€2,000","€7,000","€3,500",2/20/2026,€500,,2/20/2026,"€12,000","€8,000"',
  'Mar 30 2026,"€9,000","€9,000",3/30/2026,"€1,000","€7,500",€500,€0,3/30/2026,"€1,000",,3/30/2026,,"€6,000","€9,999",3/30/2026,€500,,3/30/2026,€0,€0',
].join('\n');

const table = parseTable(LOG);

describe('wealth log', () => {
  it('is recognised by its date, total and group headers', () => {
    expect(isWealthLog(table)).toBe(true);
    expect(isWealthLog(parseTable('Date,Description,Amount\n2026-10-03,Rent,-1200'))).toBe(false);
  });

  it('turns each dated row into owned and owed parts that add up exactly', () => {
    const log = readWealthLog(table, { currency: 'EUR', existingDays: [] });
    const [jan, feb] = log.rows;
    expect(jan).toMatchObject({ problem: null, liquidCents: 200_000, investedCents: 950_000, hardCents: 0, oweCents: 100_000, netCents: 1_050_000, currency: 'EUR' });
    expect(new Date(jan.takenAt!).toDateString()).toBe(new Date(2026, 0, 5).toDateString());
    expect(feb).toMatchObject({ problem: null, liquidCents: 0, investedCents: 1_100_000, hardCents: 2_000_000, oweCents: 600_000, netCents: 2_500_000 });
  });

  it('trusts the group subtotal when its positions disagree with it', () => {
    // March's crypto positions add to 15,999, but the sheet's crypto subtotal says 7,500.
    const mar = readWealthLog(table, { currency: 'EUR', existingDays: [] }).rows[2];
    expect(mar).toMatchObject({ problem: null, investedCents: 800_000, netCents: 900_000 });
  });

  it('skips dates already in Numa and flags rows that don’t add up', () => {
    const log = readWealthLog(table, { currency: 'EUR', existingDays: [new Date(2026, 0, 5, 9).getTime()] });
    expect(log.rows.map((r) => r.duplicate)).toEqual([true, false, false]);
    const broken = parseTable(LOG.replace('"€25,000","€5,000",2/20', '"€99,000","€5,000",2/20'));
    expect(readWealthLog(broken, { currency: 'EUR', existingDays: [] }).rows[1].problem).toMatch(/Adds up to 25000, the sheet says 99000/);
  });

  it('skips rows with no date quietly, but reports a date it can’t read', () => {
    const filler = ',€0,€0,,€0,€0,€0,€0,,€0,,,€0,€0,€0,,€0,€0,,€0,€0';
    const padded = parseTable(`${LOG}\n${filler}\n${filler}\nsometime,"€1,000",,,,,,,,"€1,000"`);
    const rows = readWealthLog(padded, { currency: 'EUR', existingDays: [] }).rows;
    expect(rows.length).toBe(4);
    expect(rows[3].problem).toBe('No readable date');
  });

  it('sets up today from the latest row: accounts, debts, and what needs a quantity', () => {
    const log = readWealthLog(table, { currency: 'EUR', existingDays: [] });
    expect(new Date(log.latest!.takenAt).getMonth()).toBe(2);
    const feb = readWealthLog(parseTable(LOG.split('\n').slice(0, 4).join('\n')), { currency: 'EUR', existingDays: [] });
    const today = todayFromLatest(feb.latest!, { currency: 'EUR', assets: [], liabilities: [] });
    expect(today.drafts.map((d) => [d.type, d.name, d.amountCents])).toEqual([
      ['debt', 'EUR owed', 400_000],
      ['debt', 'STABLE$ borrowed', 200_000],
      ['asset', 'Real estate', 1_200_000],
      ['asset', 'Car', 800_000],
    ]);
    expect(today.drafts.find((d) => d.name === 'Car')).toMatchObject({ assetKind: 'vehicle' });
    expect(today.needQuantity.map((p) => p.name)).toEqual(['BTC', 'ETH', 'TESLA']);
  });

  it('keeps every position of a row as lines that add up to its split', () => {
    const log = readWealthLog(parseTable(LOG), { currency: 'EUR', existingDays: [] });
    for (const row of log.rows.filter((r) => !r.problem)) {
      const lines = linesOf(row);
      const cents = (a: number) => Math.round(a * 100);
      const sum = (f: (l: (typeof lines)[number]) => boolean) => lines.filter(f).reduce((t, l) => t + cents(l.amount), 0);
      expect(sum((l) => l.group === 'liquid' && l.amount > 0)).toBe(row.liquidCents);
      expect(sum((l) => (l.group === 'crypto' || l.group === 'stocks') && l.amount > 0)).toBe(row.investedCents);
      expect(sum((l) => l.group === 'hard' && l.amount > 0)).toBe(row.hardCents);
      expect(lines.filter((l) => l.group === 'debt' || l.amount < 0).reduce((t, l) => t + Math.abs(cents(l.amount)), 0)).toBe(row.oweCents);
    }
    const feb = log.rows.find((r) => new Date(r.takenAt!).getMonth() === 1)!;
    expect(linesOf(feb).map((l) => l.name)).toEqual(expect.arrayContaining(['EUR', 'BTC', 'STABLE$', 'Real estate', 'Car']));
  });
});
