// Loan terms: simple interest worked out from the terms, a payment split into principal, interest and
// fees, unpaid interest added to the loan, and Undo for both. Net worth must move only by what changes
// the debt: never by interest that is merely accrued. The real server validators refuse bad input.
const { APP, CONVEX, PASSWORD, DAY, req, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');

const OUT = outDir('loan-terms');
const EMAIL = `qa-loan-terms-${Date.now()}@example.com`;
const { check, finish } = checker();

// The same month rule the app uses: whole months from the start date, a day kept or the last day of a shorter month.
const addMonths = (t, k) => {
  const d = new Date(t);
  const month = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes());
};
const completedMonths = (start, now) => { let n = 0; while (addMonths(start, n + 1) <= now) n += 1; return n; };
// Waits for a read to come true, so a check never races a write that is still on its way.
const until = async (read, ok, tries = 40) => { let v = await read(); for (let i = 0; i < tries && !ok(v); i++) { await wait(250); v = await read(); } return v; };
const money = (n) => '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  const { c, portfolioId, snap } = await client(EMAIL);
  const now = Date.now();
  const d = new Date(now);
  const started = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 4, 1, 12);
  const months = completedMonths(started, now);
  const monthly = Math.round((20000 * 0.08 * 100) / 12) / 100;
  const accrued = Math.round(monthly * months * 100) / 100;

  await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Studio savings', kind: 'cash', balance: 6000, currency: 'EUR' });
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Loan from Sam', kind: 'loan', balance: 20000, currency: 'EUR', counterparty: 'Sam' });
  const loan = async () => (await snap()).liabilities.find((l) => l.name === 'Loan from Sam');
  const net = async () => (await snap()).dashboard.netWorth;
  const id = (await loan()).id;
  const netBefore = await net();

  // The real validators refuse what makes no sense, before anything is saved.
  const refuses = async (name, run) => { let ok = false; try { await run(); } catch { ok = true; } check(name, ok); };
  await refuses('simple interest without an original amount is refused', () => c.mutation('liabilities:setTerms', { id, interestTerms: 'simple', interestRate: 8 }));
  await refuses('a yearly rate above 100 percent is refused', () => c.mutation('liabilities:setTerms', { id, principal: 20000, startedAt: started, interestTerms: 'simple', interestRate: 120 }));
  await refuses('a fixed loan without a repayment date is refused', () => c.mutation('liabilities:setTerms', { id, dueKind: 'fixed' }));
  check('refused terms change nothing', (await loan()).interestTerms === null && (await loan()).principal === null);

  const terms = { id, principal: 20000, startedAt: started, interestTerms: 'simple', interestRate: 8, dueKind: 'flexible', clientMutationId: `terms-${Date.now()}` };
  await c.mutation('liabilities:setTerms', terms);
  await c.mutation('liabilities:setTerms', terms);
  let l = await loan();
  check('terms save once per receipt and leave the balance alone', l.principal === 20000 && l.interestTerms === 'simple' && l.interestRate === 8 && l.dueKind === 'flexible' && l.balance === 20000);
  check('accrued interest never moves net worth', (await net()) === netBefore);

  await page.goto(APP + '/money-map');
  await page.getByRole('link', { name: /^Sam, / }).click();
  await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 15000 });
  let body = await page.locator('body').innerText();
  check('the terms card shows the simple rate and the principal still owed', body.includes('Loan from Sam · terms') && body.includes('8% a year, simple') && body.includes('Still owed (principal)'), body.slice(0, 500).replace(/\n/g, ' | '));
  check(`interest accrued for ${months} completed months is ${money(accrued)}`, body.includes(money(accrued)), body.slice(0, 900).replace(/\n/g, ' | '));
  check('the card says accrued interest is not counted in what you owe', body.includes('not counted in What you owe'));
  await page.screenshot({ path: OUT + '/01-terms-dark-390.png', fullPage: true });

  // A split payment: only the principal part lowers the debt.
  await page.getByRole('button', { name: 'Record a payment' }).click();
  await page.getByLabel('Amount in EUR').fill('1000');
  await page.getByRole('switch', { name: /Split into principal/ }).click();
  await page.getByLabel('Interest', { exact: true }).fill('150');
  await page.getByLabel('Fees', { exact: true }).fill('50');
  body = await page.locator('body').innerText();
  check('the rest of the payment becomes the principal', body.includes('Principal (empty: the rest, €800)'), body.slice(0, 800).replace(/\n/g, ' | '));
  await page.getByLabel(/^Principal/).fill('900');
  body = await page.locator('body').innerText();
  check('parts that do not add up are named and cannot be saved', /more than the payment/.test(body) && (await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()));
  await page.getByLabel(/^Principal/).fill('');
  await page.getByLabel(/^When/).fill('today');
  await page.screenshot({ path: OUT + '/02-split-dark-390.png', fullPage: true });
  // A double tap on Save must record the payment once, not twice.
  await page.getByRole('button', { name: 'Save', exact: true }).dblclick();
  await page.getByText('Paid back €1,000').first().waitFor({ timeout: 15000 });
  await wait(1500);
  body = await page.locator('body').innerText();
  check('the history shows the split', body.includes('Principal €800 · Interest €150 · Fees €50'), body.slice(0, 900).replace(/\n/g, ' | '));
  l = await loan();
  check('a double tap on Save recorded one payment', (await c.query('debtEvents:listForPortfolio', { portfolioId })).filter((e) => e.kind === 'repaid').length === 1);
  check('only the principal part lowered the debt, once', l.balance === 19200);
  check('net worth moved by exactly the principal paid', (await net()) === netBefore + 800);

  // Undo gives back the principal only.
  await page.getByRole('button', { name: /^Remove Paid back/ }).click();
  l = await until(loan, (x) => x.balance === 20000);
  check('removing a split payment gives back the principal part only', l.balance === 20000 && (await net()) === netBefore);

  // Interest added to the loan: the debt grows and that interest counts as settled.
  await page.getByRole('button', { name: 'Record a payment' }).click();
  await page.getByRole('radio', { name: 'Interest added' }).click();
  await page.getByRole('button', { name: /^Use €/ }).click();
  await page.getByLabel(/^When/).fill('today');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/^Interest added €/).first().waitFor({ timeout: 15000 });
  l = await loan();
  check('interest added to the loan raises the principal by the interest owed', Math.abs(l.balance - (20000 + accrued)) < 0.005, String(l.balance));
  body = await page.locator('body').innerText();
  check('that interest is then settled, not owed twice', body.includes('Interest owed') && body.includes(money(0)), body.slice(0, 1000).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/03-capitalized-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: /^Remove Interest added/ }).click();
  check('Undo takes the added interest off again', (await until(loan, (x) => x.balance === 20000)).balance === 20000);

  // Interest can be added only to a loan whose terms say how it accrues.
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Card', kind: 'credit_card', balance: 400, currency: 'EUR' });
  const card = (await snap()).liabilities.find((x) => x.name === 'Card');
  await refuses('interest cannot be added to a debt without terms', () => c.mutation('debtEvents:add', { portfolioId, subject: `liability:${card.id}`, kind: 'capitalized', amount: 10, unit: 'EUR', occurredAt: now - 3600_000, apply: true }));
  await refuses('simple interest cannot be set on a card', () => c.mutation('liabilities:setTerms', { id: card.id, principal: 400, startedAt: started, interestTerms: 'simple', interestRate: 20 }));
  check('the card was left alone', (await snap()).liabilities.find((x) => x.name === 'Card').balance === 400);

  // Amounts are kept to cents on the server, so Undo gives back exactly what was taken.
  const rounded = await c.mutation('debtEvents:add', { portfolioId, subject: `liability:${id}`, kind: 'repaid', amount: 12.345, unit: 'EUR', occurredAt: now - 3600_000, apply: true });
  check('an amount is kept to cents', (await c.query('debtEvents:listForPortfolio', { portfolioId })).find((e) => e.id === rounded.id).amount === 12.35 && (await loan()).balance === 19987.65);
  await c.mutation('debtEvents:remove', { id: rounded.id });
  check('Undo of a rounded amount gives back exactly what was taken', (await loan()).balance === 20000);
  await refuses('a unit that is not the loan\'s is refused even for an interest-only payment', () => c.mutation('debtEvents:add', { portfolioId, subject: `liability:${id}`, kind: 'repaid', amount: 50, unit: 'BTC', interestPart: 50, occurredAt: now - 3600_000, apply: true }));

  // What the real server refuses for payments.
  const base = { portfolioId, subject: `liability:${id}`, unit: 'EUR', occurredAt: now - 3600_000, apply: true };
  await refuses('a split that does not add up is refused', () => c.mutation('debtEvents:add', { ...base, kind: 'repaid', amount: 1000, principalPart: 800, interestPart: 100 }));
  await refuses('a negative part is refused', () => c.mutation('debtEvents:add', { ...base, kind: 'repaid', amount: 1000, principalPart: 1100, interestPart: -100 }));
  await refuses('a split on a borrowing is refused', () => c.mutation('debtEvents:add', { ...base, kind: 'borrowed', amount: 1000, principalPart: 1000 }));
  const cap = { ...base, kind: 'capitalized', amount: 133.33, clientMutationId: `cap-${Date.now()}` };
  await c.mutation('debtEvents:add', cap);
  await c.mutation('debtEvents:add', cap);
  check('adding interest twice with one receipt counts once', (await loan()).balance === 20133.33);
  const events = await c.query('debtEvents:listForPortfolio', { portfolioId });
  check('only one event was kept', events.filter((e) => e.kind === 'capitalized').length === 1);

  // The server caps interest added at the interest owed, so no phone or call can add more than that.
  await refuses('adding far more interest than is owed is refused', () => c.mutation('debtEvents:add', { ...base, kind: 'capitalized', amount: 5000 }));
  await refuses('adding three times the interest accrued is refused', () => c.mutation('debtEvents:add', { ...base, kind: 'capitalized', amount: Math.round(accrued * 3 * 100) / 100 }));
  check('the refused adds changed nothing', (await loan()).balance === 20133.33 && (await c.query('debtEvents:listForPortfolio', { portfolioId })).filter((e) => e.kind === 'capitalized').length === 1);

  // Editing the terms from the screen.
  // Changing the rate recalculates past months, so the screen shows the difference first and asks.
  await page.getByRole('button', { name: 'Edit terms' }).click();
  await page.getByLabel('Yearly rate in percent').fill('10');
  await page.getByRole('button', { name: 'Save terms' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).waitFor({ timeout: 15000 });
  body = await page.locator('body').innerText();
  check('the screen shows how much past interest changes before saving', /recalculates the interest for months that have already passed: accrued so far goes from €[\d,.]+ to €[\d,.]+/.test(body), body.slice(-900).replace(/\n/g, ' | '));
  check('nothing is saved until you confirm', (await loan()).interestRate === 8);
  await page.screenshot({ path: OUT + '/04-confirm-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await page.getByText('Terms saved').waitFor({ timeout: 15000 });
  check('the rate saved from the screen after confirming', (await until(loan, (x) => x.interestRate === 10)).interestRate === 10);
  await page.getByText('Rate changed from 8% to 10%').waitFor({ timeout: 15000 });
  const afterEdit = await c.query('debtEvents:listForPortfolio', { portfolioId });
  check('the change left a note in the history, with no amount and no change to the balance', afterEdit.some((e) => e.kind === 'note' && e.note === 'Rate changed from 8% to 10%' && e.amount === null && e.applied === false) && (await loan()).balance === 20133.33);

  // An update from Ask that does not mention the rate keeps the terms.
  await c.mutation('mobile:upsertLiability', { id, portfolioId, name: 'Loan from Sam', kind: 'loan', balance: 20000, currency: 'EUR', counterparty: 'Sam' });
  l = await loan();
  check('an update that leaves the rate out keeps the terms', l.interestRate === 10 && l.interestTerms === 'simple' && l.principal === 20000);

  // The day interest is due by: it changes when to pay, never a figure.
  await refuses('a due day of 29 is refused', () => c.mutation('liabilities:setTerms', { id, interestDueDay: 29 }));
  await c.mutation('liabilities:setTerms', { id, interestDueDay: 10 });
  check('the due day saved', (await loan()).interestDueDay === 10);
  await page.reload();
  await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 15000 });
  body = await page.locator('body').innerText();
  check('the card shows when interest is due, and the running month as an estimate', /Interest overdue since|Next interest due/.test(body) && body.includes('Running month so far (estimate)'), body.slice(0, 900).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/05-due-day-dark-390.png', fullPage: true });
  await c.mutation('liabilities:setTerms', { id, interestTerms: 'manual' });
  check('leaving simple interest takes the due day away', (await loan()).interestDueDay === null);
  await refuses('a due day on interest that is not simple is refused', () => c.mutation('liabilities:setTerms', { id, interestDueDay: 10 }));
  await c.mutation('liabilities:setTerms', { id, interestTerms: 'simple', interestRate: 10 });

  // A fixed loan keeps its repayment date when an update leaves it out.
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Fixed loan', kind: 'loan', balance: 3000, currency: 'EUR', dueDate: now + 60 * DAY });
  const fixed = (await snap()).liabilities.find((x) => x.name === 'Fixed loan');
  await c.mutation('liabilities:setTerms', { id: fixed.id, dueKind: 'fixed' });
  await c.mutation('mobile:upsertLiability', { id: fixed.id, portfolioId, name: 'Fixed loan', kind: 'loan', balance: 2500, currency: 'EUR' });
  const keptFixed = (await snap()).liabilities.find((x) => x.name === 'Fixed loan');
  check('a fixed loan keeps its date when an update leaves it out', keptFixed.dueKind === 'fixed' && keptFixed.dueDate === fixed.dueDate && keptFixed.balance === 2500);

  // An update that says the date is cleared clears it, and a fixed loan is then no longer fixed.
  await c.mutation('mobile:upsertLiability', { id: fixed.id, portfolioId, name: 'Fixed loan', kind: 'loan', balance: 2500, currency: 'EUR', dueDate: null });
  const clearedFixed = (await snap()).liabilities.find((x) => x.name === 'Fixed loan');
  check('an update that clears the date takes the fixed date and kind away', clearedFixed.dueDate === null && clearedFixed.dueKind === null && clearedFixed.balance === 2500);

  // A loan from before loan terms existed: it has a rate and a date but no terms. The form shows them as
  // simple interest and a fixed date, and saving writes that, so the card agrees with the form.
  const lenaDate = now + 60 * DAY;
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Old loan from Lena', kind: 'loan', balance: 3000, currency: 'EUR', counterparty: 'Lena', interestRate: 8, dueDate: lenaDate });
  const legacy = async () => (await snap()).liabilities.find((x) => x.name === 'Old loan from Lena');
  check('the old loan has a rate and a date and no terms', (await legacy()).interestRate === 8 && (await legacy()).interestTerms === null && (await legacy()).dueKind === null);
  await page.goto(APP + '/money-map');
  await page.getByRole('link', { name: /^Lena, / }).click();
  await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Set loan terms' }).click();
  await page.getByLabel('Original amount in EUR').fill('3000');
  await page.getByLabel(/^Started/).fill(new Date(started).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Save terms' }).click();
  await page.getByText('Terms saved').waitFor({ timeout: 15000 });
  const lena = await until(legacy, (x) => x.interestTerms === 'simple');
  check('saving wrote simple interest and a fixed date, kept the rate, and left the date as it was', lena.interestTerms === 'simple' && lena.dueKind === 'fixed' && lena.interestRate === 8 && lena.dueDate === lenaDate && lena.principal === 3000, JSON.stringify(lena));
  body = await page.locator('body').innerText();
  check('the card then shows the rate and works the interest out', body.includes('8% a year, simple') && body.includes('Interest accrued') && !body.includes('Not set'), body.slice(0, 900).replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/06-old-loan-dark-390.png', fullPage: true });

  // Repayment "Not set" takes the date away with it.
  await page.getByRole('button', { name: 'Edit terms' }).click();
  await page.getByRole('radiogroup', { name: 'Repayment' }).getByRole('radio', { name: 'Not set' }).click();
  await page.getByRole('button', { name: 'Save terms' }).click();
  await page.getByText('Terms saved').waitFor({ timeout: 15000 });
  const lenaOpen = await until(legacy, (x) => x.dueKind === null);
  check('setting the repayment to Not set cleared the kind and the date', lenaOpen.dueKind === null && lenaOpen.dueDate === null && lenaOpen.interestTerms === 'simple', JSON.stringify(lenaOpen));
  body = await page.locator('body').innerText();
  check('the card no longer shows a repayment date', !body.includes('Repay by'), body.slice(0, 900).replace(/\n/g, ' | '));

  // A viewer or another person cannot set terms: a new account is a different owner.
  const other = new ConvexHttpClient(CONVEX);
  const joined = await other.action('auth:signIn', { provider: 'password', params: { email: `qa-loan-other-${Date.now()}@example.com`, password: PASSWORD, flow: 'signUp' } });
  other.setAuth(joined.tokens.token);
  await other.mutation('mobile:bootstrap', {});
  await refuses('another account cannot change these terms', () => other.mutation('liabilities:setTerms', { id, interestTerms: 'none' }));
  check('their refused attempt changed nothing', (await loan()).interestTerms === 'simple');

  const filtered = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', filtered.length === 0, filtered.slice(0, 4).join(' | '));
  await wait(200);
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
