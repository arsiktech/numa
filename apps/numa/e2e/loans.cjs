// Loans and where their money went: a recorded debt backed by a watch whose money sits in savings,
// moving a place between loans, and a wallet borrowing linked to another position in the wallet.
// Net worth must not move when places are linked.
const { execFileSync } = require('child_process');
const { ROOT, APP, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');

const OUT = outDir('loans');
const EMAIL = `qa-loans-${Date.now()}@example.com`;
const EVM = '0x1111111111111111111111111111111111111111';
const { check, finish } = checker();
const save = (walletId, snapshot) => execFileSync('npx', ['convex', 'run', 'walletSync:saveSnapshot', JSON.stringify({ walletId, snapshot })], { cwd: ROOT, stdio: 'pipe' });

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId, snap } = await client(EMAIL);
  const links = () => c.query('loanLinks:listForPortfolio', { portfolioId });

  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Studio savings', kind: 'cash', balance: 6000, currency: 'EUR' });
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Watch', kind: 'collectible', balance: 8000, currency: 'EUR' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Loan from Sam', kind: 'loan', balance: 5000, currency: 'EUR' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Car loan', kind: 'loan', balance: 20000, currency: 'EUR' });
  const before = (await snap()).dashboard.netWorth;

  // A recorded debt: open it from What you owe.
  // What you owe opens by asset; each loan with where its money went is under By place.
  await page.goto(APP + '/holdings/debts');
  await page.getByRole('tab', { name: 'By place' }).click({ timeout: 20000 });
  await page.getByText('LOANS AND WHERE THE MONEY WENT').waitFor({ timeout: 20000 });
  const owe = await page.locator('body').innerText();
  check('What you owe lists each loan and says where its money went is not set', /Loan from Sam\s*\n\s*Your record · Where it went: not set/.test(owe), owe.slice(0, 400));
  await page.getByRole('link', { name: /^Loan from Sam, .* owed\./ }).click();
  await page.getByRole('heading', { name: /^WHERE THE MONEY WENT/ }).last().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Pick where it went' }).click();
  await page.getByRole('button', { name: /^Link Studio savings/ }).click();
  await page.getByText(/^\+€1,000\.00$/).waitFor({ timeout: 10000 });
  let body = await page.locator('body').innerText();
  check('linking the savings shows the borrowing up by what it bought minus what is owed', body.includes('What the money went into is worth €6,000.00; you owe €5,000.00'), body.slice(0, 500));
  await page.getByRole('button', { name: 'Add what backs it, if anything' }).click();
  await page.getByRole('button', { name: /^Link Watch/ }).click();
  await page.getByText('Loan to value').waitFor({ timeout: 10000 });
  body = await page.locator('body').innerText();
  check('a watch pledged by hand gives a loan to value from the person’s own records', /Loan to value\s*\n?\s*63%/.test(body) && body.includes('Your records, not the lender’s') && /Your stake in it\s*\n?\s*€9,000\.00/.test(body), body.slice(0, 1400).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/01-recorded-debt-dark-390.png', fullPage: true });
  let saved = await links();
  check('the links are saved on the server as typed targets', saved.length === 1 && saved[0].loanKey.startsWith('liability:') && saved[0].targets.map((t) => t.role).join() === 'deployed,collateral');
  check('net worth does not move when places are linked', (await snap()).dashboard.netWorth === before);

  // The same savings can't count for two loans: picking it on the car loan moves it there.
  await page.goto(APP + '/holdings/debts');
  await page.getByRole('tab', { name: 'By place' }).click({ timeout: 20000 });
  await page.getByRole('link', { name: /^Car loan, .* owed\./ }).click();
  await page.getByRole('button', { name: 'Pick where it went' }).click();
  const offer = page.getByRole('button', { name: /^Link Studio savings, moves it from Loan from Sam/ });
  check('a place on another loan is offered as a move, not a second count', await offer.isVisible());
  await offer.click();
  await page.getByText(/^−€14,000\.00$/).first().waitFor({ timeout: 10000 });
  saved = await links();
  const sam = saved.find((l) => l.targets.some((t) => t.role === 'collateral'));
  check('moving clears it on the first loan', saved.length === 2 && sam.targets.length === 1 && saved.filter((l) => l.targets.some((t) => t.key.startsWith('asset:') && t.role === 'deployed')).length === 1);
  await page.getByRole('button', { name: 'Unlink Studio savings' }).click();
  await page.getByText('Not set yet.').waitFor({ timeout: 10000 });
  check('unlinking the only place removes the car loan’s links', (await links()).length === 1);

  // A wallet borrowing: collateral and health factor from the protocol; the money went to ether.fi.
  const added = await c.mutation('cryptoWallets:add', { portfolioId, address: EVM, addressType: 'evm', label: 'Frame', includeInNetWorth: true, clientMutationId: `qa.wallet:${Date.now()}` });
  const walletId = typeof added === 'string' ? added : added.id;
  save(walletId, {
    provider: 'public', addressType: 'evm', tokenValueUsd: 0, defiValueUsd: 4200, debtValueUsd: 1000, totalValueUsd: 3200, tokens: [], chains: ['ethereum', 'optimism'], failedChains: [], tokensFetchedAt: Date.now(), updatedAt: Date.now(), partial: false,
    defiPositions: [
      { id: 'ethereum:aave-v3', chain: 'ethereum', chainName: 'Ethereum', protocol: 'Aave V3', label: 'Aave V3 lending and borrowing', kind: 'supplied', valueUsd: 2000, assetValueUsd: 3000, debtValueUsd: 1000, healthFactor: 2.4, symbols: [],
        assets: [{ symbol: 'WBTC', quantity: '0.05', valueUsd: 3000 }, { symbol: 'USDC', quantity: '1000', valueUsd: 1000, debt: true }] },
      { id: 'optimism:etherfi-cash', chain: 'optimism', chainName: 'Optimism', protocol: 'ether.fi Cash', label: 'ether.fi Cash', kind: 'supplied', valueUsd: 1200, assetValueUsd: 1200, debtValueUsd: 0, symbols: [],
        assets: [{ symbol: 'liquidUSD', quantity: '1180', valueUsd: 1200 }] },
    ],
  });
  const withWallet = (await snap()).dashboard.netWorth;
  await page.goto(APP + `/item/wallet/${walletId}`);
  await page.getByRole('link', { name: 'Where the borrowed money went' }).click();
  await page.getByRole('heading', { name: /^BACKED BY/ }).last().waitFor({ timeout: 10000 });
  body = await page.locator('body').innerText();
  // Health factor 2.4: the WBTC behind it can fall 58% before Aave sells it.
  check('a wallet borrowing shows how far it is from liquidation', body.includes('−58%') && body.includes('can fall before it’s sold') && body.includes('Safe for now · health 2.40') && /Bitcoin · now €[\d,]+\s*\n?\s*sold below €[\d,]+/.test(body), body.slice(0, 900).replace(/\n/g, ' | '));
  await wait(1800); // Let the arc finish drawing.
  await page.screenshot({ path: OUT + '/02a-liquidation-gauge-dark-390.png' });
  check('a wallet borrowing shows its collateral coins, what is owed and the sell point from the health factor', body.includes('Aave V3 · Ethereum') && body.includes('1,000 USDC owed') && body.includes('0.05 WBTC') && /33% · sold at 80%/.test(body), body.slice(0, 1400).replace(/\n/g, ' | '));
  await page.getByRole('button', { name: 'Pick where it went' }).click();
  check('the protocol’s own collateral is not offered as a place the money went', (await page.getByRole('button', { name: /^Link Aave V3 · Ethereum/ }).count()) === 0);
  await page.getByRole('button', { name: /^Link ether\.fi Cash · Optimism/ }).click();
  await page.getByText('What the money went into is worth').waitFor({ timeout: 10000 });
  body = await page.locator('body').innerText();
  check('the borrowing shows a gain once linked to where it went', /\n\+€\d+\.\d\d\n/.test(body), body.slice(0, 600));
  await page.screenshot({ path: OUT + '/02-wallet-borrowing-dark-390.png', fullPage: true });
  check('net worth still does not move', (await snap()).dashboard.netWorth === withWallet);

  // Desktop, light: the loans list on What you owe.
  const wide = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })).newPage();
  watchErrors(wide, errors);
  await wide.goto(APP + '/sign-in');
  await wide.getByLabel('Email').fill(EMAIL);
  await wide.getByLabel('Password').fill('Ledger-Harbor-47!');
  await wide.getByRole('button', { name: 'Sign in' }).click();
  await wide.getByText('What you own').first().waitFor({ timeout: 20000 });
  await wide.goto(APP + '/holdings/debts');
  await wide.getByText('DISTANCE TO LIQUIDATION').waitFor({ timeout: 20000 });
  let risk = await wide.locator('body').innerText();
  // Folded under what is owed, before the records: just the closest loan.
  check('What you owe opens by asset, with distance to liquidation folded after Owed in', risk.indexOf('OWED IN') < risk.indexOf('DISTANCE TO LIQUIDATION') && risk.indexOf('DISTANCE TO LIQUIDATION') < risk.indexOf('RECORDS') && /Closest: Aave V3 · Ethereum\s*\n\s*−58%/.test(risk) && !risk.includes('Frame · health 2.40'), risk.slice(0, 900).replace(/\n/g, ' | '));
  await wide.getByRole('button', { name: /^Distance to liquidation/ }).click();
  await wide.getByText('Frame · health 2.40').waitFor({ timeout: 10000 });
  risk = await wide.locator('body').innerText();
  check('opened, each loan shows its health and the price its coin is sold at', /Bitcoin · now €[\d,]+\s*\n?\s*sold below €[\d,]+/.test(risk), risk.slice(0, 900).replace(/\n/g, ' | '));
  await wide.screenshot({ path: OUT + '/03-liquidation-light-1440.png', fullPage: true });
  await wide.getByRole('tab', { name: 'By place' }).click();
  await wide.getByText('LOANS AND WHERE THE MONEY WENT').waitFor({ timeout: 20000 });
  await wait(800);
  const list = await wide.locator('body').innerText();
  check('the loans list says where each loan’s money went', list.includes('Frame · Went to ether.fi Cash · Optimism') && list.includes('Your record · Where it went: not set'), list.slice(0, 600));
  await wide.screenshot({ path: OUT + '/04-loans-light-1440.png', fullPage: true });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
