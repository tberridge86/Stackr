import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { getCameraPermissionAction } from '../lib/cameraAccess';
import { isSellerTrialModeEnabled } from '../lib/sellerTrial';

assert.equal(getCameraPermissionAction(null), 'loading');
assert.equal(getCameraPermissionAction({ granted: true, canAskAgain: true }), 'ready');
assert.equal(getCameraPermissionAction({ granted: false, canAskAgain: true }), 'request');
assert.equal(getCameraPermissionAction({ granted: false, canAskAgain: false }), 'open-settings');

assert.equal(isSellerTrialModeEnabled({
  EXPO_PUBLIC_APP_VARIANT: 'staging',
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false',
  EXPO_PUBLIC_SELLER_TRIAL_MODE: 'true',
}), true);
assert.equal(isSellerTrialModeEnabled({
  EXPO_PUBLIC_APP_VARIANT: 'production',
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false',
  EXPO_PUBLIC_SELLER_TRIAL_MODE: 'true',
}), false);

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
assert.equal(appJson.version, '1.0.4');
assert.equal(appJson.android.versionCode, 9);
assert.deepEqual(appJson.android.permissions, ['android.permission.CAMERA']);
assert.ok(appJson.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));

const expoCameraPlugin = appJson.plugins.find(
  (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
);
assert.ok(expoCameraPlugin, 'expo-camera config plugin must be present');
assert.equal(expoCameraPlugin[1].microphonePermission, false);
assert.equal(expoCameraPlugin[1].recordAudioAndroid, false);

const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const sellerTrial = eas.build['seller-trial'];
assert.equal(sellerTrial.distribution, 'internal');
assert.equal(sellerTrial.android.buildType, 'apk');
assert.equal(sellerTrial.env.APP_VARIANT, 'staging');
assert.equal(sellerTrial.env.EXPO_PUBLIC_APP_VARIANT, 'staging');
assert.equal(sellerTrial.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED, 'false');
assert.equal(sellerTrial.env.EXPO_PUBLIC_SELLER_TRIAL_MODE, 'true');
assert.equal(sellerTrial.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE, 'true');
assert.equal(sellerTrial.env.EXPO_PUBLIC_STACKR_API_ENABLED, 'false');
assert.equal(sellerTrial.env.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED, 'false');
assert.equal(sellerTrial.env.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED, 'false');
assert.equal(sellerTrial.env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, 'false');
assert.equal(sellerTrial.env.EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK, 'false');
assert.match(sellerTrial.env.EXPO_PUBLIC_SUPABASE_URL, /lmwfhvexfcoyeuoyrlco/);
assert.match(sellerTrial.env.EXPO_PUBLIC_PRICE_API_URL, /staging/);
assert.equal(eas.build.production.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED, 'false');
assert.equal(eas.build.production.env.EXPO_PUBLIC_SELLER_TRIAL_MODE, undefined);

const cameraSource = fs.readFileSync('features/scan/ScanScreen.tsx', 'utf8');
assert.match(cameraSource, /getCameraPermissionAction\(permission\)/);
assert.match(cameraSource, /permissionAction === 'open-settings'/);
assert.match(cameraSource, /Linking\.openSettings\(\)/);
assert.match(cameraSource, /refreshPermission\(\)/);
assert.match(cameraSource, /setCameraRestartKey\(\(current\) => current \+ 1\)/);
assert.match(cameraSource, /Retry camera/);
assert.match(cameraSource, /autoFrameCheckFailureCount\.current >= 3/);
assert.match(cameraSource, /deleteTemporaryCameraCacheFile/);
assert.match(cameraSource, /samplePromotedToCapture/);
assert.match(cameraSource, /sellerTrialInventoryScan/);
assert.match(cameraSource, /Auto scan unavailable in Seller Trial/);
assert.match(cameraSource, /inventory-no-resolved-card/);
assert.match(cameraSource, /No inventory change was made\. Try another scan or search manually\./);
assert.match(cameraSource, /localQuickScanExperienceEnabled \|\| isSweepScan \|\| isInventoryFlow/);
assert.match(cameraSource, /await scanStore\.triggerCallback\('', card\)/);
assert.match(cameraSource, /accessibilityLabel=\{torchEnabled \? 'Turn torch off' : 'Turn torch on'\}/);

const legacyCameraRoute = fs.readFileSync('app/scan/card-camera.tsx', 'utf8');
assert.match(legacyCameraRoute, /<Redirect href="\/scan" \/>/);
assert.doesNotMatch(legacyCameraRoute, /visionCamera|useScanCamera/);

const inventorySource = fs.readFileSync('lib/inventory.ts', 'utf8');
assert.match(inventorySource, /stackr:seller-trial-ledger:v1/);
assert.match(inventorySource, /appVariant: 'staging'/);
assert.match(inventorySource, /receipts\.find\(\(receipt\) => receipt\.requestId === requestId\)/);
assert.match(inventorySource, /existingReceipt\.fingerprint !== trialFingerprint/);
assert.match(inventorySource, /assertValidSellerTrialCommit/);
assert.match(inventorySource, /withSellerTrialCommitLock/);
assert.match(inventorySource, /readBackReceipt\?\.fingerprint !== trialFingerprint/);

const invalidTrialConfig = spawnSync(process.execPath, ['-e', "require('./app.config.js')"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_VARIANT: 'production',
    EXPO_PUBLIC_APP_VARIANT: 'production',
    EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false',
    EXPO_PUBLIC_SELLER_TRIAL_MODE: 'true',
    EXPO_PUBLIC_BETA_TRADE_DEMO_MODE: 'true',
    EXPO_PUBLIC_SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
    EXPO_PUBLIC_PRICE_API_URL: 'https://pocketvault-production.up.railway.app',
  },
  encoding: 'utf8',
});
assert.notEqual(invalidTrialConfig.status, 0, 'a production Seller Trial configuration must fail closed');
assert.match(`${invalidTrialConfig.stderr}${invalidTrialConfig.stdout}`, /Seller Trial builds require the staging app/);
assert.match(inventorySource, /AsyncStorage\.setItem\(sellerTrialLedgerKey\(user\.id\), JSON\.stringify\(nextLedger\)\)/);
assert.match(inventorySource, /Binder changes are disabled in Seller Trial/);
assert.match(inventorySource, /assertPremiumSellerWriteAccess\(user\)/);

const appIndexSource = fs.readFileSync('app/index.tsx', 'utf8');
assert.match(appIndexSource, /!profileLoading && appModeHydrated/);
assert.match(appIndexSource, /mode === 'seller'/);
assert.match(appIndexSource, /router\.replace\('\/seller'\)/);

const sellerDashboardSource = fs.readFileSync('app/seller/index.tsx', 'utf8');
assert.match(sellerDashboardSource, /Marketplace publishing is outside this device-only trial/);
assert.match(sellerDashboardSource, /clearSellerTrialLedger/);

const inventoryScreenSource = fs.readFileSync('features/inventory/InventoryScreen.tsx', 'utf8');
assert.match(inventoryScreenSource, /Destination: device-only Trial inventory/);
assert.match(inventoryScreenSource, /Record local stock-out/);
assert.match(inventoryScreenSource, /No order, payment, shipping label or payout was created/);
assert.match(inventoryScreenSource, /startedRouteScanRef/);
assert.match(inventoryScreenSource, /router\.setParams\(\{ startScan: undefined \}\)/);
assert.match(inventoryScreenSource, /scanToInventory\(requestedValue === 'stock_out' \? 'remove' : 'add'\)/);

const routeSource = fs.readFileSync('lib/routes.ts', 'utf8');
assert.match(routeSource, /scanSellerIn: \{ pathname: '\/\(tabs\)\/inventory', params: \{ startScan: 'stock_in' \} \}/);
assert.match(routeSource, /scanSellerOut: \{ pathname: '\/\(tabs\)\/inventory', params: \{ startScan: 'stock_out' \} \}/);

const appConfigSource = fs.readFileSync('app.config.js', 'utf8');
assert.match(appConfigSource, /updates: sellerTrialMode/);
assert.match(appConfigSource, /enabled: false/);
assert.match(appConfigSource, /checkAutomatically: 'NEVER'/);
assert.match(appConfigSource, /allowBackup: sellerTrialMode \? false/);
assert.match(appConfigSource, /android\.permission\.SYSTEM_ALERT_WINDOW/);
for (const permission of [
  'android.permission.WAKE_LOCK',
  'com.android.vending.BILLING',
  'com.google.android.c2dm.permission.RECEIVE',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'android.permission.READ_APP_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
]) {
  assert.ok(
    appConfigSource.includes(`'${permission}'`),
    `${permission} must be blocked in Seller Trial`,
  );
}
assert.match(appConfigSource, /supabaseUrl !== stagingSupabaseUrl/);
assert.match(appConfigSource, /apiUrl !== stagingApiUrl/);

const workflowSource = fs.readFileSync('.github/workflows/mobile-seller-trial.yml', 'utf8');
assert.match(workflowSource, /APP_VARIANT: staging/);
assert.match(workflowSource, /EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: "false"/);
assert.match(workflowSource, /EXPO_PUBLIC_SELLER_TRIAL_MODE: "true"/);
assert.match(workflowSource, /EXPECT_EXPO_UPDATES_DISABLED: "true"/);
assert.match(workflowSource, /SHIPPO_ALLOW_LABEL_PURCHASES: "false"/);
assert.match(workflowSource, /EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK: "false"/);
assert.match(workflowSource, /npm run typecheck/);
assert.match(workflowSource, /npm run test:premium-seller-access/);
assert.match(workflowSource, /npm run test:mobile-trial-release/);
assert.match(workflowSource, /npm run test:seller-trial-ledger/);
assert.match(workflowSource, /npm run test:haptics-runtime/);
assert.match(workflowSource, /verify-seller-trial-bundle\.mjs/);
assert.match(workflowSource, /--reset-cache/);
assert.match(workflowSource, /test:seller-trial-telemetry/);

const appLayoutSource = fs.readFileSync('app/_layout.tsx', 'utf8');
assert.match(appLayoutSource, /void stackrHaptics\.selection\(\)/);
assert.match(workflowSource, /android\.permission\.CAMERA/);
assert.match(workflowSource, /android\.permission\.VIBRATE/);
assert.match(workflowSource, /DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION/);
assert.match(workflowSource, /android\.permission\.RECORD_AUDIO/);
assert.match(workflowSource, /expo\.modules\.updates\.ENABLED/);
assert.match(workflowSource, /sha256sum/);
assert.match(workflowSource, /retention-days: 30/);

const authContextSource = fs.readFileSync('components/auth-context.tsx', 'utf8');
assert.match(authContextSource, /if \(isSellerTrialModeEnabled\(\)\) return/);

const scanLearningSource = fs.readFileSync('lib/scanLearning.ts', 'utf8');
assert.match(scanLearningSource, /if \(isSellerTrialModeEnabled\(\)\) return/);

const listingRouteSource = fs.readFileSync('app/listing/new.tsx', 'utf8');
assert.match(listingRouteSource, /isSellerTrialModeEnabled\(\)/);
assert.match(listingRouteSource, /<Redirect href="\/seller" \/>/);
const createListingSource = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
assert.match(createListingSource, /if \(sellerTrialMode\)/);
assert.match(createListingSource, /No listing, offer or order was created/);

console.log('Mobile Seller Trial release checks passed.');
