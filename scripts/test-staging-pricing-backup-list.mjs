import assert from 'node:assert/strict';
import { listStagingPricingBackups } from './deploy/list-staging-pricing-backups.mjs';

const manifest = { backups: [{ status: 'COMPLETED', inserted_at: '2026-10-06T00:00:00Z' }] };
for (const status of [401, 403]) {
  let requests = 0;
  const result = await listStagingPricingBackups({ token: 'primary', fallbackToken: 'fallback', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.supabase.com/v1/projects/lmwfhvexfcoyeuoyrlco/database/backups');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${requests ? 'fallback' : 'primary'}`);
    requests++;
    return requests === 1 ? { status } : { status: 200, ok: true, json: async () => manifest };
  } });
  assert.deepEqual(result, { manifest, usedFallback: true });
  assert.equal(requests, 2);
}
let requests = 0;
await assert.rejects(listStagingPricingBackups({ token: 'same', fallbackToken: 'same', fetchImpl: async () => {
  requests++; return { status: 403 };
} }), /credentials_rejected/);
assert.equal(requests, 1);
requests = 0;
await assert.rejects(listStagingPricingBackups({ token: 'primary', fallbackToken: 'fallback', fetchImpl: async () => {
  requests++; return { status: 503, ok: false };
} }), /http_503/);
assert.equal(requests, 1);
await assert.rejects(listStagingPricingBackups({ token: '', fetchImpl: () => assert.fail('no request') }), /credential_missing/);
await assert.rejects(listStagingPricingBackups({ token: 'primary', fetchImpl: async () => {
  throw new Error('secret-bearing transport details');
} }), error => error.message === 'staging_backup_transport_failure');
await assert.rejects(listStagingPricingBackups({ token: 'primary', fetchImpl: async () => ({ status: 200, ok: true,
  json: async () => { throw new Error('secret-bearing body'); } }) }), error => error.message === 'staging_backup_manifest_invalid');
await assert.rejects(listStagingPricingBackups({ token: 'primary', fetchImpl: async () => ({ status: 200, ok: true,
  json: async () => ({}) }) }), /manifest_invalid/);
const primary = await listStagingPricingBackups({ token: 'primary', fallbackToken: 'fallback',
  fetchImpl: async () => ({ status: 200, ok: true, json: async () => manifest }) });
assert.equal(primary.usedFallback, false);
console.log('Staging pricing backup listing: fixed target, bounded existing-credential fallback, no service retries and sanitized errors passed.');
