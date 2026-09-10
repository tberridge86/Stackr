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
  let reads = 0;
  const retryableRead = () => getCachedOrFetch('partial:binder', 30_000, async () => {
    reads += 1;
    return reads === 1 ? { complete: false, count: 3 } : { complete: true, count: 237 };
  }, { shouldCache: value => value.complete });
  assert.equal((await retryableRead()).count, 3, 'saved cards remain available during a catalogue failure');
  assert.equal((await retryableRead()).count, 237, 'an incomplete result must be retried immediately');
  assert.equal((await retryableRead()).count, 237);
  assert.equal(reads, 2, 'the recovered complete result should be cached');
  console.log('Request cache invalidation/inflight regression passed.');
}

void main();
