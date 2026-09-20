import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const workflow = readFileSync('.github/workflows/build-owner-ios-release.yml', 'utf8');
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