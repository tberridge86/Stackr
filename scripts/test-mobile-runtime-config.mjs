import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { verifyCompatibleBuilds } from './deploy/verify-eas-compatible-builds.mjs';
import { verifyEasRollbackTarget } from './deploy/verify-eas-rollback-target.mjs';

const require = createRequire(import.meta.url);
const {
  MOBILE_PRODUCTION_RELEASE_FLAGS,
  MOBILE_RUNTIME_ENV_VARIABLES,
  MOBILE_SAFE_RELEASE_FLAGS,
  mobileReleaseFlagsForEnvironment,
  resolveMobileRuntimeConfig,
  targets,
} = require('../config/mobile-runtime.cjs');

const REVIEWED_TARGETS = {
  staging: {
    supabaseUrl: 'https://lmwfhvexfcoyeuoyrlco.supabase.co',
    supabasePublishableKey: 'sb_publishable_5qRlv9bSq5vaz3zgDSpwIA_JayaHJGU',
    priceApiUrl: 'https://stackr-backend-staging-staging.up.railway.app',
    stackrApiUrl: 'https://stackr-api-gateway-staging.berridge14.workers.dev',
  },
  production: {
    supabaseUrl: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
    supabasePublishableKey: 'sb_publishable_utiXk-8YPG57MWlrYdWgvg_7xaufYYt',
    priceApiUrl: 'https://pocketvault-production.up.railway.app',
    stackrApiUrl: 'https://api.stackrtcg.com',
  },
};
assert.deepEqual(targets, REVIEWED_TARGETS, 'reviewed mobile target anchors must not drift');
assert.notDeepEqual(targets.staging, targets.production);
const releaseManifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
assert.equal(
  new URL(targets.staging.supabaseUrl).hostname.split('.')[0],
  releaseManifest.components.database.stagingProjectRef,
);
assert.equal(
  new URL(targets.production.supabaseUrl).hostname.split('.')[0],
  releaseManifest.components.database.projectRef,
);

const staging = resolveMobileRuntimeConfig({});
assert.equal(staging.appVariant, 'staging');
assert.equal(staging.environment, 'staging');
assert.deepEqual(
  {
    supabaseUrl: staging.supabaseUrl,
    supabasePublishableKey: staging.supabasePublishableKey,
    priceApiUrl: staging.priceApiUrl,
    stackrApiUrl: staging.stackrApiUrl,
  },
  targets.staging,
  'an omitted variant must fail safe to the reviewed staging target',
);
assert.equal(
  resolveMobileRuntimeConfig({ APP_VARIANT: 'production' }).environment,
  'staging',
  'legacy APP_VARIANT must be unable to select production',
);

const production = resolveMobileRuntimeConfig({ STACKR_MOBILE_APP_VARIANT: 'production' });
assert.equal(production.environment, 'production');
assert.deepEqual(
  {
    supabaseUrl: production.supabaseUrl,
    supabasePublishableKey: production.supabasePublishableKey,
    priceApiUrl: production.priceApiUrl,
    stackrApiUrl: production.stackrApiUrl,
  },
  targets.production,
);

const contaminatedPreview = resolveMobileRuntimeConfig({
  STACKR_MOBILE_APP_VARIANT: 'staging',
  STACKR_MOBILE_ENVIRONMENT: 'staging',
  APP_VARIANT: 'production',
  EXPO_PUBLIC_PRICE_API_URL: targets.production.priceApiUrl,
  EXPO_PUBLIC_STACKR_API_URL: targets.production.stackrApiUrl,
  EXPO_PUBLIC_SUPABASE_URL: targets.production.supabaseUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: targets.production.supabasePublishableKey,
});
assert.equal(contaminatedPreview.environment, 'staging');
assert.equal(contaminatedPreview.supabaseUrl, targets.staging.supabaseUrl);
assert.equal(contaminatedPreview.priceApiUrl, targets.staging.priceApiUrl);
assert.equal(contaminatedPreview.stackrApiUrl, targets.staging.stackrApiUrl);

assert.throws(
  () => resolveMobileRuntimeConfig({
    STACKR_MOBILE_APP_VARIANT: 'staging',
    STACKR_MOBILE_SUPABASE_URL: targets.production.supabaseUrl,
  }),
  /mobile_runtime_target_mismatch:staging:supabaseUrl/,
);
assert.throws(
  () => resolveMobileRuntimeConfig({
    STACKR_MOBILE_APP_VARIANT: 'production',
    STACKR_MOBILE_PRICE_API_URL: targets.staging.priceApiUrl,
  }),
  /mobile_runtime_target_mismatch:production:priceApiUrl/,
);
assert.throws(
  () => resolveMobileRuntimeConfig({
    STACKR_MOBILE_APP_VARIANT: 'staging',
    STACKR_MOBILE_ENVIRONMENT: 'production',
  }),
  /mobile_runtime_variant_environment_mismatch/,
);
assert.throws(
  () => resolveMobileRuntimeConfig({ STACKR_MOBILE_APP_VARIANT: 'unknown' }),
  /mobile_runtime_variant_invalid/,
);

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const expectedProfiles = {
  development: { appVariant: 'development', easEnvironment: 'development', channel: 'development' },
  preview: { appVariant: 'preview', easEnvironment: 'preview', channel: 'preview' },
  staging: { appVariant: 'staging', easEnvironment: 'preview', channel: 'staging' },
  'seller-canary': { appVariant: 'seller-canary', easEnvironment: 'preview', channel: 'seller-canary' },
};
for (const [profileName, expectedProfile] of Object.entries(expectedProfiles)) {
  const env = eas.build[profileName]?.env;
  assert.ok(env, `${profileName} EAS profile must define an environment`);
  assert.equal(eas.build[profileName].environment, expectedProfile.easEnvironment);
  assert.equal(eas.build[profileName].channel, expectedProfile.channel);
  assert.equal(env.STACKR_MOBILE_APP_VARIANT, expectedProfile.appVariant);
  assert.equal(env.STACKR_MOBILE_ENVIRONMENT, 'staging');
  assert.notEqual(env.STACKR_MOBILE_APP_VARIANT, 'production');
  for (const [field, variable] of [
    ['supabaseUrl', 'STACKR_MOBILE_SUPABASE_URL'],
    ['supabasePublishableKey', 'STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY'],
    ['priceApiUrl', 'STACKR_MOBILE_PRICE_API_URL'],
    ['stackrApiUrl', 'STACKR_MOBILE_API_URL'],
  ]) assert.equal(env[variable], targets.staging[field], `${profileName}:${variable}`);
}
const productionEnv = eas.build.production.env;
assert.equal(eas.build.production.environment, 'production');
assert.equal(eas.build.production.channel, 'production');
assert.equal(productionEnv.STACKR_MOBILE_APP_VARIANT, 'production');
assert.equal(productionEnv.STACKR_MOBILE_ENVIRONMENT, 'production');
for (const [field, variable] of [
  ['supabaseUrl', 'STACKR_MOBILE_SUPABASE_URL'],
  ['supabasePublishableKey', 'STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY'],
  ['priceApiUrl', 'STACKR_MOBILE_PRICE_API_URL'],
  ['stackrApiUrl', 'STACKR_MOBILE_API_URL'],
]) assert.equal(productionEnv[variable], targets.production[field], `production:${variable}`);
assert.equal(productionEnv.EXPO_PUBLIC_SCAN_PROVIDER, undefined);

for (const [profileName, profile] of Object.entries(eas.build)) {
  for (const variable of [
    'EXPO_PUBLIC_PRICE_API_URL',
    'EXPO_PUBLIC_STACKR_API_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]) assert.equal(profile.env?.[variable], undefined, `${variable} must not select a mobile target`);
  const expectedProfileFlags = profileName === 'production'
    ? MOBILE_PRODUCTION_RELEASE_FLAGS
    : profileName === 'seller-canary'
    ? { ...MOBILE_SAFE_RELEASE_FLAGS, EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }
    : MOBILE_SAFE_RELEASE_FLAGS;
  for (const [variable, expectedValue] of Object.entries(expectedProfileFlags)) {
    assert.equal(profile.env?.[variable], expectedValue, `${variable} must be explicit and fail closed`);
  }
}

function collectClientSourcePaths(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectClientSourcePaths(entryPath);
    if (!entry.isFile() || !/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) return [];
    return [entryPath];
  });
}

const clientSourcePaths = ['app', 'components', 'features', 'lib']
  .flatMap(collectClientSourcePaths)
  .filter((filePath) => filePath !== path.join('lib', 'mobileRuntimeConfig.ts'));
const clientSource = clientSourcePaths
  .map((filePath) => readFileSync(filePath, 'utf8'))
  .join('\n');
assert.doesNotMatch(
  clientSource,
  /process\.env\.(?:PRICE_API_URL|STACKR_API_URL|EXPO_PUBLIC_(?:PRICE_API_URL|STACKR_API_URL|SUPABASE_URL|SUPABASE_(?:ANON|PUBLISHABLE)_KEY))\b/,
  'mobile network clients must only consume the reviewed Expo runtime config',
);
assert.doesNotMatch(
  clientSource,
  /oakdbbzdqwurpjnoqhmu|pocketvault-production|api\.stackrtcg\.com|sb_publishable_utiXk/,
  'mobile client source must not contain raw production targets outside the reviewed build config',
);
assert.match(readFileSync('lib/config.ts', 'utf8'), /MOBILE_RUNTIME_CONFIG\.priceApiUrl/);
assert.match(readFileSync('lib/supabase.tsx', 'utf8'), /MOBILE_RUNTIME_CONFIG\.supabaseUrl/);
assert.doesNotMatch(
  readFileSync('lib/config.ts', 'utf8'),
  /EXPO_PUBLIC_(?:SCAN_LAB_UPLOAD_API_URL|RECOGNITION_FEEDBACK_API_URL|SHADOW_MODE_PILOT_API_URL)/,
);
assert.doesNotMatch(
  readFileSync('lib/mobileRuntimeConfig.ts', 'utf8'),
  /mobile-runtime-targets\.json/,
  'a client bundle must not contain both environment target records',
);

const nodeConfigImport = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `import('./lib/config.ts').then(({ PRICE_API_URL }) => {
      if (PRICE_API_URL !== ${JSON.stringify(targets.staging.priceApiUrl)}) process.exit(1);
    })`,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRICE_API_URL: targets.staging.priceApiUrl,
      STACKR_NODE_TOOLING_RUNTIME: 'true',
    },
    encoding: 'utf8',
  },
);
assert.equal(
  nodeConfigImport.status,
  0,
  nodeConfigImport.stderr || nodeConfigImport.stdout || 'Node config import failed',
);
const implicitNodeConfigImportEnv = { ...process.env };
delete implicitNodeConfigImportEnv.STACKR_NODE_TOOLING_RUNTIME;
const implicitNodeConfigImport = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--input-type=module', '-e', `import('./lib/config.ts')`],
  {
    cwd: process.cwd(),
    env: implicitNodeConfigImportEnv,
    encoding: 'utf8',
  },
);
assert.notEqual(implicitNodeConfigImport.status, 0, 'Node tooling fallback must require explicit opt-in');
assert.match(
  implicitNodeConfigImport.stderr,
  /mobile_runtime_node_tooling_mode_required/,
  'implicit Node imports must fail with the reviewed runtime error',
);

const stagingWorkflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
for (const variable of MOBILE_RUNTIME_ENV_VARIABLES) {
  assert.match(stagingWorkflow, new RegExp(`\\b${variable}:`), `${variable} must be passed to EAS`);
}
const verifyPosition = stagingWorkflow.indexOf('npm run mobile:verify-runtime');
const updatePosition = stagingWorkflow.indexOf('eas-cli@21.4.0 update');
assert.ok(verifyPosition >= 0 && verifyPosition < updatePosition, 'public Expo config must be verified before publish');
assert.match(stagingWorkflow, /--expected-environment=staging --expected-app-variant=staging/);
assert.match(stagingWorkflow, /eas-cli@21\.4\.0 env:exec preview/);
for (const variable of [
  ...MOBILE_RUNTIME_ENV_VARIABLES,
  ...Object.keys(MOBILE_SAFE_RELEASE_FLAGS),
]) {
  assert.match(
    stagingWorkflow,
    new RegExp(`-u ${variable}\\b`),
    `${variable} must be cleared before loading the effective EAS preview environment`,
  );
  assert.ok(
    [...stagingWorkflow.matchAll(new RegExp(`-u ${variable}\\b`, 'g'))].length >= 2,
    `${variable} must also be cleared for the staging publication snapshot`,
  );
}
assert.ok(
  stagingWorkflow.indexOf('eas-cli@21.4.0 env:exec preview') < updatePosition,
  'the effective EAS preview environment must be verified before staging publish',
);
assert.ok(
  verifyPosition < stagingWorkflow.indexOf('Prepare gateway runtime configuration'),
  'staging mobile validation must run before provider mutations',
);
assert.match(
  stagingWorkflow,
  /Require compatible staging mobile builds[\s\S]*build:list[\s\S]*--runtime-version "\$runtime_version"[\s\S]*--git-commit-hash "\$GITHUB_SHA"[\s\S]*--required-platforms=android,ios/,
);
assert.ok(
  stagingWorkflow.indexOf('Require compatible staging mobile builds')
    < stagingWorkflow.indexOf('Prepare gateway runtime configuration'),
  'compatible staging build proof must run before provider mutations',
);
assert.match(
  stagingWorkflow,
  /Publish staging mobile configuration[\s\S]*env:exec preview[\s\S]*mobile:verify-runtime[\s\S]*eas-cli@21\.4\.0 update --channel staging[\s\S]*--json[\s\S]*capture-eas-update-group\.mjs[\s\S]*--mode=publish-evidence[\s\S]*capture-eas-update-group\.mjs[\s\S]*--expected-platforms=android,ios/,
);
assert.ok(
  stagingWorkflow.indexOf('--mode=publish-evidence')
    < stagingWorkflow.indexOf('--expected-runtime="$(node -p'),
  'staging rollback evidence must be persisted before strict update attestation',
);
assert.match(
  stagingWorkflow,
  /Upload staging mobile deployment attestation[\s\S]*!cancelled\(\)[\s\S]*STACKR_MOBILE_UPDATE_PUBLISHED == 'true'[\s\S]*eas-update-publish-evidence\.json/,
);
assert.match(
  stagingWorkflow,
  /Roll back staging mobile update after a workflow failure[\s\S]*failure\(\)[\s\S]*STACKR_MOBILE_UPDATE_PUBLISHED == 'true'[\s\S]*update:rollback[\s\S]*"\$STACKR_EAS_UPDATE_GROUP_ID"/,
);
assert.match(
  stagingWorkflow,
  /Remove ephemeral logical backups[\s\S]*if: always\(\)[\s\S]*continue-on-error: true/,
  'cleanup after the staging rollback gate must not create an unhandled late failure',
);
assert.doesNotMatch(
  stagingWorkflow,
  /eas-cli@21\.4\.0 update --channel staging[^\n]*--environment/,
  'staging publication must use the already-validated EAS environment snapshot',
);
const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const productionMobileWorkflow = readFileSync('.github/workflows/publish-mobile-production-canary.yml', 'utf8');
for (const variable of MOBILE_RUNTIME_ENV_VARIABLES) {
  assert.match(productionWorkflow, new RegExp(`\\b${variable}:`), `${variable} must be passed to production EAS`);
}
assert.match(productionWorkflow, /--expected-environment=production --expected-app-variant=production/);
assert.match(productionWorkflow, /eas-cli@21\.4\.0 env:exec production/);
for (const variable of [
  ...MOBILE_RUNTIME_ENV_VARIABLES,
  ...Object.keys(MOBILE_PRODUCTION_RELEASE_FLAGS),
]) {
  assert.match(
    productionWorkflow,
    new RegExp(`-u ${variable}\\b`),
    `${variable} must be cleared before loading the effective EAS production environment`,
  );
  assert.ok(
    [...productionWorkflow.matchAll(new RegExp(`-u ${variable}\\b`, 'g'))].length >= 2,
    `${variable} must also be cleared for the production publication snapshot`,
  );
}
assert.ok(
  productionWorkflow.indexOf('eas-cli@21.4.0 env:exec production')
    < productionWorkflow.indexOf('eas-cli@21.4.0 update'),
  'the effective EAS production environment must be verified before publish',
);
assert.ok(
  productionWorkflow.indexOf('npm run mobile:verify-runtime')
    < productionWorkflow.indexOf('Prepare gateway runtime configuration'),
  'production mobile validation must run before provider mutations',
);
assert.match(
  productionWorkflow,
  /Publish matching mobile canary[\s\S]*env:exec production[\s\S]*mobile:verify-runtime[\s\S]*eas-cli@21\.4\.0 update --channel production[\s\S]*capture-eas-update-group\.mjs[\s\S]*--mode=publish-evidence[\s\S]*capture-eas-update-group\.mjs[\s\S]*--expected-platforms=android,ios/,
);
assert.ok(
  productionWorkflow.indexOf('--mode=publish-evidence')
    < productionWorkflow.indexOf('--expected-runtime="$(node -p'),
  'mobile rollback evidence must be persisted before strict update attestation',
);
assert.match(
  productionWorkflow,
  /Upload production mobile deployment attestation[\s\S]*!cancelled\(\)[\s\S]*STACKR_MOBILE_UPDATE_PUBLISHED == 'true'[\s\S]*eas-update-publish-evidence\.json/,
);
assert.match(
  productionWorkflow,
  /Remove ephemeral logical backups[\s\S]*if: always\(\)[\s\S]*continue-on-error: true/,
  'cleanup after the production rollback gates must not create an unhandled late failure',
);
assert.match(productionWorkflow, /Production mobile canary must be between 1 and 50 percent/);
assert.doesNotMatch(
  productionWorkflow,
  /eas-cli@21\.4\.0 update --channel production[^\n]*--environment/,
  'production publication must use the already-validated EAS environment snapshot',
);
assert.match(productionMobileWorkflow, /github\.ref == 'refs\/heads\/main'[\s\S]*inputs\.confirmation == 'PUBLISH MOBILE CANARY'/);
assert.match(productionMobileWorkflow, /environment: production[\s\S]*EXPO_TOKEN: \$\{\{ secrets\.EXPO_TOKEN \}\}/);
assert.match(
  productionMobileWorkflow,
  /Validate effective EAS production environment[\s\S]*env:exec production[\s\S]*--expected-environment=production[\s\S]*--require-safe-release-flags/,
);
assert.match(
  productionMobileWorkflow,
  /Require compatible production mobile builds[\s\S]*build:list[\s\S]*--channel production[\s\S]*--build-profile production[\s\S]*--git-commit-hash "\$GITHUB_SHA"[\s\S]*--required-platforms=android,ios/,
);
assert.match(
  productionMobileWorkflow,
  /Publish mobile canary[\s\S]*--rollout-percentage "\$CANARY_PERCENT"[\s\S]*capture-eas-update-group\.mjs[\s\S]*--mode=publish-evidence[\s\S]*--expected-platforms=android,ios/,
);
assert.match(
  productionMobileWorkflow,
  /Roll back mobile update after a failed canary[\s\S]*update:revert-update-rollout[\s\S]*--group "\$STACKR_EAS_UPDATE_GROUP_ID"/,
);
for (const forbidden of ['railway', 'wrangler', 'supabase db', 'eas-cli@21.4.0 submit']) {
  assert.equal(
    productionMobileWorkflow.toLowerCase().includes(forbidden),
    false,
    `mobile production workflow must not contain ${forbidden}`,
  );
}

const rollbackWorkflow = readFileSync('.github/workflows/rollback.yml', 'utf8');
assert.match(
  rollbackWorkflow,
  /concurrency:\s+group: stackr-\$\{\{ inputs\.environment \}\}-deployment\s+cancel-in-progress: false/,
  'deploy and rollback operations must share the protected-environment lock',
);
assert.match(
  rollbackWorkflow,
  /Attest mobile rollback target[\s\S]*verify-eas-rollback-target\.mjs/,
  'manual mobile rollback must attest the exact EAS target',
);
const rollbackAttestationPosition = rollbackWorkflow.indexOf('- name: Attest mobile rollback target');
for (const mutationStep of [
  '- name: Revert an in-progress EAS rollout',
  '- name: Republish a known-good EAS update group',
]) {
  assert.ok(
    rollbackAttestationPosition >= 0
      && rollbackAttestationPosition < rollbackWorkflow.indexOf(mutationStep),
    `${mutationStep} must run only after target attestation`,
  );
}

function verifierEnvironment(appVariant, environment, target) {
  return {
    ...process.env,
    STACKR_MOBILE_APP_VARIANT: appVariant,
    STACKR_MOBILE_ENVIRONMENT: environment,
    STACKR_MOBILE_SUPABASE_URL: target.supabaseUrl,
    STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey,
    STACKR_MOBILE_PRICE_API_URL: target.priceApiUrl,
    STACKR_MOBILE_API_URL: target.stackrApiUrl,
    ...mobileReleaseFlagsForEnvironment(environment),
  };
}

function runVerifierProcess(appVariant, environment, target, options = {}) {
  const verifierEnv = verifierEnvironment(appVariant, environment, target);
  options.mutateEnvironment?.(verifierEnv);
  return spawnSync(
    process.execPath,
    [
      'scripts/deploy/verify-mobile-runtime-config.mjs',
      `--expected-environment=${environment}`,
      `--expected-app-variant=${appVariant}`,
      '--require-explicit',
      '--require-safe-release-flags',
    ],
    {
      cwd: process.cwd(),
      env: verifierEnv,
      encoding: 'utf8',
    },
  );
}

function runVerifier(appVariant, environment, target) {
  const result = runVerifierProcess(appVariant, environment, target);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function assertVerifierFails(appVariant, environment, target, mutateEnvironment, errorPattern) {
  const result = runVerifierProcess(appVariant, environment, target, { mutateEnvironment });
  assert.notEqual(result.status, 0, 'the runtime verifier must fail closed');
  assert.match(`${result.stderr}\n${result.stdout}`, errorPattern);
}

const developmentConfig = runVerifier('development', 'staging', targets.staging);
assert.equal(developmentConfig.scheme, 'stackr-dev');
assert.equal(developmentConfig.iosBundleIdentifier, 'com.tommo86.Stackr.dev');
assert.equal(developmentConfig.androidPackage, 'com.tommo86.Stackr.dev');
assert.equal(developmentConfig.runtimeVersion, '1.0.3-development');

for (const appVariant of ['preview', 'staging', 'seller-canary']) {
  const config = runVerifier(appVariant, 'staging', targets.staging);
  assert.equal(config.scheme, 'stackr-staging');
  assert.equal(config.iosBundleIdentifier, 'com.tommo86.Stackr.staging');
  assert.equal(config.androidPackage, 'com.tommo86.Stackr.staging');
  assert.equal(config.runtimeVersion, `1.0.3-${appVariant}`);
}

const productionConfig = runVerifier('production', 'production', targets.production);
assert.equal(productionConfig.scheme, 'stackr');
assert.equal(productionConfig.iosBundleIdentifier, 'com.tommo86.Stackr');
assert.equal(productionConfig.androidPackage, 'com.tommo86.Stackr');
assert.deepEqual(productionConfig.runtimeVersion, { policy: 'appVersion' });

assertVerifierFails(
  'staging',
  'staging',
  targets.staging,
  (env) => { delete env.STACKR_MOBILE_API_URL; },
  /mobile_runtime_explicit_variable_missing:STACKR_MOBILE_API_URL/,
);
assertVerifierFails(
  'staging',
  'staging',
  targets.staging,
  (env) => { env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE = 'false'; },
  /mobile_runtime_safe_release_flag_mismatch:EXPO_PUBLIC_BETA_TRADE_DEMO_MODE/,
);
assertVerifierFails(
  'staging',
  'staging',
  targets.staging,
  (env) => { env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED = 'true'; },
  /mobile_runtime_safe_release_flag_mismatch:EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED/,
);
assertVerifierFails(
  'staging',
  'staging',
  targets.staging,
  (env) => { env.STACKR_MOBILE_SUPABASE_URL = targets.production.supabaseUrl; },
  /mobile_runtime_target_mismatch:staging:supabaseUrl/,
);
assertVerifierFails(
  'production',
  'production',
  targets.production,
  (env) => { delete env.EXPO_PUBLIC_STACKR_API_ENABLED; },
  /mobile_runtime_safe_release_flag_mismatch:EXPO_PUBLIC_STACKR_API_ENABLED/,
);
assertVerifierFails(
  'production',
  'production',
  targets.production,
  (env) => { env.EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY = 'true'; },
  /mobile_runtime_safe_release_flag_mismatch:EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY/,
);

const compatibleBuildSha = 'a'.repeat(40);
const compatibleBuildNow = Date.parse('2026-08-27T12:00:00.000Z');
const compatibleBuilds = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'FINISHED',
    platform: 'ANDROID',
    channel: 'staging',
    runtimeVersion: '1.0.3-staging',
    buildProfile: 'staging',
    gitCommitHash: compatibleBuildSha,
    completedAt: '2026-08-27T12:00:00.000Z',
    expirationDate: '2026-09-27T12:00:00.000Z',
    artifacts: { buildUrl: 'https://expo.dev/artifacts/android-staging.apk' },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'FINISHED',
    platform: 'IOS',
    channel: 'staging',
    runtimeVersion: '1.0.3-staging',
    buildProfile: 'staging',
    gitCommitHash: compatibleBuildSha,
    completedAt: '2026-08-27T12:01:00.000Z',
    expirationDate: '2026-09-27T12:01:00.000Z',
    artifacts: { buildUrl: 'https://expo.dev/artifacts/ios-staging.ipa' },
  },
];
const compatibleBuildSelection = verifyCompatibleBuilds(compatibleBuilds, {
  requiredPlatforms: ['android', 'ios'],
  channel: 'staging',
  runtimeVersion: '1.0.3-staging',
  buildProfile: 'staging',
  gitCommitHash: compatibleBuildSha,
  nowMs: compatibleBuildNow,
});
assert.equal(compatibleBuildSelection.android.id, compatibleBuilds[0].id);
assert.equal(compatibleBuildSelection.ios.id, compatibleBuilds[1].id);
assert.throws(
  () => verifyCompatibleBuilds(compatibleBuilds.slice(0, 1), {
    requiredPlatforms: ['android', 'ios'],
    channel: 'staging',
    runtimeVersion: '1.0.3-staging',
    buildProfile: 'staging',
    gitCommitHash: compatibleBuildSha,
    nowMs: compatibleBuildNow,
  }),
  /eas_compatible_build_missing:ios/,
);
assert.throws(
  () => verifyCompatibleBuilds([
    { ...compatibleBuilds[0], runtimeVersion: '1.0.3' },
    compatibleBuilds[1],
  ], {
    requiredPlatforms: ['android', 'ios'],
    channel: 'staging',
    runtimeVersion: '1.0.3-staging',
    buildProfile: 'staging',
    gitCommitHash: compatibleBuildSha,
    nowMs: compatibleBuildNow,
  }),
  /eas_compatible_build_invalid:android:runtimeVersion/,
);
assert.throws(
  () => verifyCompatibleBuilds([
    { ...compatibleBuilds[0], expirationDate: '2026-08-27T11:59:59.000Z' },
    compatibleBuilds[1],
  ], {
    requiredPlatforms: ['android', 'ios'],
    channel: 'staging',
    runtimeVersion: '1.0.3-staging',
    buildProfile: 'staging',
    gitCommitHash: compatibleBuildSha,
    nowMs: compatibleBuildNow,
  }),
  /eas_compatible_build_invalid:android:expirationDate/,
);

const rollbackGroupId = '33333333-3333-4333-8333-333333333333';
const rollbackBranchId = '44444444-4444-4444-8444-444444444444';
const rollbackUpdates = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    group: rollbackGroupId,
    branch: 'staging',
    runtimeVersion: '1.0.3-staging',
    platform: 'android',
    manifestPermalink: 'https://u.expo.dev/updates/android',
    isRollBackToEmbedded: false,
    gitCommitHash: compatibleBuildSha,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    group: rollbackGroupId,
    branch: 'staging',
    runtimeVersion: '1.0.3-staging',
    platform: 'ios',
    manifestPermalink: 'https://u.expo.dev/updates/ios',
    isRollBackToEmbedded: false,
    gitCommitHash: compatibleBuildSha,
  },
];
const rollbackChannel = {
  currentPage: {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'staging',
    isPaused: false,
    branchMapping: JSON.stringify({
      version: 0,
      data: [{ branchId: rollbackBranchId, branchMappingLogic: 'true' }],
    }),
    updateBranches: [{ id: rollbackBranchId, name: 'staging' }],
  },
};
const rollbackProjectBranch = {
  id: rollbackBranchId,
  name: 'staging',
  currentPage: [{
    group: rollbackGroupId,
    branch: 'staging',
    runtimeVersion: '1.0.3-staging',
    platforms: 'android, ios',
  }],
};
const rollbackExpected = {
  groupId: rollbackGroupId,
  environment: 'staging',
  channel: 'staging',
  runtimeVersion: '1.0.3-staging',
  platforms: 'android,ios',
  operation: 'mobile-update',
};
const rollbackAttestation = verifyEasRollbackTarget(
  rollbackUpdates,
  rollbackChannel,
  rollbackProjectBranch,
  rollbackExpected,
);
assert.deepEqual(rollbackAttestation.platforms, ['android', 'ios']);
assert.throws(
  () => verifyEasRollbackTarget(
    rollbackUpdates.map((update, index) => (
      index === 0 ? { ...update, branch: 'production' } : update
    )),
    rollbackChannel,
    rollbackProjectBranch,
    rollbackExpected,
  ),
  /eas_rollback_target_invalid:branchMismatch/,
);
assert.throws(
  () => verifyEasRollbackTarget(
    rollbackUpdates.slice(0, 1),
    rollbackChannel,
    rollbackProjectBranch,
    rollbackExpected,
  ),
  /eas_rollback_target_invalid:platforms/,
);
assert.throws(
  () => verifyEasRollbackTarget(
    rollbackUpdates,
    rollbackChannel,
    {
      ...rollbackProjectBranch,
      currentPage: [{ ...rollbackProjectBranch.currentPage[0], rolloutPercentage: 5 }],
    },
    rollbackExpected,
  ),
  /eas_rollback_target_invalid:activePartialRollout/,
);
assert.throws(
  () => verifyEasRollbackTarget(
    rollbackUpdates,
    rollbackChannel,
    rollbackProjectBranch,
    { ...rollbackExpected, operation: 'mobile-rollout' },
  ),
  /eas_rollback_target_invalid:activePartialRolloutRequired/,
);
assert.doesNotThrow(() => verifyEasRollbackTarget(
  rollbackUpdates,
  rollbackChannel,
  {
    ...rollbackProjectBranch,
    currentPage: [{ ...rollbackProjectBranch.currentPage[0], rolloutPercentage: 5 }],
  },
  { ...rollbackExpected, operation: 'mobile-rollout' },
));

console.log('Mobile runtime target isolation checks passed.');
