// Connected agents: Settings makes one link, an MCP client uses it to read and change the account as
// the user, a read-only link can't write, retries don't duplicate, activity shows up in Settings, and
// disconnecting cuts the agent off at once.
const { APP, outDir, launch, watchErrors, signUp, client, checker, wait } = require('./lib.cjs');
const OUT = outDir('agent');
const EMAIL = `qa-agent-${Date.now()}@example.com`;
const { check, finish } = checker();

let rpcId = 0;
async function rpc(url, method, params, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const call = async (url, name, args, headers) => (await rpc(url, 'tools/call', { name, arguments: args }, headers)).body;
const data = (reply) => reply?.result?.structuredContent;

async function makeLink(page, name, readOnly) {
  await page.getByRole('button', { name: /^Connect an agent/ }).click();
  await page.getByLabel('Agent name').fill(name);
  if (readOnly) await page.getByRole('radio', { name: 'Read only' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  await page.getByText(`Paste this into ${name}`).waitFor({ timeout: 15000 });
  const text = await page.getByLabel('Agent link ready').innerText();
  return text.match(/https?:\/\/\S+\/mcp\/numa_agent_[0-9a-f]{64}/)[0];
}

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
  watchErrors(page, errors);
  await signUp(page, APP, EMAIL);
  await page.goto(APP + '/settings');
  await page.getByText('AI AGENTS').waitFor({ timeout: 15000 });

  const link = await makeLink(page, 'Claude', false);
  await page.screenshot({ path: OUT + '/01-link-dark-390.png', fullPage: true });
  check('Settings makes one secret link for the agent, with how to add it', /claude mcp add --transport http numa-pro/.test(await page.getByLabel('Agent link ready').innerText()));

  const init = await rpc(link, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qa', version: '1' } });
  check('the agent connects over MCP with instructions', init.status === 200 && init.body.result.serverInfo.name === 'numa-pro' && /get_overview/.test(init.body.result.instructions));
  check('a notification gets an empty 202', (await fetch(link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status === 202);
  const tools = (await rpc(link, 'tools/list', {})).body.result.tools.map((t) => t.name);
  check('a full link offers reading and changing tools', tools.includes('get_overview') && tools.includes('add_transaction') && tools.includes('delete_holding'), tools.length + ' tools');

  const added = await call(link, 'add_transaction', { kind: 'expense', amount: 24, description: 'Lunch with agent', request_id: 'qa-lunch-1' });
  check('the agent adds spending to the account', !added.result.isError, JSON.stringify(added.result.content[0].text).slice(0, 160));
  const again = await call(link, 'add_transaction', { kind: 'expense', amount: 24, description: 'Lunch with agent', request_id: 'qa-lunch-1' });
  const { c, snap } = await client(EMAIL);
  const lunches = (await snap()).transactions.filter((t) => t.description === 'Lunch with agent');
  check('a retried call with the same request id saves once', !again.result.isError && lunches.length === 1 && lunches[0].amount === 24);
  check('it is saved as the user, in the space currency', lunches[0]?.currency === 'EUR');

  const holding = data(await call(link, 'save_holding', { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, cost_basis: 20000 }));
  const overview = data(await call(link, 'get_overview', {}));
  check('the overview shows totals and what was just added', overview?.counts?.holdings === 1 && overview?.counts?.transactions === 1 && typeof overview?.totals?.net_worth === 'number', JSON.stringify(overview?.totals));
  const listed = data(await call(link, 'list_transactions', { from: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }));
  check('transactions can be listed by date', listed?.transactions?.some((t) => t.description === 'Lunch with agent'));
  const bad = await call(link, 'add_transaction', { kind: 'gift', amount: 5, description: 'x' });
  check('bad input comes back as a tool error the agent can read', bad.result.isError && /kind must be one of/.test(bad.result.content[0].text));
  const del = await call(link, 'delete_holding', { id: holding?.id });
  check('the agent can delete what it is told to', !del.result.isError && (await snap()).holdings.length === 0);

  const bearer = link.replace(/\/numa_agent_.*/, '');
  const secret = link.match(/numa_agent_[0-9a-f]{64}/)[0];
  const viaHeader = await rpc(bearer, 'tools/call', { name: 'list_spaces', arguments: {} }, { authorization: `Bearer ${secret}` });
  check('the secret also works as a bearer header on /mcp', viaHeader.status === 200 && !viaHeader.body.result.isError);

  await page.getByRole('button', { name: 'Done' }).click();
  const readLink = await makeLink(page, 'Reader', true);
  const readTools = (await rpc(readLink, 'tools/list', {})).body.result.tools.map((t) => t.name);
  const refused = await call(readLink, 'add_transaction', { kind: 'expense', amount: 1, description: 'nope' });
  check('a read-only link can read but not change anything', readTools.length === 5 && !readTools.includes('add_transaction') && refused.error && /only read/.test(refused.error.message));
  await page.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await page.getByText('Recent agent activity').waitFor({ timeout: 15000 });
  const settingsText = await page.locator('body').innerText();
  check('Settings lists both agents and what they did', /Claude/.test(settingsText) && /Reader/.test(settingsText) && /Can only read/.test(settingsText) && /Added a transaction|Deleted a holding|Read the overview/.test(settingsText));
  await page.screenshot({ path: OUT + '/02-agents-dark-390.png', fullPage: true });

  await page.getByRole('button', { name: 'Disconnect Claude' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByText('Claude disconnected').waitFor({ timeout: 15000 });
  const after = await rpc(link, 'tools/call', { name: 'get_overview', arguments: {} });
  check('a disconnected agent is refused at once', after.status === 401 && /disconnected/.test(after.body.error.message));
  const forged = await rpc(bearer + '/numa_agent_' + '0'.repeat(64), 'tools/list', {});
  check('a made-up link is refused', forged.status === 401);
  const stillRead = await rpc(readLink, 'tools/list', {});
  check('other agents keep working', stillRead.status === 200);

  const unexpected = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  check('no page or console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  void c;
  await browser.close();
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
