import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyPublishedMobileDelivery } from './deploy/verify-published-mobile-delivery.mjs';

const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(source, process.env.FROZEN_SOURCE_SHA, 'Delivery proof must use frozen source.');
const profileName = process.env.RELEASE_BUILD_PROFILE;
assert.ok(['production', 'production-owner'].includes(profileName));
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const profile = eas.build[profileName];
const isOwner = profileName === 'production-owner';
const env = { ...process.env, ...eas.build.production.env, ...profile.env,
  STACKR_OWNER_RECOGNITION_BUILD: String(isOwner), EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: String(isOwner),
  EXPO_NO_DOTENV: '1', CI: '1' };
const directory = path.join(process.env.RUNNER_TEMP, 'stackr-ios-delivery');
for (const args of [
  ['node_modules/expo/bin/cli', 'export', '--platform', 'ios', '--output-dir', directory],
  ['scripts/verify-mobile-recovery-bundle.mjs', directory],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  assert.equal(result.status, 0, 'Actual iOS bundle delivery proof failed.');
}
const api = await verifyPublishedMobileDelivery({ expectedBackendSha: process.env.EXPECTED_BACKEND_SHA });
const metadata = JSON.parse(readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
const receipt = { source, profile: profileName, ...api,
  iosBundleSha256: createHash('sha256').update(readFileSync(path.join(directory, metadata.fileMetadata.ios.bundle))).digest('hex'),
  verifiedAt: new Date().toISOString(), physicalDeviceAcceptance: 'pending', storedPriceCoverage: 'not_verified_by_this_public_gate' };
mkdirSync('outputs/releases', { recursive: true });
writeFileSync('outputs/releases/mobile-delivery-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log('Reviewed native assets and the deployed API are present; mobile delivery receipt saved.');
