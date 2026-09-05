import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const owner = eas.build['production-owner'];
const production = eas.build.production;
assert.equal(owner.extends, 'production');
assert.equal(owner.environment, 'production');
assert.equal(owner.channel, 'owner-recognition');
assert.equal(owner.distribution, 'store');
assert.equal(owner.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED, 'true');
assert.equal(owner.env.STACKR_OWNER_RECOGNITION_BUILD, 'true');
for (const [key, value] of Object.entries(production.env)) assert.equal(owner.env[key], value, key);
assert.notEqual(production.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED, 'true');
const before = { ...process.env };
try {
  Object.assign(process.env, production.env, owner.env);
  const resolved = require('../app.config.js')({ config });
  assert.equal(resolved.extra.stackrRuntime.environment, 'production');
  assert.equal(resolved.runtimeVersion, `${config.version}-owner-recognition-v1`);
  assert.notEqual(resolved.runtimeVersion, config.version);
  assert.equal(resolved.ios.bundleIdentifier, config.ios.bundleIdentifier);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  Object.assign(process.env, before);
}
console.log('Owner build uses production services, a private update channel and an isolated runtime.');
