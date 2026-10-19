// A debt that follows a company portal: a bad link is refused, a link that can't be read keeps the
// debt as it was (never zero), and stopping keeps the last value. With E2E_PORTAL_URL (and
// E2E_PORTAL_KEY) set, a real portal is read too and the debt becomes its shortfall.
const { APP, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');

const OUT = outDir('portal');
const EMAIL = `qa-portal-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId, snap } = await client(EMAIL);
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Company shortfall', kind: 'other', balance: 148602.38, currency: 'EUR', counterparty: 'Company' });
  const debt = async () => (await snap()).liabilities.find((l) => l.name === 'Company shortfall');
  const id = (await debt()).id;

  await page.goto(`${APP}/item/liability/${id}`);
  await page.getByRole('button', { name: 'Keep in step with a company portal' }).click();
  await page.getByLabel('Portal agent link (https://…)').fill('http://portal.example.com/mcp');
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await page.getByText('Paste the portal’s https agent link.').waitFor({ timeout: 10000 });
  check('a link that isn’t https is refused', true);

  await page.getByLabel('Portal agent link (https://…)').fill('https://example.com/mcp');
  await page.getByLabel('Key, if the portal gave one').fill('qa-not-a-real-key');
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await page.getByText('example.com', { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText(/Showing the last value/).waitFor({ timeout: 30000 });
  check('a portal that can’t be read says so and keeps the debt, never zero', (await debt()).balance === 148602.38);
  const listed = await c.query('liabilitySources:listForPortfolio', { portfolioId });
  check('the key never comes back from the server', listed.length === 1 && !JSON.stringify(listed).includes('qa-not-a-real-key'));
  await page.screenshot({ path: OUT + '/01-unreadable-dark-390.png', fullPage: true });

  // Money owed back by the company, as a business investment, follows some investors through the same portal.
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Business investment', kind: 'business', balance: 233567, currency: 'EUR', owedBy: 'Company' });
  const invest = (await snap()).assets.find((a) => a.name === 'Business investment');
  await c.mutation('liabilitySources:followInvestors', { record: `asset:${invest.id}`, investorIds: ['parents', 'lyudmila'], label: 'Parents and Lyudmila' });
  await page.goto(`${APP}/item/asset/${invest.id}`);
  await page.getByText('Parents and Lyudmila · example.com').waitFor({ timeout: 15000 });
  await page.getByText(/Showing the last value/).waitFor({ timeout: 30000 });
  const assetPage = await page.locator('body').innerText();
  check('money owed back follows investors through the same portal, and an unreadable portal keeps its value', /BUSINESS/.test(assetPage) && (await snap()).assets.find((a) => a.id === invest.id).balance === 233567, assetPage.split('\n').slice(0, 14).join(' | '));
  check('a business investment counts under Business', /BUSINESS/.test(assetPage));
  await page.screenshot({ path: OUT + '/02-investment-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop following' }).click();
  await wait(800);
  check('the investment can stop following too', !(await c.query('liabilitySources:listForPortfolio', { portfolioId })).some((s) => s.assetId === invest.id));
  await page.goto(`${APP}/item/liability/${id}`);
  await page.getByText('example.com', { exact: true }).waitFor({ timeout: 10000 });

  await page.getByRole('button', { name: 'Stop following' }).click();
  await page.getByRole('button', { name: 'Keep in step with a company portal' }).waitFor({ timeout: 10000 });
  check('stopping keeps the last value', (await debt()).balance === 148602.38 && (await c.query('liabilitySources:listForPortfolio', { portfolioId })).length === 0);

  if (process.env.E2E_PORTAL_URL) {
    await page.getByRole('button', { name: 'Keep in step with a company portal' }).click();
    await page.getByLabel('Portal agent link (https://…)').fill(process.env.E2E_PORTAL_URL);
    if (process.env.E2E_PORTAL_KEY) await page.getByLabel('Key, if the portal gave one').fill(process.env.E2E_PORTAL_KEY);
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await page.getByText(/^Read just now\./).waitFor({ timeout: 30000 });
    await wait(500);
    const after = await debt();
    check('a real portal sets the debt to its shortfall', after.balance !== 148602.38 && after.balance >= 0, String(after.balance));
    await page.getByRole('button', { name: 'Stop following' }).click();
    await wait(800);
  }

  // The http link refused on purpose above is the one expected error.
  const filtered = errors.filter((e) => !/favicon|Download the React DevTools|INVALID_PORTAL_LINK/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
