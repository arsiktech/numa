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
    catAmber: { light: '#F2A23A', dark: '#FFB547' },
    catBlue: { light: '#2F5BD8', dark: '#5B8CFF' },
    catViolet: { light: '#6B54E0', dark: '#9B87F5' },
    catSlate: { light: '#5E6F87', dark: '#8796AE' },
    catSky: { light: '#7FB6E0', dark: '#9CCBE8' },
    catSand: { light: '#CDB98F', dark: '#D9C9A8' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
