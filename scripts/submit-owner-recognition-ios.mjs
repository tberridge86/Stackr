import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import './verify-owner-recognition-build.mjs';

// Submission does not inherit the build profile's environment automatically.
// Resolve production explicitly so app.config.js cannot select the staging ID.
const [buildId, easCliFile, option, ...extra] = process.argv.slice(2);
assert.match(buildId ?? '', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
  'Provide the exact verified EAS build ID; latest is not permitted.');
assert(easCliFile && existsSync(easCliFile), 'Provide the installed EAS CLI bin/run file.');
assert((option === undefined || option === '--dry-run') && extra.length === 0, 'Unexpected submission arguments.');
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
Object.assign(process.env, eas.build.production.env, eas.build['production-owner'].env,
  { EXPO_NO_DOTENV: '1', CI: '1' });
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const resolved = createRequire(import.meta.url)('../app.config.js')({ config });
assert.equal(resolved.ios.bundleIdentifier, config.ios.bundleIdentifier);
assert.equal(resolved.extra.stackrRuntime.environment, 'production');
assert.equal(resolved.runtimeVersion, `${config.version}-owner-recognition-v1`);
const args = [path.resolve(easCliFile), 'submit', '--platform', 'ios', '--profile', 'production-owner',
  '--id', buildId, '--groups', 'Team (Expo)', '--non-interactive', '--no-wait'];
if (option === '--dry-run') {
  // Only a non-secret plan. This neither reads credentials nor schedules a job.
  console.log(JSON.stringify({ dryRun: true, buildId, bundleIdentifier: resolved.ios.bundleIdentifier,
    environment: resolved.extra.stackrRuntime.environment, runtimeVersion: resolved.runtimeVersion,
    ownerFeatureEnabled: process.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED === 'true', args: args.slice(1) }));
} else {
  const result = spawnSync(process.execPath, args, { env: process.env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
