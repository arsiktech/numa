// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The shared wallet total lives in convex/lib so the legacy web build does not
// transform a file under this app's Expo tsconfig. Metro only follows an import
// that leaves this project when that folder is watched.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), path.resolve(__dirname, '../../convex')])];
// The vendor rename is for hosting exported web builds. Native release builds embed the bundle with
// `expo export:embed` and list its assets for expo-updates with createUpdatesResources.js; both keep
// the original file paths, so renaming the URLs there would point every package font and image at a
// file the app doesn't have.
const embedsNativeBundle = process.argv.includes('export:embed') || /createUpdatesResources\.js$/.test(process.argv[1] ?? '');
if (!embedsNativeBundle) {
  config.transformer.assetPlugins = [...(config.transformer.assetPlugins ?? []), require.resolve('./scripts/asset-path-plugin.cjs')];
}

module.exports = config;
