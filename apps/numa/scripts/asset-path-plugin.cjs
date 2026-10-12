// Metro asset plugin. Cloudflare Pages leaves out every folder named
// `node_modules` when it uploads a build, so exported web assets under
// assets/node_modules/... (fonts, images from packages) would 404 there.
// For exported builds only, this renames that path segment to `vendor`;
// the bundle's URLs and the written files both follow httpServerLocation,
// so they stay in step. The dev server uses ?unstable_path= and is untouched.
module.exports = function assetPathPlugin(asset) {
  if (asset.httpServerLocation.includes('?export_path=')) {
    asset.httpServerLocation = asset.httpServerLocation.replace(/(^|\/|=)node_modules\//g, '$1vendor/');
  }
  return asset;
};
