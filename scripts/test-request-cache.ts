import assert from 'node:assert/strict';
import { getCachedOrFetch, invalidateRequestCache } from '../lib/requestCache';

async function main() {
  invalidateRequestCache();
  let finishOld!: (value: string) => void;
  let finishNew!: (value: string) => void;
  const old = getCachedOrFetch('personal:test', 30_000, () => new Promise<string>((resolve) => { finishOld = resolve; }));
  invalidateRequestCache('personal:');
  const fresh = getCachedOrFetch('personal:test', 30_000, () => new Promise<string>((resolve) => { finishNew = resolve; }));
  finishOld('old');
  await old;
  let duplicateReads = 0;
  const joined = getCachedOrFetch('personal:test', 30_000, async () => { duplicateReads += 1; return 'duplicate'; });
  finishNew('current');
  assert.deepEqual(await Promise.all([fresh, joined]), ['current', 'current']);
  assert.equal(duplicateReads, 0, 'a completed invalidated read must not remove the newer in-flight read');
  assert.equal(await getCachedOrFetch('personal:test', 30_000, async () => 'unexpected'), 'current');
  console.log('Request cache invalidation/inflight regression passed.');
}

void main();
