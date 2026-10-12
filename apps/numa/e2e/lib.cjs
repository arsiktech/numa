// Shared helpers for the browser journeys. They run against a throwaway local
// Convex backend (see README.md) with disposable example.com identities.
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const req = require('module').createRequire(path.join(ROOT, 'package.json'));
const { chromium } = req('playwright');
const { ConvexHttpClient } = req('convex/browser');
const { execFileSync } = require('child_process');

const CONVEX = process.env.E2E_CONVEX_URL || 'http://127.0.0.1:3210';
const APP = process.env.E2E_APP_URL || 'http://localhost:5196';
const outDir = (name) => { const d = path.join(__dirname, 'output', name); require('fs').mkdirSync(d, { recursive: true }); return d; };
const PASSWORD = 'Ledger-Harbor-47!';
const DAY = 86400000;

function checker() {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
  const finish = () => { const failed = results.filter((x) => !x.ok).length; console.log(`\n${results.length - failed}/${results.length} checks passed`); return failed; };
  return { check, finish };
}

/** Chromium, through HTTPS_PROXY when one is set (local hosts stay direct). E2E_CHROMIUM overrides the browser binary. */
async function launch() {
  const opts = { executablePath: process.env.E2E_CHROMIUM || undefined };
  if (process.env.HTTPS_PROXY) {
    const u = new URL(process.env.HTTPS_PROXY);
    opts.proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined, bypass: 'localhost,127.0.0.1' };
    opts.args = ['--ignore-certificate-errors'];
  }
  return chromium.launch(opts);
}

function watchErrors(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
}

async function signUp(page, app, email) {
  await page.goto(app + '/sign-in');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Nothing tracked yet').first().waitFor({ timeout: 20000 });
}

async function signIn(page, app, email) {
  await page.goto(app + '/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function client(email) {
  const c = new ConvexHttpClient(CONVEX);
  const r = await c.action('auth:signIn', { provider: 'password', params: { email, password: PASSWORD, flow: 'signIn' } });
  c.setAuth(r.tokens.token);
  const portfolioId = (await c.mutation('mobile:bootstrap', {})).selectedPortfolioId;
  return { c, portfolioId, snap: () => c.query('mobile:portfolioSnapshot', { portfolioId }) };
}

const rate = () => JSON.parse(execFileSync('curl', ['-sS', '-m', '15', 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD']).toString()).rates.USD;
const storeQuotes = (quotes) => execFileSync('npx', ['convex', 'run', 'marketQuotes:storeQuotes', JSON.stringify({ quotes })], { cwd: ROOT, stdio: 'pipe' });
const euro = (c) => '€' + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { ROOT, APP, CONVEX, req, outDir, launch, watchErrors, signUp, signIn, client, checker, rate, storeQuotes, euro, wait, DAY, PASSWORD };
