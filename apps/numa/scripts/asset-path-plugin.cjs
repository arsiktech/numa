// Metro asset plugin. Cloudflare Pages leaves out every folder named
// `node_modules` when it uploads a build, so exported web assets under
// assets/node_modules/... (fonts, images from packages) would 404 there.
// Its publish step also fails on a folder named like a package scope, so the `@`
// goes too (node_modules/@expo-google-fonts -> vendor/expo-google-fonts).
// For exported builds only, this renames that path segment to `vendor`;
// the bundle's URLs and the written files both follow httpServerLocation,
// so they stay in step. The dev server uses ?unstable_path= and is untouched.
// Metro caches transformed assets: after editing this file, export with --clear.
module.exports = function assetPathPlugin(asset) {
  if (asset.httpServerLocation.includes('?export_path=')) {
    asset.httpServerLocation = asset.httpServerLocation.replace(/(^|\/|=)node_modules\/@?/g, '$1vendor/');
  }
  return asset;
};
