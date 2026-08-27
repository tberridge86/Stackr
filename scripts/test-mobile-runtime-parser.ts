import assert from 'node:assert/strict';
import targets from '../config/mobile-runtime-targets.json';

process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';

const {
  assertMobileRuntimeNativeIdentity,
  parseMobileRuntimeConfig,
} = require('../lib/mobileRuntimeConfig') as typeof import('../lib/mobileRuntimeConfig');

for (const [environment, target] of Object.entries(targets)) {
  const appVariant = environment === 'production' ? 'production' : 'staging';
  const parsed = parseMobileRuntimeConfig({
    schemaVersion: 1,
    appVariant,
    environment,
    ...target,
  });
  assert.equal(parsed.environment, environment);
  assert.equal(parsed.priceApiUrl, target.priceApiUrl);
  assert.doesNotThrow(() => assertMobileRuntimeNativeIdentity(parsed, {
    platform: 'ios',
    applicationId: environment === 'production'
      ? 'com.tommo86.Stackr'
      : 'com.tommo86.Stackr.staging',
  }));
  assert.doesNotThrow(() => assertMobileRuntimeNativeIdentity(parsed, {
    platform: 'android',
    applicationId: environment === 'production'
      ? 'com.tommo86.Stackr'
      : 'com.tommo86.Stackr.staging',
  }));
}

assert.throws(
  () => parseMobileRuntimeConfig({
    schemaVersion: 1,
    appVariant: 'staging',
    environment: 'staging',
    ...targets.production,
  }),
  /mobile_runtime_target_mismatch:staging:/,
);
assert.throws(
  () => parseMobileRuntimeConfig({
    schemaVersion: 1,
    appVariant: 'staging',
    environment: 'production',
    ...targets.production,
  }),
  /mobile_runtime_variant_environment_mismatch/,
);

// This string collides with the production Supabase URL under the previous
// 32-bit FNV allowlist. A target allowlist must reject practical hash collisions.
assert.throws(
  () => parseMobileRuntimeConfig({
    schemaVersion: 1,
    appVariant: 'production',
    environment: 'production',
    ...targets.production,
    supabaseUrl: 'https://attacker.example/AipBD8',
  }),
  /mobile_runtime_target_mismatch:production:supabaseUrl/,
);

const stagingRuntime = parseMobileRuntimeConfig({
  schemaVersion: 1,
  appVariant: 'staging',
  environment: 'staging',
  ...targets.staging,
});
assert.throws(
  () => assertMobileRuntimeNativeIdentity(stagingRuntime, {
    platform: 'ios',
    applicationId: 'com.tommo86.Stackr',
  }),
  /mobile_runtime_native_identity_mismatch/,
);
assert.throws(
  () => assertMobileRuntimeNativeIdentity(stagingRuntime, {
    platform: 'android',
    applicationId: null,
  }),
  /mobile_runtime_native_identity_missing/,
);
assert.throws(
  () => assertMobileRuntimeNativeIdentity(stagingRuntime, {
    platform: 'unknown',
    applicationId: 'com.tommo86.Stackr.staging',
  }),
  /mobile_runtime_native_platform_invalid/,
);
assert.doesNotThrow(() => assertMobileRuntimeNativeIdentity(stagingRuntime, {
  platform: 'web',
  applicationId: null,
}));

console.log('Mobile runtime parser checks passed.');
