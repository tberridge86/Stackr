import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const buildId = 'e27175bd-321c-4719-bf8c-87e8b64d427c';
const result = spawnSync(process.execPath,
  ['scripts/submit-owner-recognition-ios.mjs', buildId, process.execPath, '--dry-run'], {
    encoding: 'utf8', env: { ...process.env, STACKR_MOBILE_APP_VARIANT: 'staging',
      STACKR_MOBILE_ENVIRONMENT: 'staging', EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: 'false' },
  });
assert.equal(result.status, 0, result.stderr);
const plan = JSON.parse(result.stdout.trim().split('\n').at(-1));
assert.equal(plan.dryRun, true);
assert.equal(plan.bundleIdentifier, 'com.tommo86.Stackr');
assert.equal(plan.environment, 'production');
assert.equal(plan.runtimeVersion, '1.0.3-owner-recognition-v1');
assert.equal(plan.ownerFeatureEnabled, true);
assert.deepEqual(plan.args, ['submit', '--platform', 'ios', '--profile', 'production-owner',
  '--id', buildId, '--groups', 'Team (Expo)', '--non-interactive', '--no-wait']);
const invalid = spawnSync(process.execPath,
  ['scripts/submit-owner-recognition-ios.mjs', 'latest', process.execPath, '--dry-run'], { encoding: 'utf8' });
assert.notEqual(invalid.status, 0, 'Unqualified latest must never schedule a submission.');
console.log('Owner submission dry-run pins production identity, owner settings and an exact build; no submission performed.');
