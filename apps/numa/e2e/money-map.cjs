// Money map: who you owe, who owes you and where your money sits, a person with several debts,
// recording a payment that lowers the debt and keeps its history, removing it, and adding a debt.
const { APP, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');

const OUT = outDir('money-map');
const EMAIL = `qa-money-map-${Date.now()}@example.com`;
const { check, finish } = checker();

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId, snap } = await client(EMAIL);
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Studio savings', kind: 'cash', balance: 6000, currency: 'EUR' });
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Loan to the company', kind: 'other', balance: 50000, currency: 'EUR', owedBy: 'XCHAINGER' });
  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Car', kind: 'vehicle', balance: 29000, currency: 'EUR' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Stas, held in euros', kind: 'other', balance: 19670, currency: 'EUR', counterparty: 'Stas' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Stas, second loan', kind: 'other', balance: 5000, currency: 'EUR', counterparty: 'stas' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Card', kind: 'credit_card', balance: 400, currency: 'EUR' });
  const debt = async (name) => (await snap()).liabilities.find((l) => l.name === name);
  const before = (await snap()).dashboard.netWorth;

  await page.goto(APP + '/');
  await page.getByRole('link', { name: /^Money map\./ }).waitFor({ timeout: 20000 });
  check('Home shows who owes whom at a glance', /Owed to you €50,000, you owe €25,070/.test(await page.getByRole('link', { name: /^Money map\./ }).getAttribute('aria-label')));
  await page.getByRole('link', { name: /^Money map\./ }).click();
  await page.getByText('What’s left after every debt is paid').waitFor({ timeout: 10000 });
  let body = await page.locator('body').innerText();
  check('the map answers with net worth, reached the other way round', body.includes('€59,930.00'), body.slice(0, 300).replace(/\n/g, ' | '));
  check('Stas is one row for two debts, and XCHAINGER owes you', /Stas\s*\n\s*2 debts · EUR\s*\n\s*€24,670/.test(body) && /XCHAINGER\s*\n\s*Loan to the company\s*\n\s*€50,000/.test(body), body.slice(0, 900).replace(/\n/g, ' | '));
  check('your own money sits apart from money lent out', /Where it sits[\s\S]*Things[\s\S]*Car/.test(body) && !/Where it sits[\s\S]*Loan to the company/.test(body));
  await page.screenshot({ path: OUT + '/01-map-dark-390.png', fullPage: true });

  await page.getByRole('link', { name: /^Stas, / }).click();
  await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Record a payment' }).click();
  await page.getByRole('radio', { name: '€19,670' }).click();
  await page.getByLabel('Amount in EUR').fill('5,000');
  await page.getByLabel(/^When/).fill('20 Sep');
  await page.getByLabel(/^Note/).fill('Paid to Liza via Zen');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Paid back €5,000').waitFor({ timeout: 10000 });
  body = await page.locator('body').innerText();
  check('a payment lowers the debt and stays in the history with its note', (await debt('Stas, held in euros')).balance === 14670 && body.includes('Paid to Liza via Zen') && body.includes('€19,670.00'), body.slice(0, 700).replace(/\n/g, ' | '));
  check('net worth moves by exactly the payment', (await snap()).dashboard.netWorth === before + 5000);

  await page.getByRole('button', { name: 'Record a payment' }).click();
  await page.getByRole('radio', { name: 'Note' }).click();
  await page.getByLabel(/^Note/).fill('Agreed to pay the rest in December');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Agreed to pay the rest in December').waitFor({ timeout: 10000 });
  check('a note joins the history without touching the debt', (await debt('Stas, held in euros')).balance === 14670);
  await page.screenshot({ path: OUT + '/02-person-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: /^Remove Paid back/ }).click();
  await page.getByText('Removed, and the amount is back on the debt').waitFor({ timeout: 10000 });
  check('removing a payment gives the amount back', (await debt('Stas, held in euros')).balance === 19670);

  await page.getByRole('button', { name: 'Add a debt' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('3 debts · EUR').last().waitFor({ timeout: 10000 });
  const added = (await snap()).liabilities.filter((l) => l.counterparty && l.counterparty.toLowerCase() === 'stas');
  check('a new debt to the same person joins their row', added.length === 3);

  // Money owed to you comes back the same way.
  await page.goto(APP + '/money-map');
  await page.getByRole('link', { name: /^XCHAINGER, / }).click();
  await page.getByRole('button', { name: 'Record money back' }).click();
  await page.getByLabel('Amount in EUR').fill('1000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Got back €1,000').last().waitFor({ timeout: 10000 });
  check('money received lowers what you are owed', (await snap()).assets.find((a) => a.name === 'Loan to the company').balance === 49000);

  // Who a debt is with can be set when editing it.
  await page.goto(APP + '/money-map');
  await page.getByRole('link', { name: /^Card, / }).click();
  await page.getByRole('link', { name: /^Card$|^€400, Card/ }).first().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel(/^Owed to/).fill('Revolut');
  await page.getByRole('button', { name: /^Save/ }).click();
  await wait(1000);
  check('editing a debt sets who it is with', (await debt('Card')).counterparty === 'Revolut');

  const wide = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })).newPage();
  watchErrors(wide, errors);
  await wide.goto(APP + '/sign-in');
  await wide.getByLabel('Email').fill(EMAIL);
  await wide.getByLabel('Password').fill('Ledger-Harbor-47!');
  await wide.getByRole('button', { name: 'Sign in' }).click();
  await wide.getByText('What you own').first().waitFor({ timeout: 20000 });
  await wide.goto(APP + '/money-map');
  await wide.getByText('What’s left after every debt is paid').waitFor({ timeout: 20000 });
  await wait(800);
  check('the map lists Revolut as its own party', (await wide.locator('body').innerText()).includes('Revolut'));
  await wide.screenshot({ path: OUT + '/03-map-light-1440.png', fullPage: true });

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
