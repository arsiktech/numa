// Runs the browser journeys one after another and fails if any check fails.
// Usage: node e2e/run.cjs [journey ...]   (default: all)
// A deploy key in the environment points the Convex CLI at that deployment, which can be
// production. These journeys only ever talk to the throwaway local backend, so drop it.
delete process.env.CONVEX_DEPLOY_KEY;
const { spawnSync } = require('child_process');
const path = require('path');

const ALL = ['signin-home', 'quick-sign-in', 'ask', 'ask-claude', 'holdings', 'flow', 'plan', 'alerts', 'push-alerts', 'import', 'import-file', 'wealth-log', 'wallets', 'loans', 'money-map', 'settings', 'sign-in-methods', 'agent', 'offline'];
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const results = [];
for (const name of chosen) {
  console.log(`\n=== ${name}`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, `${name}.cjs`)], { stdio: 'inherit', timeout: 8 * 60_000 });
  results.push({ name, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}
console.log('\nJourneys');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${r.seconds}s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
