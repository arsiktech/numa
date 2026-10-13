// Wealth log import: a dated sheet becomes net-worth history, and its latest row sets up today.
// The numbers are made up; they only copy the shape of a real wealth log.
const { launch, watchErrors, signUp, client, checker, wait, APP, outDir } = require('./lib.cjs');
const OUT = outDir('wealth-log');
const EMAIL = `qa-wealthlog-${Date.now()}@example.com`;
const { check, finish } = checker();

const LOG = [
  'DATE,TOTAL BALANCE,LIQUID BALANCE,SHARE,,,,,FIAT,,,CRYPTO,,,,STOCKS,,,HARD ASSETS (NOT LIQUID),,',
  ',,,,FIAT,CRYPTO,STOCKS,HARD ASSETS,,EUR,USD,,STABLE$,BTC,ETH,,TESLA,AAPL,,REAL ESTATE,CAR',
  'Jan 5 2026,"€10,500","€10,500",1/5/2026,"€2,000","€8,000",€500,€0,1/5/2026,"€2,000",€0,1/5/2026,"-€1,000","€6,000","€3,000",1/5/2026,€300,€200,1/5/2026,€0,€0',
  'Feb 20 2026,"€25,000","€5,000",2/20/2026,"-€4,000","€8,500",€500,"€20,000",2/20/2026,"-€4,000",,2/20/2026,"-€2,000","€7,000","€3,500",2/20/2026,€500,,2/20/2026,"€12,000","€8,000"',
].join('\n');

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { snap } = await client(EMAIL);

  await page.goto(APP + '/import');
  await page.getByRole('heading', { name: 'Import' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Paste cells/ }).click();
  await page.getByLabel('Pasted table').fill(LOG);
  await wait(400);
  const b = await page.locator('body').innerText();
  check('a wealth log is recognised as history', b.includes('Net-worth history · 2 dates') && b.includes('€10,500') && b.includes('€25,000') && b.includes('own €31,000 · owe €6,000'), b.split('\n').filter((l) => /history|own|€/.test(l)).slice(0, 6).join(' | '));
  check('today is set up from the latest row, and crypto and stocks wait for quantities',
    b.includes('Today, from 20 Feb') && b.includes('EUR owed') && b.includes('STABLE$ borrowed') && b.includes('Real estate') && b.includes('Car') && /Not set up yet[\s\S]*BTC €7,000, ETH €3,500, TESLA €500/.test(b));
  await page.screenshot({ path: OUT + '/01-preview-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: 'Import 2 dates' }).click();
  await page.getByText('Imported 2').first().waitFor({ timeout: 20000 });
  await wait(800);
  let s = await snap();
  const feb = s.wealthSnapshots.find((w) => new Date(w.takenAt).getMonth() === 1);
  check('history is saved with owned and owed parts that add up', s.wealthSnapshots.length === 2 && feb?.netWorth === 25000 && feb.liquid === 0 && feb.invested === 11000 && feb.hardAssets === 20000 && feb.liabilities === 6000,
    JSON.stringify(s.wealthSnapshots.map((w) => [w.netWorth, w.liquid, w.invested, w.hardAssets, w.liabilities])));

  await page.getByLabel('Pasted table').fill(LOG);
  await wait(400);
  check('pasting the same log again skips the dates already saved', (await page.locator('body').innerText()).includes('2 already in Numa, skipped'));
  await page.getByRole('button', { name: 'Set up 4 entries' }).click();
  await page.getByText('Imported 4').first().waitFor({ timeout: 20000 });
  await wait(800);
  s = await snap();
  check('today’s accounts and debts are created from the latest row',
    s.liabilities.some((l) => l.name === 'EUR owed' && l.balance === 4000) && s.liabilities.some((l) => l.name === 'STABLE$ borrowed' && l.kind === 'loan' && l.balance === 2000)
    && s.assets.some((a) => a.name === 'Real estate' && a.kind === 'real_estate' && a.balance === 12000) && s.assets.some((a) => a.name === 'Car' && a.kind === 'vehicle'),
    JSON.stringify({ a: s.assets.map((a) => a.name), l: s.liabilities.map((l) => l.name) }));

  await page.goto(APP + '/');
  await page.getByRole('tab', { name: 'ALL' }).click().catch(() => {});
  await wait(1200);
  const home = await page.locator('body').innerText();
  check('Home shows the imported history', !home.includes('History starts today'), home.split('\n').filter((l) => /History|since|ALL/.test(l)).join(' | '));
  await page.screenshot({ path: OUT + '/02-home-history-dark-390.png', fullPage: true });

  const unexpected = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
