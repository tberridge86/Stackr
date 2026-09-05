import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  MOBILE_RUNTIME_ENV_VARIABLES,
  assertMobileRuntimeConfig,
  mobileReleaseFlagsForEnvironment,
  resolveMobileRuntimeConfig,
} = require('../../config/mobile-runtime.cjs');

const expectedEnvironmentArgument = process.argv.find((argument) => (
  argument.startsWith('--expected-environment=')
));
const expectedEnvironment = expectedEnvironmentArgument?.split('=', 2)[1];
const expectedAppVariantArgument = process.argv.find((argument) => (
  argument.startsWith('--expected-app-variant=')
));
const expectedAppVariant = expectedAppVariantArgument?.split('=', 2)[1];
const requireExplicit = process.argv.includes('--require-explicit');
const requireSafeReleaseFlags = process.argv.includes('--require-safe-release-flags');

if (expectedEnvironment !== 'staging' && expectedEnvironment !== 'production') {
  throw new Error('Pass --expected-environment=staging or --expected-environment=production.');
}
if (!expectedAppVariant) throw new Error('Pass --expected-app-variant=<variant>.');
if (requireSafeReleaseFlags) {
  const expectedReleaseFlags = mobileReleaseFlagsForEnvironment(expectedEnvironment);
  for (const [variable, expectedValue] of Object.entries(expectedReleaseFlags)) {
    if (process.env[variable] !== expectedValue) {
      throw new Error(`mobile_runtime_safe_release_flag_mismatch:${variable}`);
    }
  }
}
if (requireExplicit) {
  for (const variable of MOBILE_RUNTIME_ENV_VARIABLES) {
    if (!String(process.env[variable] ?? '').trim()) {
      throw new Error(`mobile_runtime_explicit_variable_missing:${variable}`);
    }
  }
}

// Validate the raw process environment before invoking Expo. Dynamic app config
// failures can otherwise make Expo exit without preserving the underlying
// fail-closed reason in CI output.
const resolvedRuntimeConfig = resolveMobileRuntimeConfig(process.env);
if (resolvedRuntimeConfig.environment !== expectedEnvironment) {
  throw new Error(
    `mobile_runtime_expected_environment_mismatch:${expectedEnvironment}:${resolvedRuntimeConfig.environment}`,
  );
}
if (resolvedRuntimeConfig.appVariant !== expectedAppVariant) {
  throw new Error(
    `mobile_runtime_expected_variant_mismatch:${expectedAppVariant}:${resolvedRuntimeConfig.appVariant}`,
  );
}

const expoCli = path.resolve('node_modules/expo/bin/cli');
const publicConfigResult = spawnSync(
  process.execPath,
  [expoCli, 'config', '--type', 'public', '--json'],
  {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (publicConfigResult.status !== 0) {
  process.stderr.write(publicConfigResult.stderr || publicConfigResult.stdout);
  process.exit(publicConfigResult.status ?? 1);
}

let publicConfig;
try {
  publicConfig = JSON.parse(publicConfigResult.stdout);
} catch {
  throw new Error('mobile_runtime_public_expo_config_invalid_json');
}
const runtimeConfig = assertMobileRuntimeConfig(
  publicConfig?.extra?.stackrRuntime,
  expectedEnvironment,
);
if (runtimeConfig.appVariant !== expectedAppVariant) {
  throw new Error(`mobile_runtime_expected_variant_mismatch:${expectedAppVariant}:${runtimeConfig.appVariant}`);
}
const supabaseProjectRef = new URL(runtimeConfig.supabaseUrl).hostname.split('.')[0];

console.log(JSON.stringify({
  ok: true,
  appVariant: runtimeConfig.appVariant,
  environment: runtimeConfig.environment,
  supabaseProjectRef,
  priceApiHost: new URL(runtimeConfig.priceApiUrl).hostname,
  stackrApiHost: new URL(runtimeConfig.stackrApiUrl).hostname,
  scheme: publicConfig.scheme,
  runtimeVersion: publicConfig.runtimeVersion,
  iosBundleIdentifier: publicConfig.ios?.bundleIdentifier,
  androidPackage: publicConfig.android?.package,
}, null, 2));
