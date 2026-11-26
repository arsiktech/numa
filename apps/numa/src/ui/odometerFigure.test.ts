import { figureColumns, glyphMetrics } from './odometerFigure';

const keys = (text: string) => figureColumns(text).map((column) => column.kind === 'digit' ? `${column.key}=${column.digit}` : `${column.key}=${column.char}`);

test('the glyph box is taller than a 1em line, which is what clipped the settled figure', () => {
  const display = glyphMetrics(80, 80);
  const hero = glyphMetrics(54, 54);
  const cents = glyphMetrics(32, 32);
  expect(display).toEqual({ textBox: 112, trim: 16 });
  expect(hero.textBox).toBeGreaterThan(54);
  expect(cents.textBox).toBeGreaterThan(32);
  for (const box of [display, hero, cents]) {
    expect(box.textBox).toBeGreaterThanOrEqual(box.trim * 2);
    expect(box.trim).toBeGreaterThan(0);
  }
});

test('net worth, liquid and cash keep the currency, the comma and the units place', () => {
  const net = keys('€899,538');
  const liquid = keys('€385,150');
  const cash = keys('€77,590');
  expect(net).toEqual(['pre:0:€=€', 'd:6=8', 'd:5=9', 'd:4=9', 'm:3:,=,', 'd:2=5', 'd:1=3', 'd:0=8']);
  expect(liquid).toEqual(['pre:0:€=€', 'd:6=3', 'd:5=8', 'd:4=5', 'm:3:,=,', 'd:2=1', 'd:1=5', 'd:0=0']);
  expect(cash).toEqual(['pre:0:€=€', 'd:5=7', 'd:4=7', 'm:3:,=,', 'd:2=5', 'd:1=9', 'd:0=0']);
  // Same separator and units keys, so those glyphs are not remounted as a different character.
  for (const stable of ['pre:0:€=€', 'm:3:,=', 'd:0']) {
    expect(net.some((key) => key.startsWith(stable))).toBe(true);
    expect(liquid.some((key) => key.startsWith(stable))).toBe(true);
    expect(cash.some((key) => key.startsWith(stable))).toBe(true);
  }
  expect(cash.some((key) => key.startsWith('d:6'))).toBe(false);
});

test('a sign stays in the prefix and cents keep their decimal point', () => {
  expect(keys('−€1,234')).toEqual(['pre:0:−=−', 'pre:1:€=€', 'd:4=1', 'm:3:,=,', 'd:2=2', 'd:1=3', 'd:0=4']);
  expect(keys('.42')).toEqual(['pre:0:.=.', 'd:1=4', 'd:0=2']);
  expect(keys('€•••,•••').every((key) => key.startsWith('pre:'))).toBe(true);
});
