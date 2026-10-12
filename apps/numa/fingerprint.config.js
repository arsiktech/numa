// The runtime fingerprint decides whether a change can ship as an over-the-air update or needs a
// new store build. The home-screen widget's Swift and assets live in targets/, which Expo's
// fingerprint doesn't read by default, so a widget change must count as native here.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  extraSources: [{ type: 'dir', filePath: 'targets', reasons: ['widget extension'] }],
};
