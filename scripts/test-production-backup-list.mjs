import assert from 'node:assert/strict';
import { listProductionBackups } from './deploy/list-production-backups.mjs';

const manifest = { backups: [{ is_physical_backup: true, status: 'COMPLETED', inserted_at: '2026-09-20T00:59:49Z' }] };
for (const rejected of [401, 403]) {
  const calls = [];
  const result = await listProductionBackups({ token: 'primary-test-only', fallbackToken: 'fallback-test-only', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, 'https://api.supabase.com/v1/projects/oakdbbzdqwurpjnoqhmu/database/backups');
    assert.equal(options.redirect, 'error', 'credentials must not follow redirects');
    return calls.length === 1 ? { status: rejected } : { status: 200, ok: true, json: async () => manifest };
  } });
  assert.deepEqual(result, { manifest, usedFallback: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fallback-test-only');
}
let requests = 0;
await assert.rejects(listProductionBackups({ token: 'same', fallbackToken: 'same', fetchImpl: async () => {
  requests++; return { status: 401 };
} }), /credentials_rejected/);
assert.equal(requests, 1, 'the same rejected credential must not loop');
requests = 0;
await assert.rejects(listProductionBackups({ token: 'primary', fallbackToken: 'fallback', fetchImpl: async () => {
  requests++; return { status: 503, ok: false };
} }), /http_503/);
assert.equal(requests, 1, 'service failures must not be hidden by credential fallback');
await assert.rejects(listProductionBackups({ token: '', fetchImpl: async () => { throw new Error('must not fetch'); } }), /credential_missing/);
await assert.rejects(listProductionBackups({ token: 'primary', fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({}) }) }), /manifest_invalid/);
const primary = await listProductionBackups({ token: 'primary', fallbackToken: 'fallback', fetchImpl: async () => ({ status: 200, ok: true, json: async () => manifest }) });
assert.equal(primary.usedFallback, false);
console.log('Production backup listing: fixed target, bounded credential fallback and fail-closed errors passed.');
