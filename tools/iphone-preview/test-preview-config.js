'use strict';

const assert = require('node:assert/strict');
const appJson = require('../../app.json').expo;
const eas = require('../../eas.json');
const { resolveMobileRuntimeConfig, targets } = require('../../config/mobile-runtime.cjs');
const {
  buildProductionExpoEnvironment,
  isLocalUrl,
  isPreviewExpoAlive,
  isVerifiedExpoUrl,
} = require('./server.js');

const inherited = {
  PATH: process.env.PATH,
  APP_VARIANT: 'development',
  EXPO_PUBLIC_APP_VARIANT: 'development',
  EXPO_PUBLIC_STACKR_API_URL: 'https://wrong.example.test',
  STACKR_MOBILE_API_URL: targets.staging.stackrApiUrl,
  STACKR_API_URL: targets.staging.stackrApiUrl,
  STACKR_PREVIEW_PROXY_GATEWAY_URL: targets.staging.stackrApiUrl,
  STACKR_OWNER_RECOGNITION_BUILD: 'true',
};
const previewEnv = buildProductionExpoEnvironment(eas.build.production.env, inherited);
const runtime = resolveMobileRuntimeConfig(previewEnv);

assert.equal(appJson.version, '1.0.3');
assert.deepEqual(appJson.runtimeVersion, { policy: 'appVersion' });
assert.equal(runtime.appVariant, 'production');
assert.equal(runtime.environment, 'production');
assert.equal(runtime.supabaseUrl, targets.production.supabaseUrl);
assert.equal(runtime.priceApiUrl, targets.production.priceApiUrl);
assert.equal(runtime.stackrApiUrl, targets.production.stackrApiUrl);
assert.equal(previewEnv.EXPO_NO_DOTENV, '1');
assert.equal(previewEnv.EXPO_PUBLIC_STACKR_API_URL, undefined);
assert.equal(previewEnv.STACKR_API_URL, undefined);
assert.equal(previewEnv.STACKR_PREVIEW_PROXY_GATEWAY_URL, undefined);
assert.equal(previewEnv.STACKR_OWNER_RECOGNITION_BUILD, undefined);
assert.equal(previewEnv.APP_VARIANT, undefined);
assert.equal(previewEnv.EXPO_PUBLIC_APP_VARIANT, undefined);

const configureApp = require('../../app.config.js');
const previousPreview = process.env.STACKR_IPHONE_PREVIEW;
const previousVariant = process.env.STACKR_MOBILE_APP_VARIANT;
const previousEnvironment = process.env.STACKR_MOBILE_ENVIRONMENT;
try {
  Object.assign(process.env, eas.build.production.env);
  delete process.env.STACKR_IPHONE_PREVIEW;
  const releaseConfig = configureApp({ config: appJson });
  assert.equal(releaseConfig.version, '1.0.3');
  assert.deepEqual(releaseConfig.runtimeVersion, { policy: 'appVersion' });
  assert.equal(releaseConfig.web.output, 'static');

  process.env.STACKR_IPHONE_PREVIEW = '1';
  const previewConfig = configureApp({ config: appJson });
  assert.equal(previewConfig.version, '1.0.3');
  assert.deepEqual(previewConfig.runtimeVersion, { policy: 'appVersion' });
  assert.equal(previewConfig.web.output, 'single');
} finally {
  if (previousPreview === undefined) delete process.env.STACKR_IPHONE_PREVIEW;
  else process.env.STACKR_IPHONE_PREVIEW = previousPreview;
  if (previousVariant === undefined) delete process.env.STACKR_MOBILE_APP_VARIANT;
  else process.env.STACKR_MOBILE_APP_VARIANT = previousVariant;
  if (previousEnvironment === undefined) delete process.env.STACKR_MOBILE_ENVIRONMENT;
  else process.env.STACKR_MOBILE_ENVIRONMENT = previousEnvironment;
}

for (const localUrl of [
  'http://127.0.0.1:8083',
  'http://localhost:8083',
  'http://[::1]:8083',
]) assert.equal(isLocalUrl(localUrl), true);
for (const remoteOrUnsafeUrl of [
  'https://example.com',
  'http://127.0.0.1.example.com:8083',
  'file:///tmp/app',
]) assert.equal(isLocalUrl(remoteOrUnsafeUrl), false);

assert.equal(isVerifiedExpoUrl('http://127.0.0.1:8083/login', 'http://127.0.0.1:8083'), true);
assert.equal(isVerifiedExpoUrl('http://[::1]:8083', 'http://127.0.0.1:8083'), false);
assert.equal(isVerifiedExpoUrl('http://127.0.0.1:8084', 'http://127.0.0.1:8083'), false);
assert.equal(isVerifiedExpoUrl('https://example.com', 'http://127.0.0.1:8083'), false);
assert.equal(isVerifiedExpoUrl('http://127.0.0.1:8083', null), false);
assert.equal(isPreviewExpoAlive({ killed: false, exitCode: null }), true);
assert.equal(isPreviewExpoAlive({ killed: true, exitCode: null }), false);
assert.equal(isPreviewExpoAlive({ killed: false, exitCode: 0 }), false);
assert.equal(isPreviewExpoAlive(null), false);

console.log('PASS production preview isolation, source attribution, config, and release invariants');
