// Claude-powered Ask, against a stand-in for the Anthropic API so no key or money is used.
// The local backend is pointed at the stand-in for this journey only, then put back.
const http = require('http');
const { execFileSync } = require('child_process');
const { ROOT, APP, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');

const OUT = outDir('ask-claude');
const EMAIL = `qa-claude-${Date.now()}@example.com`;
const PORT = 5198;
const { check, finish } = checker();
const env = (...args) => execFileSync('npx', ['convex', 'env', ...args], { cwd: ROOT, stdio: 'pipe' });

const requests = [];
const yesterday = (() => { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const tool = (id, input) => ({ type: 'tool_use', id, name: 'propose_entry', input: { kind: 'expense', name: '', amount: null, currency: null, date: null, category: null, asset_kind: null, debt_kind: null, holding_kind: null, symbol: null, quantity: null, holding_mode: null, ...input } });
const message = (content, stop) => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });

const server = http.createServer((rq, rs) => {
  let raw = '';
  rq.on('data', (d) => { raw += d; });
  rq.on('end', () => {
    const body = JSON.parse(raw || '{}');
    requests.push({ headers: rq.headers, body, raw });
    const last = String(body.messages?.at(-1)?.content ?? '');
    const system = (body.system ?? []).map((b) => b.text).join('\n');
    const send = (status, json) => { rs.writeHead(status, { 'content-type': 'application/json' }); rs.end(JSON.stringify(json)); };
    if (/afford/i.test(last)) return send(200, message([{ type: 'text', text: system.includes('- Main account (cash): €4,321') ? 'You have €4,321 in Main account, so a €2,000 trip would leave €2,321.' : 'No numbers arrived.' }], 'end_turn'));
    if (/dinner/i.test(last)) return send(200, message([
      { type: 'text', text: 'I drafted both. Check them and press Save.' },
      tool('t1', { kind: 'expense', name: 'Dinner with Ana', amount: 60, date: yesterday, category: 'Dining' }),
      tool('t2', { kind: 'debt', name: 'Visa', amount: 800, debt_kind: 'credit_card' }),
    ], 'tool_use'));
    if (/refuse/i.test(last)) return send(200, message([], 'refusal'));
    if (/overload/i.test(last)) return send(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    return send(200, message([{ type: 'text', text: 'OK.' }], 'end_turn'));
  });
});

async function ask(page, text) {
  await page.getByLabel('Ask or add anything').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('Thinking…').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  await wait(300);
}

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  env('set', 'ANTHROPIC_API_KEY', 'test-key-not-real');
  env('set', 'ANTHROPIC_BASE_URL', `http://127.0.0.1:${PORT}`);
  await wait(1500);
  const browser = await launch();
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
    watchErrors(page, errors);
    await signUp(page, APP, EMAIL);
    const { c, portfolioId, snap } = await client(EMAIL);
    await c.mutation('mobile:upsertAsset', { portfolioId, name: 'Main account', kind: 'cash', balance: 4321, currency: 'EUR', clientMutationId: `qa.asset:${Date.now()}` });

    await page.getByRole('button', { name: 'Ask or add' }).click();
    await page.getByText('What your phone can’t answer goes to Claude').waitFor({ timeout: 10000 });
    check('Ask says what goes to Claude', true);

    await ask(page, 'What’s my net worth?');
    check('questions the device can answer stay on the device', requests.length === 0 && (await page.locator('body').innerText()).includes('Net worth is'));

    await ask(page, 'Can I afford a €2,000 trip in December?');
    check('an open question is answered from the person’s numbers', (await page.locator('body').innerText()).includes('You have €4,321 in Main account'));
    const first = requests[0];
    check('the request asks for the right model, fallbacks and a strict tool',
      first?.body.model === 'claude-opus-5-5' && first.body.fallbacks === 'default' && String(first.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01')
      && first.body.tools?.[0]?.strict === true && first.body.tool_choice?.type === 'auto' && first.body.output_config?.effort === 'low',
      JSON.stringify({ model: first?.body.model, beta: first?.headers['anthropic-beta'], fallbacks: first?.body.fallbacks }));
    check('the context has no email and no record ids', !first.raw.includes(EMAIL) && !first.raw.includes(portfolioId));

    await ask(page, 'Had dinner with Ana yesterday for 60, and my Visa is at 800 now');
    const second = requests[1];
    const roles = (second?.body.messages ?? []).map((m) => m.role).join(',');
    check('earlier turns, including answers from the device, go along as history', roles === 'user,assistant,user,assistant,user'
      && String(second.body.messages[1].content).startsWith('Net worth is') && /dinner/i.test(second.body.messages[4].content), roles);
    const cards = page.getByLabel(/^Draft\./);
    const dinner = cards.filter({ hasText: 'Dinner with Ana' });
    const visa = cards.filter({ hasText: 'Visa' });
    const dinnerText = await dinner.innerText().catch(() => '');
    check('proposals arrive as drafts to confirm', dinnerText.includes('−€60.00') && /Dining/.test(dinnerText) && await visa.count() === 1, dinnerText.replace(/\n/g, ' | '));
    check('nothing is saved before Save', (await snap()).transactions.length === 0 && (await snap()).liabilities.length === 0);
    await page.screenshot({ path: OUT + '/01-claude-drafts-dark-390.png', fullPage: true });
    await dinner.getByRole('button', { name: 'Save' }).click();
    await dinner.getByText('SAVED', { exact: true }).waitFor({ timeout: 10000 });
    await visa.getByRole('button', { name: 'Discard' }).click();
    const s = await snap();
    const tx = s.transactions[0];
    const when = new Date(tx?.occurredAt ?? 0);
    check('Save writes the drafted spend, dated yesterday, and nothing else', s.transactions.length === 1 && tx.description === 'Dinner with Ana' && tx.amount === 60 && tx.kind === 'expense'
      && `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}` === yesterday && s.liabilities.length === 0,
      JSON.stringify({ n: s.transactions.length, tx: tx && { d: tx.description, a: tx.amount, at: tx.occurredAt }, debts: s.liabilities.length }));

    await ask(page, 'please refuse this');
    check('a declined request gets a plain reply', (await page.locator('body').innerText()).includes('I can’t help with that one.'));
    await ask(page, 'overload please');
    check('an overloaded provider says try again', (await page.locator('body').innerText()).includes('The assistant is busy.'));

    // Demo never calls Claude.
    const before = requests.length;
    const d = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    watchErrors(d, errors);
    await d.goto(APP + '/sign-in');
    const demoBtn = d.getByRole('button', { name: /demo/i }).first();
    await demoBtn.click();
    await d.goto(APP + '/ask');
    await d.getByLabel('Ask or add anything').fill('Can I afford a trip?');
    await d.getByRole('button', { name: 'Send' }).click();
    await wait(1200);
    const demoText = await d.locator('body').innerText();
    check('demo answers on the device and never calls Claude', requests.length === before && !demoText.includes('goes to Claude') && demoText.includes('I can add money and answer questions'));
  } finally {
    await browser.close();
    env('remove', 'ANTHROPIC_BASE_URL');
    env('remove', 'ANTHROPIC_API_KEY');
    server.close();
  }
  const unexpected = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); try { env('remove', 'ANTHROPIC_BASE_URL'); env('remove', 'ANTHROPIC_API_KEY'); } catch {} process.exit(2); });
