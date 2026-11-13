// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The vendor rename is for hosting exported web builds. Native release builds embed the bundle with
// `expo export:embed` and list its assets for expo-updates with createUpdatesResources.js; both keep
// the original file paths, so renaming the URLs there would point every package font and image at a
// file the app doesn't have.
const embedsNativeBundle = process.argv.includes('export:embed') || /createUpdatesResources\.js$/.test(process.argv[1] ?? '');
if (!embedsNativeBundle) {
  config.transformer.assetPlugins = [...(config.transformer.assetPlugins ?? []), require.resolve('./scripts/asset-path-plugin.cjs')];
}

module.exports = config;
