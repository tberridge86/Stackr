import assert from 'node:assert/strict';
import {
  checkpointBinderPageScanSession,
  getBinderPageScanRecoverySummary,
  loadBinderPageScanSession,
  loadRecoverableBinderPageScanSessions,
  markBinderPageScanSessionSaved,
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
  index, row: 0, column: index, uri: `file://pocket-${index}.jpg`, candidates: [], selectedCandidateIndex: 0,
  status, source: 'manual' as const, notes: [],
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

