// Registered auth + database boundaries on the anonymous local CI backend only.
const { CONVEX, req, checker, PASSWORD } = require('./lib.cjs');
const { ConvexHttpClient } = req('convex/browser');
const { check, finish } = checker();
const id = value => typeof value === 'string' ? value : value.id;
const stamp = Date.now();

async function signup(label) {
  const email = `qa-boundary-${label}-${stamp}@example.com`;
  const c = new ConvexHttpClient(CONVEX);
  const r = await c.action('auth:signIn', { provider: 'password', params: { email, password: PASSWORD, flow: 'signUp' } });
  if (!r.tokens) throw Error('This offline fixture requires password verification disabled');
  c.setAuth(r.tokens.token);
  const boot = await c.mutation('mobile:bootstrap', {});
  return { c, email, portfolioId: boot.selectedPortfolioId };
}
async function denied(operation) {
  try { await operation(); return false; }
  catch (e) { if (!/FORBIDDEN/.test(String(e))) throw e; return true; }
}

(async () => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(CONVEX)) throw Error('Only an anonymous loopback backend is allowed');
  const owner = await signup('owner');
  const recipient = await signup('recipient');
  const grant = await owner.c.mutation('memberships:inviteByEmail', { portfolioId: owner.portfolioId, email: recipient.email, ownershipBps: 0, role: 'viewer', displayName: 'Synthetic recipient' });
  check('an unverified password session does not receive an immediate email grant', grant.kind === 'invite');
  check('unverified email cannot inspect or redeem pending portfolio invitations',
    (await recipient.c.query('memberships:listPendingInvitesFor', {})).length === 0 && await recipient.c.mutation('memberships:redeemInvitesForMe', {}) === 0);
  check('the invitation does not authorize the owner portfolio', await denied(() => recipient.c.query('mobile:portfolioSnapshot', { portfolioId: owner.portfolioId })));

  const podId = id(await owner.c.mutation('moneyPods:create', { name: 'Synthetic private pod', currency: 'EUR', members: [{ email: recipient.email, displayName: 'Synthetic recipient', role: 'editor' }] }));
  await recipient.c.mutation('mobile:me', {});
  check('bootstrap does not turn an unverified email into pod access',
    await denied(() => recipient.c.query('moneyPods:getBundle', { podId })) && await denied(() => recipient.c.query('mobile:podSnapshot', { podId })));
  const code = (await owner.c.mutation('moneyPods:createInviteCode', { podId })).code;
  const joined = await recipient.c.mutation('moneyPods:joinPodByCode', { code });
  check('possession of an explicit valid share code still grants access', Boolean(await recipient.c.query('mobile:podSnapshot', { podId })));
  await owner.c.mutation('moneyPods:revokeInviteCodes', { podId });
  const bundle = await owner.c.query('moneyPods:getBundle', { podId });
  const payer = bundle.members.find(m => m.role === 'owner');
  const expense = async label => id(await owner.c.mutation('moneyPods:addExpense', { podId, paidByMemberId: payer._id, participantMemberIds: [payer._id], amount: 9, currency: 'EUR', description: label, occurredAt: Date.now(), splitMode: 'equal_people' }));
  for (const exit of ['owner removal', 'self leave']) {
    if (exit === 'owner removal') await owner.c.mutation('moneyPods:removeMember', { memberId: joined.memberId });
    else await recipient.c.mutation('moneyPods:leaveMoneyPod', { podId });
    const expenseId = await expense(`Synthetic post-${exit} record`);
    for (const fn of ['moneyPods:getBundle', 'mobile:podSnapshot']) check(`${exit} denies ${fn}`, await denied(() => recipient.c.query(fn, { podId })));
    for (const fn of ['moneyPods:removeExpense', 'mobile:deleteExpense']) check(`${exit} denies ${fn}`, await denied(() => recipient.c.mutation(fn, { expenseId })));
    const after = await owner.c.query('moneyPods:getBundle', { podId });
    check(`${exit} preserves historical membership and the new expense`, after.members.some(m => m._id === joined.memberId && m.active === false) && after.expenses.some(e => e._id === expenseId));
    if (exit === 'owner removal') {
      const fresh = (await owner.c.mutation('moneyPods:createInviteCode', { podId })).code;
      const rejoined = await recipient.c.mutation('moneyPods:joinPodByCode', { code: fresh });
      check('explicit rejoin retains the historical member id', rejoined.memberId === joined.memberId);
      await owner.c.mutation('moneyPods:revokeInviteCodes', { podId });
    }
  }
  process.exit(finish() ? 1 : 0);
})().catch(e => { console.error('JOURNEY CRASH', e); process.exit(2); });
