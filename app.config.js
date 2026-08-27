const fs = require('node:fs');
const path = require('node:path');

const appVariant = process.env.APP_VARIANT ?? 'production';
const isDevApp = appVariant === 'development';
const isStagingApp = appVariant === 'staging';
const publicAppVariant = process.env.EXPO_PUBLIC_APP_VARIANT ?? '';
const variantSuffix = isDevApp ? '.dev' : isStagingApp ? '.staging' : '';
const sellerTrialMode = process.env.EXPO_PUBLIC_SELLER_TRIAL_MODE === 'true';
if (sellerTrialMode) {
  const stagingSupabaseUrl = 'https://lmwfhvexfcoyeuoyrlco.supabase.co';
  const stagingApiUrl = 'https://stackr-api-gateway-staging.berridge14.workers.dev';
  const premiumSellerMode = process.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED;
  const tradeDemoMode = process.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE;
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const apiUrl = (process.env.EXPO_PUBLIC_STACKR_API_URL
    ?? process.env.EXPO_PUBLIC_PRICE_API_URL
    ?? '').replace(/\/+$/, '');
  if (
    !isStagingApp
    || publicAppVariant !== 'staging'
    || premiumSellerMode !== 'false'
    || tradeDemoMode !== 'true'
    || supabaseUrl !== stagingSupabaseUrl
    || apiUrl !== stagingApiUrl
  ) {
    throw new Error(
      'Seller Trial builds require the staging app, Premium Seller disabled, trade demo enabled, and staging Supabase/API URLs.'
    );
  }
}
const configuredGoogleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || './google-services.json';
const resolvedGoogleServicesFile = path.isAbsolute(configuredGoogleServicesFile)
  ? configuredGoogleServicesFile
  : path.resolve(process.cwd(), configuredGoogleServicesFile);
const googleServicesFile = fs.existsSync(resolvedGoogleServicesFile)
  ? configuredGoogleServicesFile
  : undefined;

module.exports = ({ config }) => ({
  ...config,
  name: isDevApp ? 'Stackr Dev' : isStagingApp ? 'Stackr Staging' : config.name,
  // Every binary belongs to the existing EAS project. Native package IDs and
  // update channels isolate internal variants; changing the slug breaks the
  // projectId-to-slug association before EAS can build them.
  slug: config.slug,
  scheme: isDevApp ? 'stackr-dev' : isStagingApp ? 'stackr-staging' : config.scheme,
  updates: sellerTrialMode
    ? {
        ...config.updates,
        enabled: false,
        checkAutomatically: 'NEVER',
      }
    : config.updates,
  plugins: [
    ...(config.plugins ?? []),
    ...((config.plugins ?? []).some((plugin) => plugin === 'expo-sqlite' || plugin?.[0] === 'expo-sqlite')
      ? []
      : ['expo-sqlite']),
  ],
  ios: {
    ...config.ios,
    bundleIdentifier: variantSuffix
      ? `${config.ios.bundleIdentifier}${variantSuffix}`
      : config.ios.bundleIdentifier,
  },
  android: {
    ...config.android,
    // Notifications are optional. A local file or EAS file-secret enables
    // Firebase; its absence must not prevent a release candidate from building.
    googleServicesFile,
    allowBackup: sellerTrialMode ? false : config.android.allowBackup,
    blockedPermissions: sellerTrialMode
      ? [
          ...new Set([
            ...(config.android.blockedPermissions ?? []),
            'android.permission.RECORD_AUDIO',
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
            'android.permission.SYSTEM_ALERT_WINDOW',
            'android.permission.POST_NOTIFICATIONS',
            'android.permission.RECEIVE_BOOT_COMPLETED',
            // Seller Trial does not register for push notifications or badges.
            // Remove transitive permissions contributed by Firebase Messaging
            // and ShortcutBadger so the packaged APK stays on the minimal
            // platform-plus-app-scoped permission allowlist.
            'android.permission.WAKE_LOCK',
            'com.android.vending.BILLING',
            'com.google.android.c2dm.permission.RECEIVE',
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
          ]),
        ]
      : config.android.blockedPermissions,
    package: variantSuffix
      ? `${config.android.package}${variantSuffix}`
      : config.android.package,
  },
});
