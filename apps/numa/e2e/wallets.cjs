// Wallet tracking: add a public address, see it counted, refresh, stop tracking and undo.
// Balances are written straight to the local backend so the checks don't depend on the explorers;
// one live check against mempool.space is logged for information only.
const { execFileSync } = require('child_process');
const { ROOT, APP, outDir, launch, watchErrors, signUp, client, checker, rate, euro, wait } = require('./lib.cjs');

const OUT = outDir('wallets');
const EMAIL = `qa-wallets-${Date.now()}@example.com`;
const BTC = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const EVM = '0x3304e22ddaa22bcdc5fca2269b418046ae7b566a';
const { check, finish } = checker();
const save = (walletId, snapshot) => execFileSync('npx', ['convex', 'run', 'walletSync:saveSnapshot', JSON.stringify({ walletId, snapshot })], { cwd: ROOT, stdio: 'pipe' });
const snap = (over) => ({ provider: 'public', addressType: 'bitcoin', tokenValueUsd: 0, defiValueUsd: 0, debtValueUsd: 0, totalValueUsd: 0, tokens: [], defiPositions: [], chains: [], failedChains: [], tokensFetchedAt: Date.now(), updatedAt: Date.now(), partial: false, ...over });
const token = (chain, chainName, symbol, quantity, valueUsd) => ({ id: `${chain}:${symbol}`, chain, chainName, symbol, name: symbol, quantity, priceUsd: valueUsd / Number(quantity), valueUsd, verified: true, suspectedSpam: false });

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId } = await client(EMAIL);
  const wallets = () => c.query('cryptoWallets:listForPortfolio', { portfolioId });

  await page.goto(APP + '/settings');
  await page.getByRole('button', { name: /Track a wallet/ }).click();
  const field = page.getByLabel('Public address');
  await field.fill('abandon ability able about above absent absorb abstract absurd abuse access accident');
  await page.getByRole('button', { name: 'Track wallet' }).click();
  check('a recovery phrase is refused before it leaves the device', await page.getByText('That looks like a recovery phrase').isVisible() && (await wallets()).length === 0);
  await field.fill('1BoatSLRHtKNngkdXEeobR76b53LETtpyT');
  await page.getByRole('button', { name: 'Track wallet' }).click();
  check('an old-style Bitcoin address gets a plain explanation', await page.getByText('start with bc1').isVisible());

  await field.fill(BTC);
  await page.getByLabel('Wallet name').fill('Cold storage');
  await page.getByRole('button', { name: 'Track wallet' }).click();
  await page.getByText('Cold storage added').waitFor({ timeout: 15000 });
  let list = await wallets();
  const cold = list.find((w) => w.label === 'Cold storage');
  check('the wallet is saved as a public Bitcoin address', list.length === 1 && cold?.addressType === 'bitcoin' && cold.address === BTC);
  // Live check, for information: the local backend may not reach the internet.
  await wait(8000);
  const live = (await wallets())[0]?.snapshot;
  console.log('INFO live mempool.space check:', live ? `ok, ${live.tokens[0]?.quantity} BTC, $${live.totalValueUsd}` : 'no snapshot (explorer unreachable from this backend)');

  let serverRefused = false;
  try { await c.mutation('cryptoWallets:add', { portfolioId, address: 'abandon ability able about above absent absorb abstract absurd abuse access accident', addressType: 'evm', label: 'x', includeInNetWorth: true }); }
  catch (e) { serverRefused = /public wallet addresses|recovery|INVALID_WALLET|SECRET/i.test(String(e)); }
  check('the server refuses a recovery phrase too', serverRefused);

  const main = await c.mutation('cryptoWallets:add', { portfolioId, address: EVM, addressType: 'evm', label: 'Main', includeInNetWorth: true, clientMutationId: `qa.wallet:${Date.now()}` });
  const mainId = typeof main === 'string' ? main : main.id;
  save(cold._id, snap({ tokenValueUsd: 40000, totalValueUsd: 40000, tokens: [token('bitcoin', 'Bitcoin', 'BTC', '0.5', 40000)], chains: ['bitcoin'] }));
  save(mainId, snap({ addressType: 'evm', tokenValueUsd: 7000, totalValueUsd: 7000, tokens: [token('ethereum', 'Ethereum', 'ETH', '2', 5000), token('ethereum', 'Ethereum', 'USDC', '2000', 2000)], chains: ['ethereum', 'optimism'], failedChains: ['base'], partial: true }));

  const usdPerEur = rate();
  const own = Math.round(47000 * 100 / usdPerEur);
  await page.goto(APP + '/');
  await page.getByText('What you own').first().waitFor({ timeout: 15000 });
  await wait(1500);
  const home = await page.locator('body').innerText();
  check('home counts both wallets in euros', home.includes(euro(own)), `expected ${euro(own)}`);
  await page.screenshot({ path: OUT + '/01-home-wallets-dark-390.png', fullPage: true });

  await page.goto(APP + '/holdings/crypto');
  await page.getByText('Cold storage').first().waitFor({ timeout: 15000 });
  const group = await page.locator('body').innerText();
  check('crypto lists each wallet with what is inside and where the number came from', group.includes('0.5 BTC') && group.includes('ETH, USDC') && /mempool\.space · just now/.test(group) && /Blockscout · just now/.test(group));
  await page.goto(APP + '/');
  await wait(800);
  check('networks that couldn’t be reached are said out loud', (await page.locator('body').innerText()).includes('Couldn’t check Base for Main') || await page.getByText('Couldn’t check Base for Main').count() > 0);

  await page.goto(APP + '/position/crypto/BTC');
  await page.getByText('WHERE IT IS').waitFor({ timeout: 15000 });
  const where = await page.locator('body').innerText();
  check('Bitcoin shows the wallet it sits in, with its address and network', where.includes('Cold storage') && where.includes(`${BTC.slice(0, 6)}…${BTC.slice(-4)} · Bitcoin`) && where.includes('0.5 BTC'), where.split('\n').slice(0, 14).join(' | '));
  await page.screenshot({ path: OUT + '/02-bitcoin-where-dark-390.png', fullPage: true });

  await page.goto(APP + '/holdings/crypto');
  await page.getByRole('link', { name: /^Cold storage,/ }).click();
  await page.getByRole('heading', { name: 'Cold storage' }).waitFor({ timeout: 10000 });
  const detail = await page.locator('body').innerText();
  check('the wallet page shows the address and its coins', detail.includes(BTC) && detail.includes('0.5 BTC') && detail.includes('mempool.space'));
  await page.screenshot({ path: OUT + '/02-wallet-detail-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByText(/Checked a moment ago|Balance updated|Couldn’t reach the explorers/).first().waitFor({ timeout: 30000 });
  check('refresh answers in plain words', true);

  await page.getByRole('button', { name: 'Stop tracking' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByText('Cold storage removed').waitFor({ timeout: 15000 });
  list = await wallets();
  const removed = list.length === 1 && list[0].label === 'Main';
  await page.getByRole('button', { name: 'Undo' }).click();
  await wait(2500);
  list = await wallets();
  check('stop tracking removes the wallet, and Undo brings it back', removed && list.length === 2 && list.some((w) => w.label === 'Cold storage' && w.address === BTC));

  const unexpected = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
