/** Numa's home-screen widget. Data comes from the app through the shared app group. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'NumaWidget',
  displayName: 'Numa Pro',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: { light: '#FFFFFF', dark: '#000000' },
    $accent: { light: '#0B0B0C', dark: '#F4F4F1' },
    bg: { light: '#FFFFFF', dark: '#000000' },
    ink: { light: '#0B0B0C', dark: '#F4F4F1' },
    ink2: { light: '#55575C', dark: '#A1A4AA' },
    up: { light: '#0B8A55', dark: '#3DDC97' },
    down: { light: '#D23A2D', dark: '#FF6B5E' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
