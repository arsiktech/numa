// Import from a file: an Excel workbook with several tabs opens on the tab Numa understands,
// and other tabs can be picked. The numbers are made up.
const path = require('path');
const { launch, watchErrors, signUp, checker, wait, APP, outDir } = require('./lib.cjs');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const OUT = outDir('import-file');
const EMAIL = `qa-importfile-${Date.now()}@example.com`;
const { check, finish } = checker();

function workbook() {
  const log = XLSX.utils.aoa_to_sheet([
    ['DATE', 'TOTAL BALANCE', 'FIAT', null, 'CRYPTO', null, 'HARD ASSETS'],
    [null, null, 'EUR', 'USD', 'BTC', 'STABLE$', 'CAR'],
    [new Date(Date.UTC(2026, 0, 5)), 10500, 2000, 0, 9500, -1000, 0],
    [new Date(Date.UTC(2026, 1, 20)), 25000, 0, 0, 11000, -6000, 20000],
  ], { cellDates: true });
  for (const ref of Object.keys(log)) {
    const cell = log[ref];
    if (ref.startsWith('!') || !cell) continue;
    if (cell.t === 'd') cell.z = 'mmm d yyyy'; else if (cell.t === 'n') cell.z = '"€"#,##0';
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Notes'], ['Budget ideas']]), 'Notes');
  XLSX.utils.book_append_sheet(book, log, 'Wealth Log');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  await page.goto(APP + '/import');
  await page.getByRole('heading', { name: 'Import' }).waitFor({ timeout: 10000 });

  const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
  await page.getByRole('button', { name: /Choose a file/ }).click();
  await (await chooser).setFiles({ name: 'money.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook() });
  await page.getByText('Net-worth history · 2 dates').waitFor({ timeout: 15000 });
  let b = await page.locator('body').innerText();
  check('an Excel file opens on the tab Numa understands', b.includes('money.xlsx · Wealth Log') && b.includes('own €31,000 · owe €6,000'), b.split('\n').filter((l) => /Reading|money|own/.test(l)).join(' | '));
  await page.screenshot({ path: OUT + '/01-file-dark-390.png', fullPage: true });

  await page.getByRole('tab', { name: 'Notes' }).click();
  await wait(300);
  check('another tab can be picked, and an unknown one says so', (await page.locator('body').innerText()).includes('Try another tab above.'));
  await page.getByRole('button', { name: 'Start over' }).click();
  await wait(300);
  check('start over returns to the three ways in', (await page.locator('body').innerText()).includes('Paste a Google Sheets link'));

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
