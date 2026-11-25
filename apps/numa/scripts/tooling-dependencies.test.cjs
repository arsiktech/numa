const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

// SDK 57's Expo CLI validated dev-tools plugins with Zod, so this file exercised those
// schemas under the Zod override. From SDK 58 the CLI uses plain JSON schemas and no
// longer depends on Zod. Keep guarding the two things that still matter: the CLI does
// not pull Zod back in, and every installed Zod is the patched override version.
const fromExpo = createRequire(require.resolve('expo/package.json'));
const cliPackage = fromExpo.resolve('@expo/cli/package.json');
const cli = JSON.parse(fs.readFileSync(cliPackage, 'utf8'));
const appPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

function installedZodVersions(dir, found = new Set()) {
  const modules = path.join(dir, 'node_modules');
  if (!fs.existsSync(modules)) return found;
  for (const entry of fs.readdirSync(modules)) {
    const scoped = entry.startsWith('@') ? fs.readdirSync(path.join(modules, entry)).map((name) => path.join(entry, name)) : [entry];
    for (const name of scoped) {
      const pkgDir = path.join(modules, name);
      if (name === 'zod') found.add(JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version);
      installedZodVersions(pkgDir, found);
    }
  }
  return found;
}

test('Expo CLI no longer depends on Zod', () => {
  assert.equal(cli.dependencies?.zod, undefined);
  assert.equal(cli.optionalDependencies?.zod, undefined);
});

test('every installed Zod is the patched override version', () => {
  const versions = installedZodVersions(path.join(__dirname, '..'));
  for (const version of versions) assert.equal(version, appPackage.overrides.zod);
});
