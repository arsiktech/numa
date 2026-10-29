// Offline notice: shown when the live connection drops, gone when it comes back.
const { launch, watchErrors, signUp, checker, APP, outDir } = require('./lib.cjs');
const OUT = outDir('offline');
const EMAIL = `qa-offline-${Date.now()}@example.com`;
const { check, finish } = checker();
const NOTICE = 'Offline. Reconnect before saving. Figures may be out of date.';

(async () => {
  const browser = await launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  await page.waitForTimeout(4000);
  check('no notice while connected', !(await page.getByText(NOTICE).isVisible()));
  await ctx.setOffline(true);
  const shown = await page.getByText(NOTICE).waitFor({ timeout: 60000 }).then(() => true, () => false);
  await page.screenshot({ path: OUT + '/01-offline-dark-390.png' });
  check('the notice appears once the connection drops', shown);
  check('the screen keeps showing what it had', (await page.locator('body').innerText()).includes('Nothing tracked yet'));
  await ctx.setOffline(false);
  const gone = await page.getByText(NOTICE).waitFor({ state: 'detached', timeout: 60000 }).then(() => true, () => false);
  check('the notice goes away after reconnecting', gone);
  // Losing the connection logs network errors in the console; only page errors count here.
  const pageErrors = errors.filter((e) => !/WebSocket|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/i.test(e));
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
