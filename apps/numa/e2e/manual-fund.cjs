// Run only against the throwaway local backend and its matching web export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { APP, CONVEX, req, outDir, launch, signIn, PASSWORD } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
assert(['127.0.0.1', 'localhost'].includes(new URL(CONVEX).hostname));
assert(['127.0.0.1', 'localhost'].includes(new URL(APP).hostname));
const OUT = outDir('manual-fund');
const email = `qa-manual-fund-${Date.now()}@example.com`;
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log('PASS ' + name); }
(async () => {
  const client = new ConvexHttpClient(CONVEX);
  const auth = await client.action('auth:signIn', { provider: 'password', params: { email, password: PASSWORD, flow: 'signUp', name: 'Synthetic Fund QA' } });
  assert(auth.tokens?.token, 'local test sign-up must return a session');
  client.setAuth(auth.tokens.token);
  const portfolioId = (await client.mutation('mobile:bootstrap', {})).selectedPortfolioId;
  const get = () => client.query('mobile:portfolioSnapshot', { portfolioId });
  const create = await client.mutation('mobile:upsertAsset', { portfolioId, name: 'Synthetic mutual fund', kind: 'other', balance: 234.56, currency: 'EUR', location: 'Synthetic broker · 3.25 units', notes: 'Synthetic opening valuation' });
  const id = create.id;
  assert(id, 'create must return the existing asset id');
  const before = (await get()).assets.find(a => a.id === id);
  assert(before && before.costBasis === null && before.acquiredAt === null);
  const intent = { id, portfolioId, investmentType: 'fund', expectedInvestmentType: null };
  const race = await Promise.allSettled(['a', 'b'].map(s => client.mutation('assets:classify', { ...intent, clientMutationId: `${email}:${s}` })));
  check('real concurrent stale classifications commit exactly one intent', race.filter(r => r.status === 'fulfilled').length === 1 && race.filter(r => r.status === 'rejected' && /classification changed/i.test(String(r.reason))).length === 1);
  const winner = race.findIndex(r => r.status === 'fulfilled');
  const retry = await client.mutation('assets:classify', { ...intent, clientMutationId: `${email}:${winner === 0 ? 'a' : 'b'}` });
  check('same-intent acknowledgement retry reads its committed receipt', retry.replayed === true && retry.id === id);
  const after = (await get()).assets.find(a => a.id === id);
  assert.deepEqual(after, { ...before, investmentType: 'fund' });
  check('classification preserves every value, note, timestamp and unknown purchase field', true);
  const browser = await launch();
  const errors = [];
  try {
    for (const { mobile, width } of [{ mobile: true, width: 320 }, { mobile: true, width: 390 }, { mobile: false, width: 1440 }, { mobile: false, width: 1920 }]) {
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 1000 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: mobile ? 'dark' : 'light', reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      const quoteCalls = [];
      page.on('websocket', ws => ws.on('framesent', f => { if (typeof f.payload === 'string' && /priceSeries/.test(f.payload)) quoteCalls.push(f.payload); }));
      await signIn(page, APP, email);
      await page.getByText('What you own').first().waitFor({ timeout: 20000 });
      await page.goto(APP + '/holdings/stocks');
      await page.bringToFront();
      await page.getByRole('heading', { name: 'Stocks and funds', exact: true }).waitFor({ timeout: 15000 });
      await page.getByText('Synthetic mutual fund', { exact: true }).first().waitFor();
      const metrics = await page.evaluate(() => ({ hidden: document.hidden, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, touch: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches }));
      check(`${width}: visible correct group has no horizontal overflow`, !metrics.hidden && metrics.width === width && metrics.scroll <= width);
      if (mobile) check('phone uses actual touch and coarse-pointer emulation', metrics.touch > 0 && metrics.coarse);
      await page.screenshot({ path: `${OUT}/stocks-${width}.png` });
      // The map and the position row both lead to the original asset position.
      const fundLink = page.getByRole('link', { name: /^Synthetic mutual fund,.*Open$/ }).first();
      if (mobile) await fundLink.tap();
      else await fundLink.click();
      await page.getByText('WHERE IT IS', { exact: true }).waitFor();
      check(`${width}: the treemap opens a stable asset position, not a ticker`, decodeURIComponent(new URL(page.url()).pathname).endsWith(`/position/stocks/item:${id}`));
      await page.screenshot({ path: `${OUT}/position-${width}.png` });
      await page.getByRole('link', { name: /^Synthetic broker.*Open the record$/ }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
      const body = await page.locator('body').innerText();
      check(`${width}: the position opens the original Fund record with no invented gain or purchase`, new URL(page.url()).pathname.endsWith(`/item/asset/${id}`) && /Kind\s+Fund/.test(body) && body.includes('€234.56') && !/You paid|Since bought|Price\s|Bought\s/.test(body));
      check(`${width}: a manual asset never requests market-price history`, quoteCalls.length === 0);
      await page.screenshot({ path: `${OUT}/record-${width}.png` });
      if (!mobile) {
        await page.goto(APP + '/holdings/stocks');
        await page.getByRole('heading', { name: 'Stocks and funds', exact: true }).waitFor();
        const keyboardLink = page.locator('a[href^="/position/stocks/"]').filter({ hasText: 'Synthetic mutual fund' });
        await keyboardLink.focus();
        check(`${width}: the fund position row is keyboard-focusable`, await keyboardLink.evaluate(el => document.activeElement === el));
        await page.keyboard.press('Enter');
        await page.getByText('WHERE IT IS', { exact: true }).waitFor();
        check(`${width}: Enter opens the same original asset position`, decodeURIComponent(new URL(page.url()).pathname).endsWith(`/position/stocks/item:${id}`));
      }
      await page.goto(APP + '/holdings/things');
      await page.getByRole('heading', { name: 'Things', exact: true }).waitFor();
      check(`${width}: the same fund is absent from Things`, !(await page.locator('body').innerText()).includes('Synthetic mutual fund'));
      await context.close();
    }
    check('journey has no JavaScript page errors', errors.length === 0);
  } finally { await browser.close(); }
  const final = (await get()).assets.find(a => a.id === id);
  assert.deepEqual(final, after);
  check('read-only browser journey leaves the financial record unchanged', true);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ ok: true, checks }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
