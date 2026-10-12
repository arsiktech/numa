const { launch, watchErrors, signUp, client, checker, wait, APP, outDir } = require('./lib.cjs');
const OUT = outDir('alerts');
const EMAIL = `qa-alerts-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId: p, snap } = await client(EMAIL);
  const s0 = await snap();
  const dining = s0.categories.find((x) => x.name === 'Dining').id;
  await c.mutation('categories:update', { id: dining, patch: { monthlyLimit: 100 } });
  await c.mutation('mobile:createTransaction', { portfolioId: p, description: 'Lunches', kind: 'expense', amount: 85, currency: 'EUR', occurredAt: Date.now() - 3600e3, categoryId: dining });
  await c.mutation('mobile:upsertHolding', { portfolioId: p, symbol: 'ACME', name: 'Acme', kind: 'stock', quantity: 1, costBasis: 100, currency: 'EUR', acquiredAt: Date.now() });

  await page.getByText('Needs you · 2').waitFor({ timeout: 20000 });
  check('two items need attention', true);
  const card = (title) => page.locator('div').filter({ hasText: new RegExp('^' + title) }).filter({ has: page.getByRole('button', { name: 'Got it' }) }).last();
  await card('Dining is at 85% of its limit').getByRole('button', { name: 'Got it' }).click();
  await page.getByText('Hidden until it changes.').waitFor();
  check('Got it shows its done state with Undo', await page.getByRole('button', { name: 'Undo' }).isVisible());
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(300);
  check('Undo brings it back', (await page.locator('body').innerText()).includes('Needs you · 2'));
  await card('Dining is at 85% of its limit').getByRole('button', { name: 'Got it' }).click();
  await card('No price for ACME').getByRole('button', { name: 'Later' }).click();
  await page.getByText('Back tomorrow.').waitFor();
  await page.screenshot({ path: OUT + '/01-needs-you-acted-dark-390.png', fullPage: true });

  await page.reload();
  await page.getByText('What you own').waitFor({ timeout: 20000 });
  await wait(1000);
  let b = await page.locator('body').innerText();
  check('dismissed and snoozed stay hidden after reopening', b.includes('All clear') && !b.includes('Dining is at') && !b.includes('No price for ACME'));

  await c.mutation('mobile:createTransaction', { portfolioId: p, description: 'Dinner', kind: 'expense', amount: 40, currency: 'EUR', occurredAt: Date.now() - 1800e3, categoryId: dining });
  await page.getByText('Dining is over its limit').waitFor({ timeout: 15000 });
  check('a dismissed item comes back when it changes', true);

  await page.getByRole('tab', { name: 'Flow' }).click();
  await page.getByText('Tap a stream, or its chip').waitFor({ timeout: 10000 });
  check('Flow shows its first-visit tip', true);
  await page.screenshot({ path: OUT + '/02-flow-tip-dark-390.png' });
  await page.getByRole('button', { name: 'Got it' }).first().click();
  await wait(400);
  await page.reload();
  await page.getByText('You kept').or(page.getByText('more out than in')).first().waitFor({ timeout: 20000 });
  await wait(800);
  check('the tip is remembered once dismissed', !(await page.locator('body').innerText()).includes('Tap a stream, or its chip'));

  // PRO badge: the film turns, unless reduced motion is on.
  const angle = async (pg) => pg.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /rotate\(/.test(d.style.transform || ''));
    return el ? el.style.transform : null;
  });
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const w = await wide.newPage();
  watchErrors(w, errors);
  await w.goto(APP + '/sign-in');
  await w.getByText('Explore with demo data').click();
  await w.getByText('What you own').waitFor({ timeout: 15000 });
  const a1 = await angle(w); await wait(1500); const a2 = await angle(w);
  check('PRO badge film turns', !!a1 && !!a2 && a1 !== a2, `${a1} → ${a2}`);
  await w.screenshot({ path: OUT + '/03-badge-light-1440.png', clip: { x: 0, y: 0, width: 300, height: 90 } });
  const still = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
  await still.goto(APP + '/sign-in');
  await still.getByText('Explore with demo data').click();
  await still.getByText('What you own').waitFor({ timeout: 15000 });
  const r1 = await angle(still); await wait(1500); const r2 = await angle(still);
  check('PRO badge holds still with reduced motion', r1 === r2, `${r1} → ${r2}`);

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
