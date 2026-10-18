const { ROOT, APP, CONVEX, req, outDir, launch } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
const { execFileSync } = require('child_process');

const OUT = outDir('holdings');
const EMAIL = `qa-slice4-${Date.now()}@example.com`;
const PASSWORD = 'Ledger-Harbor-47!';
const DAY = 86400000;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Seed through the same typed functions the app uses.
  const client = new ConvexHttpClient(CONVEX);
  const r = await client.action('auth:signIn', { provider: 'password', params: { email: EMAIL, password: PASSWORD, flow: 'signIn' } });
  client.setAuth(r.tokens.token);
  const p = (await client.mutation('mobile:bootstrap', {})).selectedPortfolioId;
  const snap0 = await client.query('mobile:portfolioSnapshot', { portfolioId: p });
  const cash = snap0.assets.find((a) => a.kind === 'cash');
  await client.mutation('mobile:upsertAsset', { id: cash.id, portfolioId: p, name: 'Cash', kind: 'cash', balance: 12500, currency: 'EUR' });
  await client.mutation('mobile:upsertAsset', { portfolioId: p, name: 'Watch', kind: 'collectible', balance: 8000, currency: 'EUR' });
  await client.mutation('mobile:upsertHolding', { portfolioId: p, symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasis: 15000, currency: 'USD', acquiredAt: Date.now() - 900 * DAY });
  await client.mutation('mobile:upsertLiability', { portfolioId: p, name: 'Card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: Date.now() + 3 * DAY });
  await client.mutation('mobile:upsertLiability', { portfolioId: p, name: 'Car loan', kind: 'loan', balance: 20000, currency: 'EUR' });
  execFileSync('npx', ['convex', 'run', 'marketQuotes:storeQuotes', JSON.stringify({ quotes: [{ symbol: 'BTC', price: 60000, changePercent: 1, provider: 'coingecko', updatedAt: Date.now() - 4 * 60000 }] })], { cwd: ROOT, stdio: 'pipe' });
  const rate = JSON.parse(execFileSync('curl', ['-sS', '-m', '15', 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD']).toString()).rates.USD;
  const snapNow = async () => client.query('mobile:portfolioSnapshot', { portfolioId: p });

  await page.getByText('What you own').waitFor({ timeout: 20000 });
  await wait(1200);
  await page.getByRole('link', { name: /^Crypto, .* Open$/ }).click();
  await page.getByRole('heading', { name: 'Crypto' }).waitFor({ timeout: 10000 });
  const g = await page.locator('body').innerText();
  const btc = Math.round(3000000 / rate);
  check('crypto block opens its holdings', g.includes('Bitcoin') && /0\.5 BTC · CoinGecko · \d+ min ago/.test(g), g.split('\n').slice(0, 8).join(' | '));
  await page.screenshot({ path: OUT + '/01-crypto-dark-390.png' });

  // The record, under the asset map and the by-asset rows.
  await page.getByRole('link', { name: /^Bitcoin,/ }).last().click();
  await page.getByText('You paid').waitFor({ timeout: 10000 });
  const d = await page.locator('body').innerText();
  // The local backend refreshes real prices every 15 minutes, so read the price it holds.
  const price = (await snapNow()).holdings[0].marketPrice;
  const usd = '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  check('detail shows units, price, cost and gain', d.includes('0.5 BTC') && d.includes(usd) && d.includes('$15,000.00') && /Gain\s*\n?\s*\+€/.test(d), d.split('\n').slice(0, 16).join(' | '));
  await page.screenshot({ path: OUT + '/02-bitcoin-dark-390.png' });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Units').fill('0.6');
  await page.getByLabel('You paid in total').fill('21000');
  await page.getByLabel(/^Where it is/).fill('Trade Republic');
  await page.screenshot({ path: OUT + '/03-bitcoin-edit-dark-390.png' });
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Bitcoin saved').waitFor({ timeout: 10000 });
  await wait(800);
  let s = await snapNow();
  check('edit saves to the server, with where it is kept', s.holdings[0].quantity === 0.6 && s.holdings[0].costBasis === 21000 && s.holdings[0].location === 'Trade Republic', `${s.holdings[0].quantity} / ${s.holdings[0].costBasis} / ${s.holdings[0].location}`);
  const saved = await page.locator('body').innerText();
  check('screen shows the new value and the place', saved.includes('0.6 BTC') && /Where it is\s*\n?\s*Trade Republic/.test(saved));
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  s = await snapNow();
  check('undo restores the old values on the same record', s.holdings.length === 1 && s.holdings[0].quantity === 0.5 && s.holdings[0].costBasis === 15000 && !s.holdings[0].location);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('What you own').waitFor({ timeout: 10000 });
  await page.getByRole('link', { name: 'What you owe ›' }).click();
  await page.getByRole('heading', { name: 'What you owe' }).waitFor({ timeout: 10000 });
  const o = await page.locator('body').innerText();
  check('debts list shows both with due state', o.includes('Car loan') && o.includes('Card') && /Credit card · Due \d+ \w+/.test(o) && o.includes('€20,420.00'));
  await page.screenshot({ path: OUT + '/04-debts-dark-390.png' });

  await page.getByRole('link', { name: /^Card,/ }).last().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel(/Due date/).fill('20 Dec');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Card saved').waitFor({ timeout: 10000 });
  await wait(800);
  s = await snapNow();
  const due = new Date(s.liabilities.find((l) => l.name === 'Card').dueDate);
  check('due date edit saves', due.getMonth() === 11 && due.getDate() === 20, due.toDateString());

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('link', { name: /^Car loan,/ }).last().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Delete this debt?').waitFor();
  await page.screenshot({ path: OUT + '/05-delete-confirm-dark-390.png' });
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Car loan deleted').waitFor({ timeout: 10000 });
  await wait(600);
  check('delete removes it', !(await snapNow()).liabilities.some((l) => l.name === 'Car loan'));
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  s = await snapNow();
  check('undo brings a deleted debt back', s.liabilities.some((l) => l.name === 'Car loan' && l.balance === 20000));

  await page.goto(APP + '/holdings/things');
  await page.getByRole('link', { name: /^Watch,/ }).last().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Watch deleted').waitFor({ timeout: 10000 });
  await wait(7000);
  check('a delete without undo stays deleted', !(await snapNow()).assets.some((a) => a.name === 'Watch'));

  await client.mutation('mobile:upsertHolding', { ...(({ id, symbol, name, kind, quantity, costBasis, currency, acquiredAt }) => ({ id, symbol, name, kind, quantity, costBasis, currency, acquiredAt }))(s.holdings[0]), portfolioId: p, location: 'Ledger' });
  await page.goto(APP + '/position/crypto/BTC');
  await page.getByText('WHERE IT IS').waitFor({ timeout: 15000 });
  check('a record kept somewhere shows that place under Where it is', (await page.locator('body').innerText()).includes('Ledger'));

  // A debt owed in BTC is worth BTC at today's price (the test backend prices BTC at $60,000).
  await client.mutation('mobile:upsertLiability', { portfolioId: p, name: 'Razmik', kind: 'other', balance: 1, currency: 'EUR', owedSymbol: 'BTC', owedQuantity: 0.15 });
  const owed = (await snapNow()).liabilities.find((l) => l.name === 'Razmik');
  check('a debt owed in BTC is valued at the BTC price, in dollars', owed && owed.owedSymbol === 'BTC' && owed.balance === 9000 && owed.currency === 'USD', JSON.stringify(owed));
  await page.goto(APP + '/holdings/debts');
  await page.getByText('Razmik').first().waitFor({ timeout: 15000 });
  check('the debts list says what the debt is owed in', (await page.locator('body').innerText()).includes('0.15 BTC'));

  const wide = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const w = await wide.newPage();
  w.on('pageerror', (e) => errors.push(String(e)));
  await w.goto(APP + '/sign-in');
  await w.getByLabel('Email').fill(EMAIL);
  await w.getByLabel('Password').fill(PASSWORD);
  await w.getByRole('button', { name: 'Sign in' }).click();
  await w.getByText('What you own').waitFor({ timeout: 20000 });
  await w.getByRole('link', { name: 'Holdings' }).click();
  await w.getByRole('heading', { name: 'Holdings' }).waitFor({ timeout: 10000 });
  await wait(800);
  const all = await w.locator('body').innerText();
  check('sidebar Holdings lists every group', ['Crypto', 'Cash', 'What you owe', 'Bitcoin', 'Car loan'].every((x) => all.includes(x)));
  await w.screenshot({ path: OUT + '/06-holdings-light-1440.png', fullPage: true });

  const dm = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const dp = await dm.newPage();
  await dp.goto(APP + '/sign-in');
  await dp.getByText('Explore with demo data').click();
  await dp.getByText('What you own').waitFor({ timeout: 10000 });
  await dp.getByRole('link', { name: /^Crypto, .* Open$/ }).click();
  await dp.getByRole('heading', { name: 'Crypto' }).waitFor({ timeout: 10000 });
  // Bitcoin as one asset across places, then one record under it.
  await dp.getByRole('link', { name: /^Bitcoin, .*3 places\. Open$/ }).click();
  await dp.getByText('WHERE IT IS').waitFor({ timeout: 10000 });
  const where = await dp.locator('body').innerText();
  check('demo Bitcoin shows where it sits: a wallet address, a pledged loan and an exchange', /Ledger[\s\S]*bc1qxy…0wlh · Bitcoin/.test(where) && /Nexo[\s\S]*Pledged/i.test(where) && where.includes('Coinbase') && where.includes('1.42 BTC'));
  await dp.screenshot({ path: OUT + '/07-demo-bitcoin-where-dark-390.png' });
  await dp.getByRole('link', { name: /^Ledger,/ }).click();
  await dp.getByText('This is demo data').waitFor({ timeout: 10000 });
  check('demo items are read-only', (await dp.getByRole('button', { name: 'Edit' }).count()) === 0);
  await dp.screenshot({ path: OUT + '/08-demo-item-dark-390.png' });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
