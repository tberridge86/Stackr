const fs = require('node:fs');
const path = require('node:path');

const appVariant = process.env.APP_VARIANT ?? 'production';
const isDevApp = appVariant === 'development';
const isStagingApp = appVariant === 'staging';
const variantSuffix = isDevApp ? '.dev' : isStagingApp ? '.staging' : '';
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
    package: variantSuffix
      ? `${config.android.package}${variantSuffix}`
      : config.android.package,
  },
});
