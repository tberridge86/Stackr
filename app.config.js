const appVariant = process.env.APP_VARIANT ?? 'production';
const isDevApp = appVariant === 'development';
const isStagingApp = appVariant === 'staging';
const variantSuffix = isDevApp ? '.dev' : isStagingApp ? '.staging' : '';

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
    // Internal variants use isolated package IDs and deliberately skip the
    // production-only Firebase file. Push registration already fails safely,
    // while seller canary testing does not require notifications.
    googleServicesFile: variantSuffix ? undefined : config.android.googleServicesFile,
    package: variantSuffix
      ? `${config.android.package}${variantSuffix}`
      : config.android.package,
  },
});
