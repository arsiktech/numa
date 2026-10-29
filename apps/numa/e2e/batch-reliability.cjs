// Synthetic, loopback-only acceptance of confirmed writes, recovery and minimal activity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APP, CONVEX, launch, client, checker, outDir, watchErrors } = require('./lib.cjs');
assert.equal(new URL(APP).hostname, '127.0.0.1');
assert.equal(new URL(CONVEX).hostname, '127.0.0.1');
const OUT = outDir('batch-reliability');
const { check, finish } = checker();
const EMAIL = `qa-batch-${Date.now()}@example.com`;
const NOTICE = 'Offline. Reconnect before saving. Figures may be out of date.';
(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.__qaSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(...args) { super(...args); window.__qaSockets.push(this); }
    };
  });
  const errors = []; watchErrors(page, errors);
  try {
    await page.goto(APP + '/sign-in');
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill('Ledger-Harbor-47!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Ask or add', exact: true }).waitFor({ timeout: 20000 });
    const { c, portfolioId, snap } = await client(EMAIL);
    const me = await c.query('profiles:me', {});
    await Promise.all(Array.from({ length: 12 }, () => c.mutation('activeDays:record', { expectedUserId: me.id })));
    const activity = await c.query('dataExport:page', { expectedUserId: me.id, portfolioId, requestId: 'synthetic-active-export', section: 'activeDays', cursor: null, limit: 32 });
    const dates = JSON.parse(activity.rowsJSON);
    check('concurrent opens produce one row per server UTC day and export only account/date metadata', dates.length >= 1 && new Set(dates.map(d => d.utcDate)).size === dates.length && dates.every(d => d.userId === me.id && d.utcDate === new Date(d._creationTime).toISOString().slice(0, 10) && Object.keys(d).sort().join() === '_creationTime,_id,userId,utcDate'));
    let forged = false;
    try { await c.mutation('activeDays:record', { expectedUserId: me.id, utcDate: '1999-01-01' }); } catch { forged = true; }
    check('the server rejects a client-supplied activity date', forged);
    const before = await snap();
    await page.getByRole('button', { name: 'Ask or add', exact: true }).click();
    const input = page.getByLabel('Ask or add anything');
    await input.fill('coffee 4.50');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    let card = page.getByLabel(/^Draft\./).last();
    await card.getByRole('button', { name: 'Save', exact: true }).waitFor();
    const composer = 'Synthetic unsent draft 78.91';
    await input.fill(composer);
    const noPlaintext = await page.evaluate(text => ![...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes(text)), composer);
    check('web recovery does not persist the financial composer in browser storage', noPlaintext);
    await ctx.setOffline(true);
    // Offline emulation does not reliably close existing localhost sockets. Close the real observed transports as well.
    await page.evaluate(() => window.__qaSockets.forEach(socket => socket.close()));
    await page.getByText(NOTICE, { exact: true }).waitFor({ timeout: 60000 });
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/Nothing was submitted by this attempt/).waitFor({ timeout: 10000 });
    check('offline confirmation immediately refuses without changing server records', (await snap()).transactions.length === before.transactions.length);
    await page.screenshot({ path: path.join(OUT, 'offline-390.png'), fullPage: true });
    await ctx.setOffline(false);
    await page.getByText(NOTICE, { exact: true }).waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForTimeout(1200);
    check('reconnection does not automatically submit the refused entry', (await snap()).transactions.length === before.transactions.length);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Ask or add', exact: true }).click();
    card = page.getByLabel(/^Draft\./).last();
    await card.getByRole('button', { name: 'Save', exact: true }).waitFor();
    check('closing and reopening Ask preserves the reviewed draft and composer in this page', await page.getByLabel('Ask or add anything').inputValue() === composer);
    await card.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await page.getByText('SAVED', { exact: true }).waitFor({ timeout: 15000 });
    const saved = (await snap()).transactions;
    check('an explicit duplicate-tap retry saves exactly one correct expense', saved.length === before.transactions.length + 1 && saved.filter(t => t.amountMinor === Math.round(4.5 * 100) && t.kind === 'expense').length === 1);
    await page.getByLabel('Ask or add anything').fill('');
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.screenshot({ path: path.join(OUT, `recovered-${width}.png`), fullPage: true });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      check(`recovered Ask fits the ${width}px viewport`, fits);
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Ask or add', exact: true }).click();
    await page.getByLabel('Ask or add anything').waitFor();
    check('a successfully saved draft is not restored as an unsaved card', await page.getByLabel(/^Draft\./).count() === 0);
    const cash = (await snap()).assets.find(a => a.name === 'Cash');
    check('the permanent-rejection scenario has a real existing cash target', !!cash);
    assert.ok(cash);
    await page.getByLabel('Ask or add anything').fill('cash balance 99');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    card = page.getByLabel(/^Draft\./).last();
    await card.getByRole('button', { name: 'Save', exact: true }).waitFor();
    await c.mutation('mobile:deleteAsset', { id: cash.id, clientMutationId: 'synthetic-missing-target' });
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/server rejected this attempt/).waitFor({ timeout: 15000 });
    await card.getByRole('button', { name: 'Remove draft', exact: true }).click();
    check('an authoritative missing-target rejection can retire locally without another financial write', !(await snap()).assets.some(a => a.id === cash.id) && (await snap()).transactions.length === saved.length);
    const relevant = errors.filter(e => !/WebSocket|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::|Download the React DevTools/.test(e) && !(/\[CONVEX M\(mobile:upsertAsset\)\]/.test(e) && /NOT_FOUND/.test(e)));
    check('the real browser flow has no unexpected page or console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
    fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify({ source: process.env.E2E_SOURCE_COMMIT || 'local-candidate', emailFixture: 'disposable example.com', screenshots: [390, 1024, 1440], finished: true }, null, 2));
    const failures = finish();
    if (failures) process.exitCode = 1;
  } finally { await ctx.setOffline(false); await browser.close(); }
})().catch(error => { console.error('JOURNEY CRASH', error); process.exitCode = 2; });
