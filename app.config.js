const base = require('./app.json');

const isDevApp = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    ...base.expo,
    name: isDevApp ? 'Stackr Dev' : base.expo.name,
    slug: isDevApp ? 'Stackr-dev' : base.expo.slug,
    scheme: isDevApp ? 'StackrDev' : base.expo.scheme,
    ios: {
      ...base.expo.ios,
      bundleIdentifier: isDevApp ? 'com.tommo86.Stackr.dev' : base.expo.ios.bundleIdentifier,
    },
    android: {
      ...base.expo.android,
      package: isDevApp ? 'com.tommo86.Stackr.dev' : base.expo.android.package,
    },
  },
};
