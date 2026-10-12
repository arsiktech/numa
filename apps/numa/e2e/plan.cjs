const { launch, watchErrors, signUp, client, checker, wait, DAY, APP, outDir } = require('./lib.cjs');
const OUT = outDir('plan');
const EMAIL = `qa-plan-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId: p, snap } = await client(EMAIL);
  const s0 = await snap();
  const cat = (n) => s0.categories.find((x) => x.name === n).id;
  const cash = s0.assets.find((a) => a.kind === 'cash');
  await c.mutation('mobile:upsertAsset', { id: cash.id, portfolioId: p, name: 'Cash', kind: 'cash', balance: 12000, currency: 'EUR' });
  const ago = (m) => new Date(new Date().getFullYear(), new Date().getMonth() - m, 10, 12).getTime();
  const add = (description, amount, occurredAt, categoryId) => c.mutation('mobile:createTransaction', { portfolioId: p, description, kind: 'expense', amount, currency: 'EUR', occurredAt, ...(categoryId ? { categoryId } : {}) });
  await add('August', 1000, ago(3)); await add('September', 2000, ago(2)); await add('Last month', 3000, ago(1));
  await add('Lunches', 85, Date.now() - 3600e3, cat('Dining')); await add('Rent', 1200, Date.now() - 7200e3, cat('Rent'));

  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByText('RUNWAY').waitFor({ timeout: 15000 });
  await wait(800);
  let b = await page.locator('body').innerText();
  check('runway from the last three months', b.includes('About 6 months on cash') && b.includes('spending about €2,000 a month (last 3 months)'), b.split('\n').slice(1, 6).join(' | '));

  await page.getByRole('button', { name: /^Dining\. No limit/ }).click();
  await page.getByRole('textbox', { name: 'Monthly limit' }).fill('100');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Dining limit set').waitFor({ timeout: 10000 });
  await wait(800);
  check('limit saves to the category', (await snap()).categories.find((x) => x.name === 'Dining').monthlyLimit === 100);
  b = await page.locator('body').innerText();
  check('limit row shows spent of limit', b.includes('€85 of €100'));
  await page.screenshot({ path: OUT + '/01-plan-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: 'Add a goal' }).click();
  await page.getByRole('textbox', { name: 'Target' }).fill('24000');
  await page.getByRole('textbox', { name: /^By/ }).fill('31 Dec');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await page.getByText('Goal added').waitFor({ timeout: 10000 });
  await wait(800);
  let goals = (await snap()).goals;
  check('goal saves', goals.length === 1 && goals[0].target === 24000 && new Date(goals[0].deadline).getMonth() === 11);
  b = await page.locator('body').innerText();
  // Net worth is €12,000 cash (the €85 and €1,200 expenses are not tied to the account).
  check('goal progress from net worth', /Net worth\s*\n?\s*50%/.test(b) && b.includes('€12,000 of €24,000'), b.match(/Net worth[^\n]*\n[^\n]*\n[^\n]*/)?.[0] ?? '');
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  check('undo removes the new goal', (await snap()).goals.length === 0);

  await page.getByRole('button', { name: 'Add a goal' }).click();
  await page.getByRole('radio', { name: 'Monthly income' }).click();
  await page.getByRole('textbox', { name: 'Target' }).fill('5000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await page.getByText('Goal added').waitFor({ timeout: 10000 });
  await wait(800);
  await page.getByRole('button', { name: /^Income this month/ }).click();
  await page.getByRole('button', { name: 'Delete goal' }).click();
  await page.getByText('Income this month deleted').waitFor({ timeout: 10000 });
  await wait(600);
  check('goal delete', (await snap()).goals.length === 0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  goals = (await snap()).goals;
  check('undo re-creates the deleted goal', goals.length === 1 && goals[0].scope === 'monthly_income' && goals[0].target === 5000);

  await page.getByRole('tab', { name: 'Home' }).click();
  await page.getByText('What you own').waitFor({ timeout: 10000 });
  await wait(800);
  check('Needs you raises the limit at 85%', (await page.locator('body').innerText()).includes('Dining is at 85% of its limit'));

  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('button', { name: /^Dining\./ }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByText('Dining limit removed').waitFor({ timeout: 10000 });
  await wait(800);
  check('limit can be removed', (await snap()).categories.find((x) => x.name === 'Dining').monthlyLimit == null);

  const w = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })).newPage();
  watchErrors(w, errors);
  await w.goto(APP + '/sign-in');
  await w.getByText('Explore with demo data').click();
  await w.getByRole('link', { name: 'Plan', exact: true }).click();
  await w.getByText('RUNWAY').waitFor({ timeout: 15000 });
  check('demo Plan renders', (await w.locator('body').innerText()).includes('Net worth €1M'));
  await w.screenshot({ path: OUT + '/02-plan-demo-light-1440.png', fullPage: true });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
