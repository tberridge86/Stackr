const { resolveMobileRuntimeConfig } = require('./config/mobile-runtime.cjs');

module.exports = ({ config }) => {
  const runtimeConfig = resolveMobileRuntimeConfig(process.env);
  const isDevApp = runtimeConfig.appVariant === 'development';
  const isStagingApp = runtimeConfig.environment === 'staging' && !isDevApp;
  const variantSuffix = isDevApp ? '.dev' : isStagingApp ? '.staging' : '';

  return {
    ...config,
    name: isDevApp ? 'Stackr Dev' : isStagingApp ? 'Stackr Staging' : config.name,
    // Every binary belongs to the existing EAS project. Native package IDs and
    // update channels isolate internal variants; changing the slug breaks the
    // projectId-to-slug association before EAS can build them.
    slug: config.slug,
    scheme: isDevApp ? 'stackr-dev' : isStagingApp ? 'stackr-staging' : config.scheme,
    // Staging updates must never be runtime-compatible with production. Keep
    // the existing production policy so released binaries do not lose OTA
    // compatibility solely because this boundary was introduced.
    runtimeVersion: runtimeConfig.environment === 'staging'
      ? `${config.version}-${runtimeConfig.appVariant}`
      : config.runtimeVersion,
    extra: {
      ...(config.extra ?? {}),
      stackrRuntime: runtimeConfig,
    },
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
  };
};
