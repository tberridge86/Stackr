const appVariant = process.env.APP_VARIANT ?? 'production';
const isDevApp = appVariant === 'development';
const isStagingApp = appVariant === 'staging';
const variantSuffix = isDevApp ? '.dev' : isStagingApp ? '.staging' : '';

module.exports = ({ config }) => ({
  ...config,
  name: isDevApp ? 'Stackr Dev' : isStagingApp ? 'Stackr Staging' : config.name,
  slug: isDevApp ? 'stackr-dev' : isStagingApp ? 'stackr-staging' : config.slug,
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
    package: variantSuffix
      ? `${config.android.package}${variantSuffix}`
      : config.android.package,
  },
});
