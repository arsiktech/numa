// Gives a throwaway local Convex backend its Convex Auth keys. Generates a fresh
// key pair each run and never prints it. Never run this against a shared or
// production deployment: it only targets the deployment in the repo's .env.local.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A deploy key in the environment points the Convex CLI at that deployment, which can be
// production. This script only ever configures the throwaway local backend, so drop it.
delete process.env.CONVEX_DEPLOY_KEY;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envLocal = readFileSync(path.join(root, '.env.local'), 'utf8');
if (!/CONVEX_DEPLOYMENT=anonymous:/.test(envLocal)) {
  console.error('Refusing: .env.local does not point at an anonymous local deployment.');
  process.exit(1);
}
const { exportJWK, exportPKCS8, generateKeyPair } = createRequire(path.join(root, 'package.json'))('jose');
const keys = await generateKeyPair('RS256', { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ');
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] });
const site = process.env.E2E_APP_URL || 'http://localhost:5196';
// Journeys seed their own market prices, so the throwaway backend never fetches live ones.
for (const [name, value] of [['JWT_PRIVATE_KEY', privateKey], ['JWKS', jwks], ['SITE_URL', site], ['NUMA_QUOTES_OFFLINE', '1']]) {
  execFileSync('npx', ['convex', 'env', 'set', name, '--', value], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}
console.log('Local Convex Auth keys set.');
