const assert = require('node:assert/strict');
const { APP, launch, signUp, client, checker, outDir } = require('./lib.cjs');
const { check, finish } = checker();
const OUT = outDir('navigation-undo');
(async () => {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  try {
    const email = `qa-navigation-${Date.now()}@example.com`;
    await signUp(page, APP, email);
    const { c, portfolioId, snap } = await client(email);
    const now = new Date(), dueDate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const terms = { portfolioId, name: 'Synthetic undo loan', kind: 'loan', currency: 'EUR', balance: 1000, principal: 1000, interestTerms: 'simple', interestRate: 8, startedAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1), dueKind: 'fixed', dueDate };
    const added = await c.mutation('mobile:upsertLiability', terms);
    const loanId = typeof added === 'string' ? added : added.id;
    await page.goto(APP + '/item/liability/' + loanId);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click({ timeout: 6000 });
    await page.waitForTimeout(700);
    const restored = (await snap()).liabilities.find(l => l.name === terms.name);
    check('loan Delete -> route unmount -> root-toast Undo restores principal, rate, start and repayment terms', !!restored && ['principal', 'interestRate', 'startedAt', 'dueKind', 'dueDate'].every(k => restored[k] === terms[k]));
    const made = await c.mutation('mobile:createTransaction', { portfolioId, kind: 'expense', amount: 4.5, currency: 'EUR', description: 'Synthetic undo expense', occurredAt: Date.now() });
    const txId = typeof made === 'string' ? made : made.id;
    await page.goto(APP + '/tx/' + txId);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click({ timeout: 6000 });
    await page.waitForTimeout(700);
    const tx = (await snap()).transactions.filter(t => t.description === 'Synthetic undo expense');
    check('transaction Delete -> route unmount -> root-toast Undo restores exactly one correct transaction', tx.length === 1 && tx[0].amountMinor === Math.round(4.5 * 100));
    await page.screenshot({ path: OUT + '/restored-390.png', fullPage: true });
    assert.equal(finish(), 0);
  } catch (error) {
    await page.screenshot({ path: OUT + '/failure-390.png', fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error('JOURNEY CRASH', error); process.exitCode = 2; });
