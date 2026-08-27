'use strict';

const targets = require('./mobile-runtime-targets.json');

const MOBILE_RUNTIME_SCHEMA_VERSION = 1;
const MOBILE_RUNTIME_ENV_VARIABLES = Object.freeze([
  'STACKR_MOBILE_APP_VARIANT',
  'STACKR_MOBILE_ENVIRONMENT',
  'STACKR_MOBILE_SUPABASE_URL',
  'STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY',
  'STACKR_MOBILE_PRICE_API_URL',
  'STACKR_MOBILE_API_URL',
]);
const MOBILE_SAFE_RELEASE_FLAGS = Object.freeze({
  EXPO_PUBLIC_BETA_TRADE_DEMO_MODE: 'true',
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false',
  EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED: 'false',
  EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED: 'false',
  EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS: 'false',
  EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK: 'false',
  EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: 'false',
});
const NON_PRODUCTION_VARIANTS = new Set([
  'development',
  'preview',
  'staging',
  'seller-canary',
]);
const SUPPORTED_VARIANTS = new Set([...NON_PRODUCTION_VARIANTS, 'production']);

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function environmentForVariant(appVariant) {
  if (!SUPPORTED_VARIANTS.has(appVariant)) {
    throw new Error(`mobile_runtime_variant_invalid:${appVariant}`);
  }
  return appVariant === 'production' ? 'production' : 'staging';
}

function assertMobileRuntimeConfig(runtimeConfig, expectedEnvironment) {
  if (!runtimeConfig || typeof runtimeConfig !== 'object') {
    throw new Error('mobile_runtime_config_missing');
  }
  if (runtimeConfig.schemaVersion !== MOBILE_RUNTIME_SCHEMA_VERSION) {
    throw new Error('mobile_runtime_schema_version_invalid');
  }
  const inferredEnvironment = environmentForVariant(runtimeConfig.appVariant);
  if (runtimeConfig.environment !== inferredEnvironment) {
    throw new Error(
      `mobile_runtime_variant_environment_mismatch:${runtimeConfig.appVariant}:${runtimeConfig.environment}`,
    );
  }
  if (expectedEnvironment && runtimeConfig.environment !== expectedEnvironment) {
    throw new Error(
      `mobile_runtime_expected_environment_mismatch:${expectedEnvironment}:${runtimeConfig.environment}`,
    );
  }

  const expectedTarget = targets[runtimeConfig.environment];
  if (!expectedTarget) throw new Error(`mobile_runtime_environment_invalid:${runtimeConfig.environment}`);
  for (const field of [
    'supabaseUrl',
    'supabasePublishableKey',
    'priceApiUrl',
    'stackrApiUrl',
  ]) {
    if (runtimeConfig[field] !== expectedTarget[field]) {
      throw new Error(`mobile_runtime_target_mismatch:${runtimeConfig.environment}:${field}`);
    }
  }

  return runtimeConfig;
}

function resolveMobileRuntimeConfig(env = process.env) {
  // Only the target-specific variable can select production. Legacy
  // APP_VARIANT values are deliberately unable to redirect network traffic.
  const appVariant = firstNonEmpty(
    env.STACKR_MOBILE_APP_VARIANT,
    'staging',
  );
  const inferredEnvironment = environmentForVariant(appVariant);
  const environment = firstNonEmpty(
    env.STACKR_MOBILE_ENVIRONMENT,
    inferredEnvironment,
  );
  if (environment !== inferredEnvironment) {
    throw new Error(`mobile_runtime_variant_environment_mismatch:${appVariant}:${environment}`);
  }

  const defaults = targets[environment];
  const runtimeConfig = {
    schemaVersion: MOBILE_RUNTIME_SCHEMA_VERSION,
    appVariant,
    environment,
    supabaseUrl: firstNonEmpty(env.STACKR_MOBILE_SUPABASE_URL, defaults.supabaseUrl),
    supabasePublishableKey: firstNonEmpty(
      env.STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY,
      defaults.supabasePublishableKey,
    ),
    priceApiUrl: firstNonEmpty(env.STACKR_MOBILE_PRICE_API_URL, defaults.priceApiUrl),
    stackrApiUrl: firstNonEmpty(env.STACKR_MOBILE_API_URL, defaults.stackrApiUrl),
  };

  return Object.freeze(assertMobileRuntimeConfig(runtimeConfig, environment));
}

module.exports = {
  MOBILE_RUNTIME_ENV_VARIABLES,
  MOBILE_SAFE_RELEASE_FLAGS,
  MOBILE_RUNTIME_SCHEMA_VERSION,
  assertMobileRuntimeConfig,
  environmentForVariant,
  resolveMobileRuntimeConfig,
  targets,
};
