import assert from 'node:assert/strict';
import {
  checkpointBinderPageScanSession,
  getBinderPageScanRecoverySummary,
  loadBinderPageScanSession,
  loadRecoverableBinderPageScanSessions,
  markBinderPageScanSessionSaved,
  updateBinderPageScanSession,
  setBinderPageScanStorageForTests,
} from '../lib/binderPageScanStore';

async function run() {
type Storage = {
  values: Map<string, string>;
  failGet?: boolean;
  failSet?: boolean;
  mismatchNextWrite?: boolean;
};

const makeStorage = (): Storage & { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> } => ({
  values: new Map(),
  async getItem(key) { if (this.failGet) throw new Error('read failed'); return this.values.get(key) ?? null; },
  async setItem(key, value) {
    if (this.failSet) throw new Error('write failed');
    this.values.set(key, this.mismatchNextWrite ? `${value} altered` : value);
    this.mismatchNextWrite = false;
  },
  async removeItem(key) { this.values.delete(key); },
});

const pocket = (index: number, status: 'confirmed' | 'possible_match') => ({
  index, row: 0, column: index, cropUri: `file://pocket-${index}.jpg`, candidates: [], selectedCandidateIndex: 0,
  status, source: 'manual' as const, quality: null, notes: [],
});
const session = (scanSessionId: string, ownerUserId: string) => ({
  scanSessionId, ownerUserId, binderId: `binder-${ownerUserId}`, layout: 2 as const,
  capturedAt: '2026-09-08T20:00:00.000Z', processingMs: 1,
  pockets: [pocket(0, 'confirmed'), pocket(1, 'possible_match')],
});

const storage = makeStorage();
setBinderPageScanStorageForTests(storage);
await checkpointBinderPageScanSession(session('binder-review-owner-a', 'owner-a'));
await checkpointBinderPageScanSession(session('binder-review-owner-b', 'owner-b'));

// Simulates an app restart: memory is cleared but verified storage remains.
setBinderPageScanStorageForTests(storage);
const ownerA = await loadRecoverableBinderPageScanSessions('owner-a');
assert.deepEqual(ownerA.map((item) => item.scanSessionId), ['binder-review-owner-a']);
assert.deepEqual(getBinderPageScanRecoverySummary(ownerA[0]), {
  totalPockets: 2, confirmedPockets: 1, needsReviewPockets: 1, destinationBinderId: 'binder-owner-a',
});
assert.equal(await loadBinderPageScanSession('binder-review-owner-a', 'owner-b'), null, 'cross-owner session must stay hidden');
await markBinderPageScanSessionSaved('binder-review-owner-a', 'owner-a');
assert.deepEqual(await loadRecoverableBinderPageScanSessions('owner-a'), []);
// Each queued edit must apply to the latest persisted pockets, not a stale UI render.
await checkpointBinderPageScanSession(session('rapid-pocket-edits', 'owner-rapid'));
await Promise.all([
  updateBinderPageScanSession('rapid-pocket-edits', 'owner-rapid', (current) => ({
    ...current,
    pockets: current.pockets.map((item) => item.index === 0 ? { ...item, status: 'confirmed' } : item),
  })),
  updateBinderPageScanSession('rapid-pocket-edits', 'owner-rapid', (current) => ({
    ...current,
    pockets: current.pockets.map((item) => item.index === 1 ? { ...item, status: 'confirmed' } : item),
  })),
]);
const rapidEdits = await loadBinderPageScanSession('rapid-pocket-edits', 'owner-rapid');
assert.deepEqual(rapidEdits?.pockets.map((item) => item.status), ['confirmed', 'confirmed']);

await Promise.all([0, 1, 2, 3].map((index) => checkpointBinderPageScanSession(session(`capacity-${index}`, 'owner-capacity'))));
await assert.rejects(
  () => checkpointBinderPageScanSession(session('capacity-overflow', 'owner-capacity')),
  /Finish or discard one of your existing binder page reviews/,
);
assert.equal((await loadRecoverableBinderPageScanSessions('owner-capacity')).length, 4);

storage.values.set('stackr:binder-page-scan:v1:owner:owner-c', '{"not":"an array"}');
await assert.rejects(() => loadRecoverableBinderPageScanSessions('owner-c'), /index could not be verified/);
storage.values.set('stackr:binder-page-scan:v1:session:corrupt', '{"scanSessionId":"corrupt"}');
await assert.rejects(() => loadBinderPageScanSession('corrupt', 'owner-a'), /owner is missing/);

storage.failSet = true;
await assert.rejects(() => checkpointBinderPageScanSession(session('write-fail', 'owner-d')), /write failed/);
storage.failSet = false;
storage.mismatchNextWrite = true;
await assert.rejects(() => checkpointBinderPageScanSession(session('verify-fail', 'owner-d')), /could not be saved/);
storage.failGet = true;
await assert.rejects(() => loadRecoverableBinderPageScanSessions('owner-b'), /read failed/);

setBinderPageScanStorageForTests(null);
console.log('Binder page scan durable recovery ownership, restart, corruption, and storage failure checks passed');

}

run().catch((error) => { console.error(error); process.exitCode = 1; });

