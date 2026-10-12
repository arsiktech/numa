// Phone alerts on the backend: registering a phone, and which alerts a person would get now.
// Sending goes to Expo's push service, so it is covered by unit tests rather than called here.
const { execFileSync } = require('child_process');
const { ROOT, CONVEX, req, checker, PASSWORD } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');

const EMAIL = `qa-push-${Date.now()}@example.com`;
const TOKEN = `ExponentPushToken[qa${Date.now()}xxxxxxxxxx]`;
const DAY = 86400000;
const { check, finish } = checker();
const run = (fn, args) => JSON.parse(execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], { cwd: ROOT, stdio: 'pipe' }).toString());

(async () => {
  const c = new ConvexHttpClient(CONVEX);
  const r = await c.action('auth:signIn', { provider: 'password', params: { email: EMAIL, password: PASSWORD, flow: 'signUp' } });
  c.setAuth(r.tokens.token);
  const portfolioId = (await c.mutation('mobile:bootstrap', {})).selectedPortfolioId;
  const now = Date.now();
  const id = (x) => (typeof x === 'string' ? x : x.id);
  const visa = id(await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Visa', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: now + 2 * DAY, clientMutationId: `qa.l:${now}` }));
  await c.mutation('mobile:upsertLiability', { portfolioId, name: 'Loan', kind: 'loan', balance: 9000, currency: 'EUR', dueDate: now + 20 * DAY, clientMutationId: `qa.l2:${now}` });
  const snap = await c.query('mobile:portfolioSnapshot', { portfolioId });
  const dining = snap.categories.find((x) => x.kind === 'expense');
  await c.mutation('categories:update', { id: dining.id, patch: { monthlyLimit: 100 }, clientMutationId: `qa.c:${now}` });
  await c.mutation('mobile:createTransaction', { portfolioId, occurredAt: now - 60000, description: 'Dinner', categoryId: dining.id, kind: 'expense', amount: 90, currency: 'EUR', clientMutationId: `qa.t:${now}` });

  let refused = false;
  try { await c.mutation('pushAlerts:registerDevice', { token: 'https://example.com/not-a-token', platform: 'ios', timeZone: 'UTC' }); } catch { refused = true; }
  check('only Expo push tokens are accepted', refused);
  await c.mutation('pushAlerts:registerDevice', { token: TOKEN, platform: 'ios', timeZone: 'Europe/Madrid' });
  check('a phone registers for alerts', await c.query('pushAlerts:deviceRegistered', { token: TOKEN }) === true);

  // Convex Auth tokens name the user as "userId|sessionId".
  const userId = JSON.parse(Buffer.from(r.tokens.token.split('.')[1], 'base64url').toString()).sub.split('|')[0];
  const plan = run('pushAlerts:plan', { userId, timeZone: 'Europe/Madrid', now });
  const titles = plan.alerts.map((a) => a.title);
  check('a debt due in two days and a limit at 90% are raised; a debt due in 20 days is not',
    titles.some((t) => /^Visa is due /.test(t)) && titles.includes(`${dining.name} is at 90% of its limit`) && !titles.some((t) => t.startsWith('Loan')) && plan.alerts.find((a) => a.title.startsWith('Visa')).url === `/item/liability/${visa}`,
    JSON.stringify(titles));
  check('nothing has been sent yet', plan.sentToday === 0 && plan.sentKeys.length === 0);

  await c.mutation('pushAlerts:unregisterDevice', { token: TOKEN });
  check('turning alerts off removes the phone', await c.query('pushAlerts:deviceRegistered', { token: TOKEN }) === false);
  process.exit(finish() ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH', e); process.exit(2); });
