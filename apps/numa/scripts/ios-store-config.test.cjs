const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const app = require(path.join(root, 'app.json')).expo;
const eas = require(path.join(root, 'eas.json'));

function pngHeader(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const length = data.readUInt32BE(8);
  assert.equal(data.subarray(12, 16).toString(), 'IHDR');
  assert.equal(length, 13);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
  };
}

test('production iOS profile is an App Store build of the existing Numa Pro record', () => {
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.distribution, 'store');
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.submit.production.ios.ascAppId, '6788344832');
  assert.equal(app.version, '2.0.0');
  assert.equal(app.ios.bundleIdentifier, 'com.arsiktech.numa');
  assert.equal(app.ios.appleTeamId, '794UJ787LZ');
  assert.equal(app.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.equal(app.ios.usesAppleSignIn, true);
});

test('App Store icon is a 1024 opaque PNG and Face ID has a purpose string', () => {
  const icon = pngHeader(path.join(root, app.icon));
  assert.deepEqual(icon, { width: 1024, height: 1024, colorType: 2 });
  const secureStore = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store');
  assert.equal(typeof secureStore[1].faceIDPermission, 'string');
  assert.ok(secureStore[1].faceIDPermission.length > 20);
});

test('the app privacy manifest declares required-reason APIs and does not track', () => {
  const manifest = app.ios.privacyManifests;
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  const reasons = Object.fromEntries(manifest.NSPrivacyAccessedAPITypes.map((entry) => [entry.NSPrivacyAccessedAPIType, entry.NSPrivacyAccessedAPITypeReasons]));
  assert.deepEqual(reasons.NSPrivacyAccessedAPICategoryUserDefaults, ['CA92.1', '1C8F.1']);
  assert.deepEqual(reasons.NSPrivacyAccessedAPICategoryFileTimestamp, ['C617.1', '0A2A.1', '3B52.1']);
  assert.deepEqual(reasons.NSPrivacyAccessedAPICategorySystemBootTime, ['35F9.1']);
  assert.deepEqual(reasons.NSPrivacyAccessedAPICategoryDiskSpace, ['E174.1', '85F4.1']);
  const collected = new Set(manifest.NSPrivacyCollectedDataTypes.map((entry) => entry.NSPrivacyCollectedDataType));
  for (const type of [
    'NSPrivacyCollectedDataTypeName',
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypeUserID',
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypeOtherFinancialInfo',
    'NSPrivacyCollectedDataTypePurchaseHistory',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeOtherUserContent',
  ]) assert.equal(collected.has(type), true, type);
  assert.equal(collected.has('NSPrivacyCollectedDataTypePhotosorVideos'), false);
  for (const entry of manifest.NSPrivacyCollectedDataTypes) {
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true);
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false);
  }
});

test('the widget declares app-group UserDefaults and collects nothing itself', () => {
  const plist = fs.readFileSync(path.join(root, 'targets/widget/PrivacyInfo.xcprivacy'), 'utf8');
  assert.match(plist, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(plist, /1C8F\.1/);
  assert.doesNotMatch(plist, /CA92\.1/);
  assert.match(plist, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(plist, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  const widget = fs.readFileSync(path.join(root, 'targets/widget/NumaWidget.swift'), 'utf8');
  assert.match(widget, /UserDefaults\(suiteName: "group\.com\.arsiktech\.numa"\)/);
});
