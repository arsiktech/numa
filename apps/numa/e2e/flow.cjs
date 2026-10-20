const { launch, watchErrors, signUp, signIn, client, checker, euro, wait, DAY, APP, outDir } = require('./lib.cjs');
const OUT = outDir('flow');
const EMAIL = `qa-flow-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);

  const { c, portfolioId: p, snap } = await client(EMAIL);
  const cats = (await snap()).categories;
  const cat = (n) => cats.find((x) => x.name === n).id;
  const now = Date.now();
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 10, 12).getTime();
  const add = (description, kind, amount, occurredAt, categoryId) => c.mutation('mobile:createTransaction', { portfolioId: p, description, kind, amount, currency: 'EUR', occurredAt, ...(categoryId ? { categoryId } : {}) });
  await add('Client A', 'income', 5000, now - 3600e3, cat('Freelance'));
  await add('October rent', 'expense', 1200, now - 2 * 3600e3, cat('Rent'));
  await add('Coffee', 'expense', 4.5, now - 3 * 3600e3, cat('Dining'));
  await add('Lunch', 'expense', 18, now - 4 * 3600e3, cat('Dining'));
  await add('Salary', 'income', 3000, lastMonth, cat('Salary'));
  await add('Laptop', 'expense', 3500, lastMonth + 3600e3);
  const rule = (description, amount, cadence, revenueType, incomeSource) => c.mutation('recurring:add', { portfolioId: p, description, kind: 'income', amount, currency: 'EUR', cadence, startAt: now - 30 * DAY, nextRunAt: now + 5 * DAY, active: true, createdAt: now, ...(revenueType ? { revenueType } : {}), ...(incomeSource ? { incomeSource } : {}) });
  await rule('App subscriptions', 1200, 'yearly', 'subscription', 'App');
  await rule('Retainer', 2000, 'monthly', 'retainer', 'Studio retainer');

  await page.getByRole('tab', { name: 'Flow' }).click();
  await page.getByText('You kept').waitFor({ timeout: 20000 });
  await wait(1000);
  let b = await page.locator('body').innerText();
  check('headline states what was kept this month', b.includes('You kept €3,777'), b.split('\n').slice(0, 5).join(' | '));
  check('split shows sources and spending streams', ['Freelance', 'Rent', 'Dining', 'Kept'].every((x) => b.includes(x)));
  check('transactions are listed with cents', b.includes('October rent') && b.includes('Coffee') && b.includes('€4.50'));
  check('MRR counts only marked revenue', b.includes('PRODUCTS AND MRR') && b.includes('€2,100') && b.includes('€25,200 a year'), b.match(/€[\d,]+\nMRR[^\n]*/)?.[0] ?? '');
  await page.screenshot({ path: OUT + '/01-flow-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: /^Dining, .* Follow this stream$/ }).last().click();
  await wait(500);
  b = await page.locator('body').innerText();
  check('following a stream lists only its transactions', b.includes('FOLLOWING') && b.includes('Coffee') && b.includes('Lunch') && !b.includes('October rent'));
  await page.screenshot({ path: OUT + '/02-follow-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.getByRole('button', { name: 'Previous month' }).click();
  await wait(600);
  b = await page.locator('body').innerText();
  check('overspent month shows money from savings', b.includes('€500 more out than in') && b.includes('From savings'), b.split('\n').slice(0, 5).join(' | '));
  await page.screenshot({ path: OUT + '/03-overspent-dark-390.png' });
  await page.getByRole('button', { name: 'Next month' }).click();
  await wait(500);

  await page.getByRole('link', { name: /Coffee/ }).first().click();
  await page.getByRole('button', { name: 'Edit' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('5.20');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Coffee saved').waitFor({ timeout: 10000 });
  await wait(800);
  let s = await snap();
  check('transaction edit saves', s.transactions.find((t) => t.description === 'Coffee').amount === 5.2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  s = await snap();
  check('undo restores the transaction', s.transactions.find((t) => t.description === 'Coffee').amount === 4.5);

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Coffee deleted').waitFor({ timeout: 10000 });
  await wait(600);
  check('delete removes it', !(await snap()).transactions.some((t) => t.description === 'Coffee'));
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  const back = (await snap()).transactions.find((t) => t.description === 'Coffee');
  check('undo re-creates it in its category', !!back && back.categoryId === cat('Dining') && back.amount === 4.5);

  // A card purchase with its statement details: what the card charged and at what rate, the cashback,
  // the merchant; Flow adds the card and cashback to its row and adds up the month's cashback.
  const card = { issuer: 'ether.fi', last4: '9969', merchant: 'WWW.AMAZON.ES, LU', mcc: '5999', mccName: 'Miscellaneous & Specialty Retail Stores', billed: { amount: 171.68, currency: 'USD' }, cashback: { amount: 5.15, currency: 'USD' }, mode: 'Borrow Mode', status: 'CLEARED' };
  const shopId = await c.mutation('mobile:createTransaction', { portfolioId: p, description: 'Amazon', kind: 'expense', amount: 151.14, currency: 'EUR', occurredAt: now - 5 * 3600e3, card, notes: 'ether.fi card •9969 · WWW.AMAZON.ES, LU' });
  await page.goto(APP + '/tx/' + (typeof shopId === 'string' ? shopId : shopId.id));
  await page.getByText('CHARGED').waitFor({ timeout: 15000 });
  b = await page.locator('body').innerText();
  check('a card purchase shows its card, what was charged and at what rate, and the cashback', b.includes('ether.fi card ••9969') && b.includes('$171.68') && b.includes('1 EUR = 1.1359 USD') && b.includes('+$5.15') && b.includes('3.0% back') && b.includes('Borrow Mode: paid from your ether.fi credit line'), b.slice(0, 700).replace(/\n/g, ' | '));
  check('it shows the merchant and its type, and not a note that only repeats them', b.includes('WWW.AMAZON.ES, LU') && b.includes('Miscellaneous & Specialty Retail Stores · MCC 5999') && !b.includes('ether.fi card •9969 ·'));
  await page.screenshot({ path: OUT + '/03b-card-purchase-dark-390.png' });
  await page.goto(APP + '/flow');
  await page.getByText(/^Cashback in /).waitFor({ timeout: 20000 });
  b = await page.locator('body').innerText();
  check('Flow adds up the month’s cashback and shows it on the row with the card', /Cashback in \w+[\s\S]*From 1 card purchase · about 3\.0% back/.test(b) && b.includes('+$5.15 back') && /••9969/.test(b), b.slice(0, 600).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/03c-flow-cashback-dark-390.png' });
  const keep = (await snap()).transactions.find((t) => t.description === 'Amazon');
  check('the card details are saved with the transaction', keep?.card?.cashback?.amount === 5.15 && keep.card.last4 === '9969');

  const wide = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const w = await wide.newPage();
  watchErrors(w, errors);
  await signIn(w, APP, EMAIL);
  await w.getByText('What you own').waitFor({ timeout: 20000 });
  await w.getByRole('link', { name: 'Flow', exact: true }).click();
  await w.getByText('You kept').waitFor({ timeout: 15000 });
  await wait(900);
  await w.screenshot({ path: OUT + '/04-flow-light-1440.png', fullPage: true });
  check('wide light Flow renders', (await w.locator('body').innerText()).includes('Every month'));

  const dm = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const dp = await dm.newPage();
  await dp.goto(APP + '/sign-in');
  await dp.getByText('Explore with demo data').click();
  await dp.getByRole('tab', { name: 'Flow' }).click();
  await dp.getByText('You kept').waitFor({ timeout: 15000 });
  // The bar's Demo pill can render a moment after the page itself.
  await dp.getByLabel('Demo data').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('demo Flow renders with its label', (await dp.getByLabel('Demo data').count()) > 0 && /demo/i.test(await dp.locator('body').innerText()));
  await dp.screenshot({ path: OUT + '/05-flow-demo-dark-390.png' });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
