import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const workflow = readFileSync('.github/workflows/build-owner-ios-release.yml', 'utf8').replace(/\r\n/gu, '\n');
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;

assert.match(workflow, /build_profile:\s*\n[\s\S]*?default: production-owner[\s\S]*?type: choice[\s\S]*?options:[\s\S]*?- production-owner[\s\S]*?- production/m);
assert.match(workflow, /github\.ref == 'refs\/heads\/main' && github\.actor == github\.repository_owner/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /group: stackr-owner-ios-release[\s\S]*?cancel-in-progress: false/);
assert.match(workflow, /test "\$GITHUB_SHA" = "\$FROZEN_SOURCE_SHA"[\s\S]*?test "\$\(git rev-parse HEAD\)" = "\$FROZEN_SOURCE_SHA"/);
assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
assert.match(workflow, /eas-cli@23\.2\.0[\s\S]*?'build', '--platform', 'ios'/);
assert.doesNotMatch(workflow, /eas-cli@23\.2\.0'?,?\s*'submit'/);
assert.match(workflow, /STACKR_OWNER_RECOGNITION_BUILD: isOwner \? 'true' : 'false'/);
assert.match(workflow, /EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: isOwner \? 'true' : 'false'/);
assert.match(workflow, /scripts\/verify-owner-recognition-build\.mjs/);
assert.match(workflow, /scripts\/deploy\/verify-mobile-runtime-config\.mjs/);
assert.match(workflow, /expected_backend_sha:[\s\S]*?required: true/);
assert.match(workflow, /EXPECTED_BACKEND_SHA: \$\{\{ inputs\.expected_backend_sha \}\}/);
const deliveryGatePosition = workflow.indexOf('node scripts/verify-ios-release-delivery.mjs');
const nativeBuildPosition = workflow.indexOf('- name: Start iOS build without submission');
assert.ok(deliveryGatePosition >= 0 && nativeBuildPosition > deliveryGatePosition);
for (const command of ['npm run test:mobile-recovery', 'npm run test:server-delivery', 'npm run test:home-activity']) {
  const position = workflow.indexOf(command);
  assert.ok(position >= 0 && position < deliveryGatePosition, `${command} must pass before live proof and native build.`);
}
assert.match(readFileSync('.github/workflows/platform-ci.yml', 'utf8'), /npm run test:home-activity/);
assert.match(workflow, /mobile-delivery-receipt\.json/);

assert.match(workflow, /verify_only:\s*\n\s*description:[^\n]*\n\s*required: false\n\s*default: false\n\s*type: boolean/);
assert.match(workflow, /VERIFY_ONLY: \$\{\{ inputs\.verify_only \}\}/);
assert.match(workflow, /if \[\[ "\$VERIFY_ONLY" != 'true' \]\]; then\s*test -n "\$EXPO_TOKEN"\s*fi/);
const buildStep = workflow.slice(nativeBuildPosition, workflow.indexOf('\n      - name:', nativeBuildPosition + 1));
assert.match(buildStep, /if: \$\{\{ !inputs\.verify_only \}\}/);
const buildScript = buildStep.match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/)[1]
  .split('\n').map((line) => line.replace(/^          /, '')).join('\n');
const reachedBuildBody = new Error('guard passed');
function checkBuildGuard(env, expected, mayReachBody) {
  let bodyReached = false;
  assert.throws(() => runInNewContext(buildScript, {
    process: { env },
    require: () => { bodyReached = true; throw reachedBuildBody; },
  }), expected);
  assert.equal(bodyReached, mayReachBody);
}
checkBuildGuard({ VERIFY_ONLY: 'true', EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'true', EXPO_TOKEN: '' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'unexpected', EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: '' }, /EXPO_TOKEN is required/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: '  ' }, /EXPO_TOKEN is required/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: 'fixture' }, (error) => error === reachedBuildBody, true);
const verificationUpload = workflow.slice(workflow.indexOf('- name: Upload verification-only receipt'));
assert.match(verificationUpload, /if: \$\{\{ success\(\) && inputs\.verify_only \}\}/);
assert.match(verificationUpload, /path: outputs\/releases\/mobile-delivery-receipt\.json/);
assert.doesNotMatch(verificationUpload, /frozen-ios-build-receipt|eas-cli/);
assert.match(workflow, /- name: Upload non-secret native build receipt\n\s*if: \$\{\{ success\(\) && !inputs\.verify_only \}\}/);

const before = { ...process.env };
try {
  Object.assign(process.env, eas.build.production.env, {
    STACKR_OWNER_RECOGNITION_BUILD: 'false',
    EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: 'false',
  });
  const resolved = require('../app.config.js')({ config });
  assert.equal(resolved.extra.stackrRuntime.environment, 'production');
  assert.equal(resolved.extra.stackrRuntime.appVariant, 'production');
  assert.deepEqual(resolved.runtimeVersion, config.runtimeVersion);
  assert.equal(resolved.ios.bundleIdentifier, config.ios.bundleIdentifier);
  assert.notEqual(process.env.STACKR_OWNER_RECOGNITION_BUILD, 'true');
  assert.notEqual(process.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED, 'true');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  Object.assign(process.env, before);
}

console.log('The frozen iOS workflow keeps owner defaults and controls while attesting the separate normal production identity.');
