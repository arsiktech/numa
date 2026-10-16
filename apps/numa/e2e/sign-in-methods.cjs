// Sign-in methods: Settings lists how the account can sign in, a password account is told it
// already has one, the sign-in page marks the method this device used last, and on the web
// "Continue with Apple" opens Apple's popup and sends its token to the server. Apple itself is
// never reached: the popup is a stand-in, and the server rightly refuses its unsigned token.
const { APP, outDir, launch, watchErrors, signUp, checker, wait } = require('./lib.cjs');
const OUT = outDir('sign-in-methods');
const EMAIL = `qa-methods-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);

  await page.goto(APP + '/settings');
  await page.getByText('Apple', { exact: true }).waitFor({ timeout: 15000 });
  await wait(600);
  let b = await page.locator('body').innerText();
  check('Settings lists Apple, Google and the password', /Apple[\s\S]*Not connected[\s\S]*Google[\s\S]*Not connected/.test(b) && b.includes('Change password') && b.includes(`Sign in anywhere with ${EMAIL}`), b.split('\n').filter((l) => /Apple|Google|password|connected/i.test(l)).join(' | '));
  await page.screenshot({ path: OUT + '/01-settings-methods-dark-390.png', fullPage: true });

  await page.goto(APP + '/password?set=1');
  await page.getByRole('heading', { name: 'Set a password' }).waitFor({ timeout: 15000 });
  await page.getByLabel('New password').fill('Another-Pass-2026');
  await page.getByLabel('Type it again').fill('Another-Pass-2026');
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByText(/already has a password/).waitFor({ timeout: 15000 });
  check('an account with a password is told to change it instead', true);
  await page.screenshot({ path: OUT + '/02-set-password-dark-390.png' });

  await page.goto(APP + '/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await wait(500);
  check('the sign-in page marks email as last used on this device', (await page.getByRole('tab', { name: 'Sign in, last used' }).count()) === 1);

  // Apple on the web, with Apple's popup replaced by a stand-in that returns a token.
  const web = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })).newPage();
  watchErrors(web, errors);
  await web.addInitScript(() => {
    window.__appleInit = null;
    window.AppleID = { auth: {
      init: (config) => { window.__appleInit = config; },
      signIn: async () => ({ authorization: { id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ingifq.e30.c2ln' }, user: { name: { firstName: 'Ada' } } }),
    } };
  });
  await web.goto(APP + '/sign-in?appleweb=1');
  const apple = web.getByRole('button', { name: /^Continue with Apple/ });
  await apple.waitFor({ timeout: 20000 });
  await web.screenshot({ path: OUT + '/03-sign-in-apple-web-light-1280.png' });
  await apple.click();
  await web.getByText('Couldn’t sign in with Apple. Try again, or use email.').waitFor({ timeout: 20000 });
  const init = await web.evaluate(() => window.__appleInit);
  check('Apple opens as a popup for the web Services ID, with a hashed nonce', init?.clientId === 'com.arsiktech.numa.web' && init?.usePopup === true && /^[0-9a-f]{64}$/.test(init?.nonce ?? ''), JSON.stringify(init));
  check('the server refuses a token Apple didn’t sign', true);
  const plain = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await plain.goto(APP + '/sign-in');
  await plain.getByLabel('Email').waitFor({ timeout: 20000 });
  await wait(800);
  check('Apple stays hidden on hosts Apple doesn’t return to', (await plain.getByRole('button', { name: /Continue with Apple/ }).count()) === 0);

  // Expected: the browser logs the failed sign-in request; nothing else should.
  const unexpected = errors.filter((e) => !/favicon|Download the React DevTools|Failed to load resource|apple-native|InvalidAccountId|bad token|Server Error|Uncaught/i.test(e));
  check('no unexpected page or console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
