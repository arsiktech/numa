// Settings: spaces, currency, export, password, delete account.
const fs = require('fs');
const { ROOT, APP, CONVEX, req, outDir, launch, watchErrors, signUp, client, checker, wait, PASSWORD } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
const OUT = outDir('settings');
const EMAIL = `qa-settings-${Date.now()}@example.com`;
const GRACE_EMAIL = `qa-grace-${Date.now()}@qa.invalid`;
const NEW_PASSWORD = 'Harbor-Lantern-82?';
const { check, finish } = checker();

async function canSignIn(email, password) {
  try {
    const c = new ConvexHttpClient(CONVEX);
    const r = await c.action('auth:signIn', { provider: 'password', params: { email, password, flow: 'signIn' } });
    return Boolean(r.tokens?.token);
  } catch { return false; }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId } = await client(EMAIL);
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Main account', kind: 'cash', balance: 4321, currency: 'EUR', clientMutationId: `qa.asset:${Date.now()}` });

  // Spaces and currency.
  await page.goto(APP + '/settings');
  await page.getByRole('radiogroup', { name: 'Space' }).waitFor({ timeout: 15000 });
  const personal = page.getByRole('radio', { name: /^Personal, Personal, EUR/ });
  check('Settings lists the space, checked, in EUR', await personal.getAttribute('aria-checked') === 'true');
  await page.screenshot({ path: OUT + '/01-settings-dark-390.png', fullPage: true });

  await page.getByRole('radiogroup', { name: 'Currency' }).getByRole('radio', { name: 'USD' }).click();
  await page.getByText('Totals now in USD').waitFor({ timeout: 10000 });
  await wait(500);
  let p = (await c.query('spaces:listMine', {})).find((s) => s.id === portfolioId);
  const changed = p.defaultCurrency === 'USD';
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(1200);
  p = (await c.query('spaces:listMine', {})).find((s) => s.id === portfolioId);
  check('currency changes on the server, and Undo puts it back', changed && p.defaultCurrency === 'EUR', `changed=${changed} now=${p.defaultCurrency}`);

  await page.getByRole('button', { name: 'New space' }).click();
  await page.getByLabel('Space name').fill('Studio');
  await page.getByRole('radiogroup', { name: 'New space currency' }).getByRole('radio', { name: 'USD' }).click();
  await page.getByRole('button', { name: 'Create space' }).click();
  await page.getByText('Now showing Studio').waitFor({ timeout: 10000 });
  await wait(600);
  const spaces = await c.query('spaces:listMine', {});
  const studio = spaces.find((s) => s.name === 'Studio');
  check('a new business space is created in USD and selected', spaces.length === 2 && studio?.spaceKind === 'business' && studio?.defaultCurrency === 'USD'
    && await page.getByRole('radio', { name: /^Studio, Business, USD/ }).getAttribute('aria-checked') === 'true');
  await page.goto(APP + '/');
  await page.getByText('Nothing tracked yet').first().waitFor({ timeout: 15000 });
  await page.reload();
  await page.getByText('Nothing tracked yet').first().waitFor({ timeout: 15000 });
  check('the chosen space survives a reload and starts empty', !(await page.locator('body').innerText()).includes('4,321'));

  await page.goto(APP + '/settings');
  await page.getByRole('radio', { name: /^Personal, Personal, EUR/ }).click();
  await page.goto(APP + '/');
  await page.getByText('4,321').first().waitFor({ timeout: 15000 });
  check('switching back shows Personal’s money', true);

  // Export.
  await page.goto(APP + '/settings');
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /Download a copy of Personal/ }).click();
  const download = await dl;
  const file = OUT + '/' + download.suggestedFilename();
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('export downloads one complete JSON file for the space', /^numa-personal-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())
    && json.manifest.format === 'numa-space-export-v1' && json.manifest.name === 'Personal'
    && json.sections.assets.some((a) => a.name === 'Main account' && a.balance === 4321)
    && Array.isArray(json.sections.transactions) && json.sections.categories.length > 0
    && Object.keys(json.sections).length === json.manifest.sections.length,
    `${download.suggestedFilename()} sections=${Object.keys(json.sections).length}`);
  await page.getByText(/^Saved numa-personal/).waitFor({ timeout: 5000 });

  // Password.
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByRole('heading', { name: 'Change password' }).waitFor();
  await page.getByLabel('Current password').fill('Not-The-Password-1!');
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText('Current password is incorrect.').waitFor({ timeout: 15000 });
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText('Use at least 10 characters.').waitFor({ timeout: 15000 });
  check('password change explains a wrong current password and a weak new one', true);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText('Password changed. Your other devices are signed out.').waitFor({ timeout: 15000 });
  check('password changes: the new one works and the old one no longer does', await canSignIn(EMAIL, NEW_PASSWORD) && !(await canSignIn(EMAIL, PASSWORD)));

  // Delete account, test identity: erased at once, signed out.
  await page.goto(APP + '/delete-account');
  await page.getByRole('heading', { name: 'Delete account' }).waitFor();
  const del = page.getByRole('button', { name: 'Delete my account' });
  const disabledFirst = (await del.getAttribute('aria-disabled')) === 'true';
  await page.getByLabel('Type delete to confirm').fill('delete');
  await page.screenshot({ path: OUT + '/02-delete-dark-390.png', fullPage: true });
  await del.click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 20000 });
  check('delete needs the word, then erases a test account and signs out', disabledFirst && !(await canSignIn(EMAIL, NEW_PASSWORD)));

  // Delete account, ordinary identity: 7-day grace, then Keep my account.
  const w = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })).newPage();
  watchErrors(w, errors);
  await signUp(w, APP, GRACE_EMAIL);
  await w.goto(APP + '/delete-account');
  await w.getByLabel('Type delete to confirm').fill('Delete');
  await w.getByRole('button', { name: 'Delete my account' }).click();
  await w.getByText(/Your account will be deleted on/).waitFor({ timeout: 20000 });
  const g = await client(GRACE_EMAIL);
  const me1 = await g.c.query('profiles:me', {});
  const sevenDays = me1.deletionScheduledAt - Date.now();
  await w.screenshot({ path: OUT + '/03-grace-light-1440.png' });
  await w.getByRole('button', { name: 'Keep my account' }).click();
  await w.getByText(/Your account will be deleted on/).waitFor({ state: 'detached', timeout: 15000 });
  const me2 = await g.c.query('profiles:me', {});
  check('an ordinary account gets 7 days and can be kept', sevenDays > 6.9 * 86400000 && sevenDays < 7.1 * 86400000 && me2.deletionScheduledAt === null
    && await w.getByRole('button', { name: 'Delete account' }).isVisible());

  // Demo can't reach account screens.
  const d = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  watchErrors(d, errors);
  await d.goto(APP + '/sign-in');
  const demoBtn = d.getByRole('button', { name: /demo/i }).first();
  if (await demoBtn.count()) {
    await demoBtn.click();
    await wait(800);
    await d.goto(APP + '/password');
    await wait(1500);
    check('demo mode sends account screens back to Settings', !(await d.locator('body').innerText()).includes('Current password'));
  }

  // Deliberate failures log on the console: the wrong-password and weak-password attempts, and the erased account's last live query.
  const expected = (e) => /authManagement:changePassword\)\].*Server Error/.test(e) || /UNAUTHENTICATED.*Account no longer exists/s.test(e);
  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  console.log('expected errors seen:', filtered.filter(expected).length);
  const unexpected = filtered.filter((e) => !expected(e));
  check('no unexpected page or console errors', unexpected.length === 0, unexpected.slice(0, 4).map((e) => e.slice(0, 300)).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
