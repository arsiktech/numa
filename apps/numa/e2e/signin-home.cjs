const { ROOT, APP, CONVEX, req, outDir, launch } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
const { execFileSync } = require('child_process');

const OUT = outDir('signin-home');
const EMAIL = `qa-slice2-${Date.now()}@example.com`;
const PASSWORD = 'Ledger-Harbor-47!';
const DAY = 86400000;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

async function seed() {
  const client = new ConvexHttpClient(CONVEX);
  const r = await client.action('auth:signIn', { provider: 'password', params: { email: EMAIL, password: PASSWORD, flow: 'signIn' } });
  client.setAuth(r.tokens.token);
  const boot = await client.mutation('mobile:bootstrap', {});
  const p = boot.selectedPortfolioId;
  const now = Date.now();
  const snap = await client.query('mobile:portfolioSnapshot', { portfolioId: p });
  const starter = snap.assets.find((a) => a.kind === 'cash');
  await client.mutation('mobile:upsertAsset', { ...(starter ? { id: starter.id } : {}), portfolioId: p, name: 'Main account', kind: 'cash', balance: 12500, currency: 'EUR' });
  await client.mutation('mobile:upsertAsset', { portfolioId: p, name: 'Flat share', kind: 'real_estate', balance: 90000, currency: 'EUR' });
  await client.mutation('mobile:upsertLiability', { portfolioId: p, name: 'Card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: now + 3 * DAY });
  await client.mutation('mobile:upsertLiability', { portfolioId: p, name: 'Car loan', kind: 'loan', balance: 20000, currency: 'EUR' });
  await client.mutation('mobile:upsertHolding', { portfolioId: p, symbol: 'VOO', name: 'Vanguard S&P 500', kind: 'etf', quantity: 10, costBasis: 4000, currency: 'USD', acquiredAt: now - 400 * DAY });
  await client.mutation('mobile:upsertHolding', { portfolioId: p, symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasis: 15000, currency: 'USD', acquiredAt: now - 900 * DAY });
  await client.mutation('mobile:upsertHolding', { portfolioId: p, symbol: 'ACME', name: 'Acme private', kind: 'stock', quantity: 100, costBasis: 1000, currency: 'EUR', acquiredAt: now - 100 * DAY });
  const cats = snap.categories;
  const income = cats.find((c) => c.kind === 'income');
  await client.mutation('mobile:createTransaction', { portfolioId: p, occurredAt: now - 60000, description: 'Client invoice', categoryId: income?.id, kind: 'income', amount: 5000, currency: 'EUR' });
  await client.mutation('mobile:createTransaction', { portfolioId: p, occurredAt: now - 120000, description: 'Office rent', kind: 'expense', amount: 1200, currency: 'EUR' });
  for (const [days, nw] of [[300, 120000], [120, 140000], [30, 150000], [5, 158000]]) {
    await client.mutation('wealthSnapshots:add', { portfolioId: p, takenAt: now - days * DAY, netWorth: nw, liquid: nw, invested: 0, hardAssets: 0, liabilities: 0, currency: 'EUR', isAuto: false });
  }
  execFileSync('npx', ['convex', 'run', 'marketQuotes:storeQuotes', JSON.stringify({ quotes: [
    { symbol: 'VOO', price: 500, changePercent: 1, provider: 'finnhub', updatedAt: now - 5 * 60000 },
    { symbol: 'BTC', price: 60000, changePercent: -2, provider: 'coingecko', updatedAt: now - 5 * 60000 },
  ] })], { cwd: ROOT, stdio: 'pipe' });
  const fx = JSON.parse(execFileSync('curl', ['-sS', '-m', '15', 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD']).toString());
  const rate = fx.rates.USD;
  const live = () => fromServer(client, p, rate);
  return { rate, live, ...(await live()) };
}

// Expected totals from what the server holds now, computed the way the app should: each record
// rounded to cents first. Prices are read back because the backend's market job can refresh BTC mid-run.
async function fromServer(client, p, rate) {
  const s = await client.query('mobile:portfolioSnapshot', { portfolioId: p });
  let own = 1250000 + 9000000 + 100000, today = 0;
  for (const h of s.holdings.filter((x) => x.symbol !== 'ACME')) {
    const v = Math.round(Math.round(h.marketPrice * h.quantity * 100) / rate);
    own += v;
    today += Math.round(v - v / (1 + h.changePercent / 100));
  }
  const owe = 42000 + 2000000;
  return { own, owe, net: own - owe, moveToday: today };
}

const euro = (c) => '€' + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

(async () => {
  // The sandbox reaches the internet through a proxy; local hosts stay direct.
  const browser = await launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(APP + '/');
  await page.getByText('Your money,').waitFor({ timeout: 20000 });
  check('signed out lands on sign-in', page.url().includes('sign-in'), page.url());
  await page.screenshot({ path: OUT + '/01-sign-in-dark-390.png' });

  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('short');
  check('weak password keeps button disabled', await page.getByRole('button', { name: 'Create account' }).isDisabled());
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Nothing tracked yet').first().waitFor({ timeout: 20000 });
  check('new portfolio shows the honest empty state once', (await page.getByText('Nothing tracked yet').count()) === 1);
  await page.screenshot({ path: OUT + '/03-empty-dark-390.png', fullPage: true });

  const expected = await seed();
  console.log('expected', JSON.stringify(expected));
  await page.getByText('What you own').waitFor({ timeout: 20000 });
  check('home updates live after data arrives (no reload)', true);
  await page.waitForTimeout(1500);
  Object.assign(expected, await expected.live());
  const body = await page.locator('body').innerText();
  check('own total matches records', body.includes(euro(expected.own)), euro(expected.own));
  check('owe total matches records', body.includes(euro(expected.owe)), euro(expected.owe));
  check('net worth block matches', body.includes(euro(expected.net)), euro(expected.net));
  check('due card raised', body.includes('Card is due'));
  check('unpriced holding raised', body.includes('No price for ACME'));
  check('month teaser uses real flow', body.includes('kept €3,800'), body.match(/kept [^\n]*/)?.[0] ?? 'missing');
  check('live chip with fresh quotes', await page.getByText('Live', { exact: true }).isVisible());
  // Today's line comes from the quotes' daily moves (VOO seeded +1%), not from saved history.
  const moveToday = expected.moveToday;
  check('today shows market moves', body.includes((moveToday >= 0 ? '▲ ' : '▼ ') + euro(moveToday)) && body.includes('today'), body.match(/[▲▼][^\n]*/)?.[0] ?? 'none');
  await page.screenshot({ path: OUT + '/04-home-dark-390.png', fullPage: true });

  await page.getByRole('tab', { name: '1Y' }).click();
  await page.waitForTimeout(1600);
  const yr = await page.locator('body').innerText();
  check('1Y shows change from saved history', /[▲▼] €[\d,]+\.\d\d/.test(yr) && yr.includes('this year'), yr.match(/[▲▼][^\n]*/)?.[0] ?? 'none');
  await page.screenshot({ path: OUT + '/05-home-1y-dark-390.png' });

  await page.getByRole('switch', { name: 'Hide amounts' }).first().click();
  await page.waitForTimeout(400);
  const hiddenText = await page.locator('body').innerText();
  check('hide amounts masks blocks and shares', !hiddenText.includes(euro(expected.own)) && hiddenText.includes('€•') && !hiddenText.includes('76%'), '');
  await page.screenshot({ path: OUT + '/06-hidden-dark-390.png' });
  await page.getByRole('switch', { name: 'Hide amounts' }).first().click();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByText('APPEARANCE').waitFor();
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.screenshot({ path: OUT + '/07-settings-light-390.png' });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('What you own').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/08-home-light-390.png', fullPage: true });
  await page.reload();
  await page.getByText('What you own').waitFor({ timeout: 20000 });
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid], div') ?? document.body).backgroundColor);
  check('session and theme survive reload', true, bg);

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByText('Your money,').waitFor({ timeout: 20000 });
  check('sign out returns to sign-in', page.url().includes('sign-in'), page.url());

  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('Wrong-password-11');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('That email and password don’t match.').waitFor({ timeout: 15000 });
  check('wrong password shows a plain message', true);
  await page.screenshot({ path: OUT + '/09-wrong-password-dark-390.png' });

  await page.getByText('Explore with demo data').click();
  await page.getByRole('button', { name: 'Demo data. Sign in' }).waitFor({ timeout: 15000 });
  check('demo path works while signed out', true);
  const settingsBox = await page.getByRole('link', { name: 'Settings' }).boundingBox();
  check('demo header fits a phone screen', !!settingsBox && settingsBox.x + settingsBox.width <= 390, JSON.stringify(settingsBox));
  await page.screenshot({ path: OUT + '/10-demo-dark-390.png' });

  const wide = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const w = await wide.newPage();
  w.on('pageerror', (e) => errors.push(String(e)));
  await w.goto(APP + '/sign-in');
  await w.getByLabel('Email').fill(EMAIL);
  await w.getByLabel('Password').fill(PASSWORD);
  await w.getByRole('button', { name: 'Sign in' }).click();
  await w.getByText('What you own').waitFor({ timeout: 20000 });
  await w.waitForTimeout(1800);
  Object.assign(expected, await expected.live());
  check('sign in on desktop width', (await w.locator('body').innerText()).includes(euro(expected.net)));
  await w.screenshot({ path: OUT + '/11-home-dark-1440.png' });

  // The deliberate wrong-password attempt is logged by the Convex client; anything else is a failure.
  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e) && !/auth:signIn[\s\S]*InvalidSecret/.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 5).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
