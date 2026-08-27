import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const buildGradlePath = 'android/app/build.gradle';

assert.ok(fs.existsSync(manifestPath), 'Expo prebuild did not generate the Android manifest');
assert.ok(fs.existsSync(buildGradlePath), 'Expo prebuild did not generate the Android app build file');

const manifest = fs.readFileSync(manifestPath, 'utf8');
const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
const expectedPackage = process.env.EXPECTED_ANDROID_PACKAGE ?? 'com.tommo86.Stackr.staging';
const expectUpdatesDisabled = process.env.EXPECT_EXPO_UPDATES_DISABLED === 'true';

assert.match(manifest, /android\.permission\.CAMERA/, 'generated app must request CAMERA');
const recordAudioTag = manifest.match(/<uses-permission[^>]+android\.permission\.RECORD_AUDIO[^>]*>/)?.[0];
if (recordAudioTag) {
  assert.match(recordAudioTag, /tools:node="remove"/, 'RECORD_AUDIO must be removed from the merged manifest');
}
assert.ok(
  buildGradle.includes(expectedPackage),
  `generated Android package must be ${expectedPackage}`,
);
if (expectUpdatesDisabled) {
  assert.match(
    manifest,
    /android:name="expo\.modules\.updates\.ENABLED" android:value="false"/,
    'Seller Trial must disable Expo Updates in the generated Android manifest',
  );
  assert.match(
    manifest,
    /android:name="expo\.modules\.updates\.EXPO_UPDATES_CHECK_ON_LAUNCH" android:value="NEVER"/,
    'Seller Trial must never check for an OTA update on launch',
  );
  assert.match(
    manifest,
    /<application[^>]+android:allowBackup="false"/,
    'Seller Trial must opt out of Android backup and device transfer',
  );
  for (const permission of [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]) {
    const escaped = permission.replaceAll('.', '\\.');
    assert.match(
      manifest,
      new RegExp(`<uses-permission[^>]+${escaped}[^>]+tools:node="remove"`),
      `${permission} must be removed from Seller Trial`,
    );
  }
}

console.log('Generated Android camera, package and update-isolation checks passed.');
