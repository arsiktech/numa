// Continue with Google on web: the button shows only when the backend has Google set up,
// and pressing it leaves for Google's sign-in page with the code returning to Convex Auth.
// The local backend gets placeholder Google settings for this journey only; Google itself is
// never reached (the request is stopped and inspected).
const { ROOT, APP, outDir, launch, checker } = require('./lib.cjs');
const { execFileSync } = require('child_process');

const OUT = outDir('quick-sign-in');
const env = (...args) => execFileSync('npx', ['convex', 'env', ...args], { cwd: ROOT, stdio: 'pipe' });
const { check, finish } = checker();

(async () => {
  env('set', 'AUTH_GOOGLE_ID', 'e2e-placeholder-client');
  env('set', 'AUTH_GOOGLE_SECRET', 'e2e-placeholder-secret');
  await new Promise((r) => setTimeout(r, 1500));
  const browser = await launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    page.on('pageerror', (e) => errors.push(String(e)));
    let googleUrl = null;
    // Read where Convex Auth sends the browser, then stop there so Google is never contacted.
    await page.route('**/api/auth/signin/google**', async (route) => {
      const res = await route.fetch({ maxRedirects: 0 });
      googleUrl = res.headers()['location'] ?? null;
      return route.abort();
    });

    await page.goto(APP + '/sign-in');
    const google = page.getByRole('button', { name: 'Continue with Google' });
    await google.waitFor({ timeout: 20000 });
    check('Continue with Google shows above the email form', await page.getByText('or use email').isVisible());
    check('Sign in with Apple stays off the web', (await page.getByText(/with Apple/).count()) === 0);
    await page.screenshot({ path: `${OUT}/01-sign-in-dark-390.png`, fullPage: true });

    await google.click();
    for (let i = 0; i < 40 && !googleUrl; i++) await page.waitForTimeout(250);
    const u = googleUrl ? new URL(googleUrl) : null;
    check('pressing it goes to Google with the code returning to Convex Auth', !!u && u.hostname === 'accounts.google.com' && /\/api\/auth\/callback\/google$/.test(u.searchParams.get('redirect_uri') ?? '') && u.searchParams.get('code_challenge_method') === 'S256',
      u ? `${u.hostname} → ${u.searchParams.get('redirect_uri')}` : 'no request');

    const light = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
    await light.goto(APP + '/sign-in');
    await light.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout: 20000 });
    await light.screenshot({ path: `${OUT}/02-sign-in-light-1280.png` });

    env('remove', 'AUTH_GOOGLE_ID');
    env('remove', 'AUTH_GOOGLE_SECRET');
    await new Promise((r) => setTimeout(r, 1500));
    const plain = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await plain.goto(APP + '/sign-in');
    await plain.getByLabel('Email').waitFor({ timeout: 20000 });
    await plain.waitForTimeout(1500);
    check('without Google set up, only email shows', (await plain.getByRole('button', { name: 'Continue with Google' }).count()) === 0 && (await plain.getByText('or use email').count()) === 0);
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    try { env('remove', 'AUTH_GOOGLE_ID'); env('remove', 'AUTH_GOOGLE_SECRET'); } catch { /* already removed */ }
    await browser.close();
  }
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
