const { ROOT, APP, CONVEX, req, outDir, launch } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
const { execFileSync } = require('child_process');

const OUT = outDir('ask');
const EMAIL = `qa-slice3-${Date.now()}@example.com`;
const PASSWORD = 'Ledger-Harbor-47!';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const euro = (c) => '€' + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

async function ask(page, text) {
  const box = page.getByLabel('Ask or add anything');
  await box.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(500);
}
const lastDraft = (page) => page.getByLabel(/^Draft\./).last();

(async () => {
  const browser = await launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(APP + '/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Nothing tracked yet').first().waitFor({ timeout: 20000 });
  check('signed up to an empty home', true);

  await page.getByRole('button', { name: 'Ask or add' }).click();
  await page.getByText('Type what happened').waitFor({ timeout: 10000 });
  await page.screenshot({ path: OUT + '/01-ask-empty-dark-390.png' });

  await ask(page, 'cash balance 12,500');
  let card = lastDraft(page);
  const t1 = await card.innerText();
  check('balance updates the starter account', /Update Cash/.test(t1) && t1.includes('€12,500.00') && /Was €0\.00/.test(t1), t1.replace(/\n/g, ' | '));
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });

  await ask(page, 'coffee 4.50');
  card = lastDraft(page);
  const t2 = await card.innerText();
  check('coffee drafts as dining spending', /Spending · Dining/.test(t2) && t2.includes('−€4.50'), t2.replace(/\n/g, ' | '));
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });

  await ask(page, 'got paid 5,000 from Client A');
  card = lastDraft(page);
  check('income drafts with the payer', /Income · Freelance/.test(await card.innerText()) && (await card.innerText()).includes('Client A'));
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });

  await ask(page, 'owe 420 on card due in 3 days');
  card = lastDraft(page);
  check('debt drafts with a due date', /New debt/.test(await card.innerText()) && /Due /.test(await card.innerText()));
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });

  await ask(page, 'bought 10 VOO at $500');
  card = lastDraft(page);
  check('holding drafts with the price paid', /Buy 10 VOO/.test(await card.innerText()) && (await card.innerText()).includes('$5,000.00'));
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });

  await ask(page, 'I own 3 AAPL');
  card = lastDraft(page);
  check('holding without a price cannot be saved', await card.getByRole('button', { name: 'Save' }).isDisabled() && (await card.innerText()).includes('Add the price you paid per AAPL.'));
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Price paid each').fill('180');
  check('adding the price enables Save', !(await card.getByRole('button', { name: 'Save' }).isDisabled()));
  await page.screenshot({ path: OUT + '/02-ask-edit-dark-390.png' });
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Undo' }).click();
  await card.getByText('UNDONE', { exact: true }).waitFor({ timeout: 10000 });
  check('undo reverses a save', true);

  await ask(page, 'lunch 18');
  card = lastDraft(page);
  await card.getByRole('button', { name: 'Discard' }).click();
  check('discard saves nothing', (await card.innerText()).includes('DISCARDED'));

  await ask(page, 'blah');
  check('no amount gets a plain reply', (await page.locator('body').innerText()).includes('I couldn’t find an amount'));

  // Quotes for VOO so the holding is valued like on the server.
  execFileSync('npx', ['convex', 'run', 'marketQuotes:storeQuotes', JSON.stringify({ quotes: [{ symbol: 'VOO', price: 500, changePercent: 0, provider: 'finnhub', updatedAt: Date.now() - 60000 }] })], { cwd: ROOT, stdio: 'pipe' });
  const rate = JSON.parse(execFileSync('curl', ['-sS', '-m', '15', 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD']).toString()).rates.USD;
  const own = 1250000 + Math.round(500000 / rate);
  const owe = 42000;
  await page.waitForTimeout(1500);
  await ask(page, 'what’s my net worth?');
  const body = await page.locator('body').innerText();
  check('net worth answer matches records', body.includes(`Net worth is ${euro(own - owe)}`), body.split('\n').filter((l) => l.startsWith('Net worth')).join(' / '));
  await ask(page, 'what did I spend this month?');
  check('spending answer', (await page.locator('body').innerText()).includes('You’ve spent €4 in October'));
  await page.screenshot({ path: OUT + '/03-ask-conversation-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('What you own').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const home = await page.locator('body').innerText();
  check('home shows what Ask saved', home.includes(euro(own)) && home.includes(euro(owe)) && home.includes(euro(own - owe)), `${euro(own)} / ${euro(owe)}`);
  check('month reflects saved income and spending', /kept €4,995/.test(home), home.match(/kept [^\n]*/)?.[0] ?? 'none');
  await page.screenshot({ path: OUT + '/04-home-after-ask-dark-390.png', fullPage: true });

  // Server truth: what was saved, what was undone.
  const client = new ConvexHttpClient(CONVEX);
  const r = await client.action('auth:signIn', { provider: 'password', params: { email: EMAIL, password: PASSWORD, flow: 'signIn' } });
  client.setAuth(r.tokens.token);
  const boot = await client.mutation('mobile:bootstrap', {});
  const snap = await client.query('mobile:portfolioSnapshot', { portfolioId: boot.selectedPortfolioId });
  check('server has exactly the saved records', snap.transactions.length === 2 && snap.liabilities.length === 1 && snap.holdings.length === 1 && snap.holdings[0].symbol === 'VOO' && snap.holdings[0].costBasis === 5000 && snap.assets.find((a) => a.name === 'Cash')?.balance === 12500,
    JSON.stringify({ tx: snap.transactions.length, debts: snap.liabilities.length, holdings: snap.holdings.map((h) => h.symbol + ':' + h.costBasis), cash: snap.assets.map((a) => a.name + ':' + a.balance) }));

  // Light theme and wide layout of Ask.
  const wide = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const w = await wide.newPage();
  w.on('pageerror', (e) => errors.push(String(e)));
  await w.goto(APP + '/sign-in');
  await w.getByLabel('Email').fill(EMAIL);
  await w.getByLabel('Password').fill(PASSWORD);
  await w.getByRole('button', { name: 'Sign in' }).click();
  await w.getByText('What you own').waitFor({ timeout: 20000 });
  await w.getByRole('link', { name: 'Ask' }).click().catch(async () => { await w.getByText('Ask', { exact: true }).click(); });
  await w.getByText('Type what happened').waitFor({ timeout: 10000 });
  await ask(w, 'bought 0.1 btc at 60k');
  await w.screenshot({ path: OUT + '/05-ask-light-1440.png' });
  check('wide light Ask drafts a crypto buy', /Buy 0\.1 BTC/.test(await w.locator('body').innerText()));

  // Demo: nothing is saved.
  const d = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const dp = await d.newPage();
  await dp.goto(APP + '/sign-in');
  await dp.getByText('Explore with demo data').click();
  await dp.getByRole('button', { name: 'Ask or add' }).click();
  await ask(dp, 'coffee 4.50');
  await lastDraft(dp).getByRole('button', { name: 'Save' }).click();
  check('demo save says nothing was saved', (await dp.locator('body').innerText()).includes('Demo only, nothing saved'));
  await dp.screenshot({ path: OUT + '/06-ask-demo-dark-390.png' });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
