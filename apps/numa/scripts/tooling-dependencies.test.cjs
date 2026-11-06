const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

// Exercise the actual Expo CLI consumers when overriding their Zod major version.
const fromExpo = createRequire(require.resolve('expo/package.json'));
const cliPackage = fromExpo.resolve('@expo/cli/package.json');
const fromCli = createRequire(cliPackage);
const cliServer = path.join(path.dirname(cliPackage), 'build/src/start/server');
const { PluginSchema, DevToolsPluginOutputSchema } = require(path.join(cliServer, 'DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = require(path.join(cliServer, 'createMCPDevToolsExtensionSchema.js'));

const plugin = {
  packageName: 'example-devtools',
  packageRoot: '/example',
  cliExtensions: {
    description: 'Synthetic compatibility fixture',
    entryPoint: 'example.cjs',
    commands: [{
      name: 'inspect',
      title: 'Inspect fixture',
      environments: ['cli', 'mcp'],
      parameters: [
        { name: 'label', type: 'text' },
        { name: 'count', type: 'number' },
        { name: 'approved', type: 'confirm' },
      ],
    }],
  },
};

test('Expo CLI resolves the patched Zod package', () => {
  assert.equal(fromCli('zod/package.json').version, '4.6.7');
});

test('Expo plugin and output schemas preserve valid and invalid parsing', () => {
  assert.equal(PluginSchema.safeParse(plugin).success, true);
  assert.equal(PluginSchema.safeParse({ ...plugin, packageName: '' }).success, false);
  assert.equal(PluginSchema.safeParse({ ...plugin, cliExtensions: { ...plugin.cliExtensions, commands: [] } }).success, false);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'Fixture output', level: 'info' }]).success, true);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'Fixture output', level: 'invalid' }]).success, false);
});

test('Expo MCP command schema preserves parameter types and strict keys', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin);
  assert.equal(schema.safeParse({ command: 'inspect', label: 'fixture', count: 1, approved: true }).success, true);
  assert.equal(schema.safeParse({ command: 'inspect' }).success, true);
  assert.equal(schema.safeParse({ command: 'unknown' }).success, false);
  assert.equal(schema.safeParse({ command: 'inspect', count: '1' }).success, false);
  assert.equal(schema.safeParse({ command: 'inspect', unexpected: true }).success, false);
});
