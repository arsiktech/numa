// DeFi earnings: three days of wallet readings, saved the way the 30-minute refresh saves them, become
// what each strategy earned (lent USDC growing, a vault share worth more) minus loan interest, shown on
// Home, on Crypto and on the earnings screen. Money moved in is not counted as earned.
const { execFileSync } = require('child_process');
const { ROOT, APP, outDir, launch, watchErrors, signUp, client, checker, wait, DAY } = require('./lib.cjs');

const OUT = outDir('earnings');
const EMAIL = `qa-earnings-${Date.now()}@example.com`;
const EVM = '0x2222222222222222222222222222222222222222';
const { check, finish } = checker();
const save = (walletId, snapshot, refs) => execFileSync('npx', ['convex', 'run', 'walletSync:saveSnapshot', JSON.stringify({ walletId, snapshot, refs })], { cwd: ROOT, stdio: 'pipe' });

const snapshot = (at, usdc, gho, liquid, liquidUsd) => ({
  provider: 'public', addressType: 'evm', tokenValueUsd: 0, defiValueUsd: usdc + liquidUsd, debtValueUsd: gho, totalValueUsd: usdc + liquidUsd - gho, tokens: [], chains: ['base', 'optimism'], failedChains: [], tokensFetchedAt: at, updatedAt: at, partial: false,
  defiPositions: [
    { id: 'base:aave-v3', chain: 'base', chainName: 'Base', protocol: 'Aave V3', label: 'Aave V3 lending and borrowing', kind: 'supplied', valueUsd: usdc - gho, assetValueUsd: usdc, debtValueUsd: gho, healthFactor: 2.1, symbols: [],
      assets: [{ symbol: 'USDC', quantity: String(usdc), valueUsd: usdc }, { symbol: 'GHO', quantity: String(gho), valueUsd: gho, debt: true }] },
    { id: 'optimism:etherfi-cash', chain: 'optimism', chainName: 'Optimism', protocol: 'ether.fi Cash', label: 'ether.fi Cash', kind: 'supplied', valueUsd: liquidUsd, assetValueUsd: liquidUsd, debtValueUsd: 0, symbols: [],
      assets: [{ symbol: 'liquidUSD', quantity: String(liquid), valueUsd: liquidUsd }] },
  ],
});

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId } = await client(EMAIL);
  const added = await c.mutation('cryptoWallets:add', { portfolioId, address: EVM, addressType: 'evm', label: 'Frame', includeInNetWorth: true, clientMutationId: `qa.wallet:${Date.now()}` });
  const walletId = typeof added === 'string' ? added : added.id;

  // Day 1 → 2: 2 USDC of interest earned, 1 GHO of interest owed, liquidUSD up 10 dollars.
  // Day 2 → 3: the same again, plus 5,000 USDC deposited: that day's USDC is money moved, not earned.
  const now = Date.now();
  save(walletId, snapshot(now - 2 * DAY, 10_000, 4_000, 50_000, 51_000), { ETH: 4000 });
  save(walletId, snapshot(now - DAY, 10_002, 4_001, 50_000, 51_010), { ETH: 4000 });
  save(walletId, snapshot(now, 15_004, 4_002, 50_000, 51_020), { ETH: 4000 });
  const rows = await c.query('defiEarnings:forPortfolio', { portfolioId });
  const aave = rows.find((r) => r.position === 'base:aave-v3'), cash = rows.find((r) => r.position === 'optimism:etherfi-cash');
  check('the server reads 2 USDC earned and 2 GHO of interest on Aave, and 20 dollars on liquidUSD, leaving the deposit day out', aave?.earnedUsd === 2 && aave?.paidUsd === 2 && cash?.earnedUsd === 20, JSON.stringify(rows.map((r) => [r.position, r.earnedUsd, r.paidUsd])));

  await page.goto(APP + '/');
  await page.getByText('DeFi earnings').first().waitFor({ timeout: 20000 });
  check('Home shows DeFi earnings for the last 30 days', /DeFi earnings[\s\S]*\+€\d+\.\d\d[\s\S]*last 30 days/.test(await page.locator('body').innerText()));

  await page.goto(APP + '/earnings');
  await page.getByText('BY STRATEGY').waitFor({ timeout: 20000 });
  await wait(1600); // Let the line finish drawing.
  const body = await page.locator('body').innerText();
  check('the earnings screen shows the net, what was earned and the interest, with a yearly rate', /\+€\d+\.\d\d/.test(body) && /Earned €\d+\.\d\d · interest €\d\.\d\d/.test(body) && /About \d+(\.\d)?% a year/.test(body), body.slice(0, 600).replace(/\n/g, ' | '));
  check('each strategy is listed with where it is', body.includes('ether.fi Cash') && body.includes('Frame · Optimism') && body.includes('Aave V3 lending and borrowing'));
  await page.screenshot({ path: OUT + '/01-earnings-dark-390.png' });
  // Tapping a day fades the rest and shows that day: the headline follows it, like scrubbing on Home.
  await page.getByRole('button', { name: /: net \+€/ }).last().click();
  await page.getByText(/^Total so far /).waitFor({ timeout: 10000 });
  const tapped = await page.locator('body').innerText();
  check('tapping a day shows what it earned and paid, and the total so far', /Earned\s*\n?\s*\+€\d+\.\d\d/.test(tapped) && /Interest\s*\n?\s*−€\d+\.\d\d/.test(tapped), tapped.slice(0, 500).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/02-day-tapped-dark-390.png' });
  await page.getByRole('button', { name: /: net \+€/ }).last().click();
  await page.getByText(/^Earned €/).first().waitFor({ timeout: 10000 });

  // Opened by its address, Crypto keeps Home mounted behind it; its own card is the last one.
  await page.goto(APP + '/holdings/crypto');
  await page.getByRole('link', { name: /^DeFi earnings/ }).last().click({ timeout: 20000 });
  await page.getByText('BY STRATEGY').last().waitFor({ timeout: 20000 });
  check('Crypto opens the earnings too', true);

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
