// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.transformer.assetPlugins = [...(config.transformer.assetPlugins ?? []), require.resolve('./scripts/asset-path-plugin.cjs')];

module.exports = config;
