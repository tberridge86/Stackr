const isDevApp = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: isDevApp ? 'Stackr Dev' : config.name,
  slug: isDevApp ? 'stackr-dev' : config.slug,
  scheme: isDevApp ? 'stackr-dev' : config.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: isDevApp
      ? 'com.tommo86.Stackr.dev'
      : config.ios.bundleIdentifier,
  },
  android: {
    ...config.android,
    package: isDevApp
      ? 'com.tommo86.Stackr.dev'
      : config.android.package,
  },
});