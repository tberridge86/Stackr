import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createManualCollectionDraft,
  discardManualCollectionDraft,
  loadManualCollectionDraft,
  updateManualCollectionDraft,
} from '../lib/manualCollectionDraft';
import {
  CollectionBatchReconciliationRequiredError,
  createCollectionBatchRequestCoordinator,
} from '../lib/collectionBatchIdempotency';
import { sha256Text } from '../lib/collectionRequestHash';

const values = new Map<string, string>();
let rejectWrites = false;

Object.assign(AsyncStorage, {
  async getItem(key: string) { return values.get(key) ?? null; },
  async setItem(key: string, value: string) {
    if (rejectWrites) throw new Error('storage unavailable');
    values.set(key, value);
  },
  async removeItem(key: string) { values.delete(key); },
});

const card = {
  cardId: 'card-1',
  setId: 'set-1',
  language: 'en',
  cardName: 'Test card',
};
const key = `stackr:manual-collection-review:v1:`;

function resetStorage() {
  values.clear();
  rejectWrites = false;
}

async function expectReject(run: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(run, message);
}

async function testOwnerIsolationAndDraftReuse() {
  resetStorage();
  const first = await createManualCollectionDraft('owner-a', card);
  const resumed = await createManualCollectionDraft('owner-a', card);
  assert.equal(resumed.id, first.id, 'the same card resumes its existing review');
  assert.equal(await loadManualCollectionDraft('owner-b'), null, 'another owner cannot see the draft');

  values.set(`${key}owner-b`, JSON.stringify({ ...first, userId: 'owner-a' }));
  await expectReject(
    () => loadManualCollectionDraft('owner-b'),
    /could not be verified/,
  );
}

async function testLockedRetryAndDiscardOnlyBeforeWrite() {
  resetStorage();
  const draft = await createManualCollectionDraft('owner-a', card);
  await discardManualCollectionDraft('owner-a', draft.id);
  assert.equal(await loadManualCollectionDraft('owner-a'), null, 'an unsubmitted review can be discarded');

  const queued = await createManualCollectionDraft('owner-a', card);
  await updateManualCollectionDraft('owner-a', queued.id, { binderId: 'binder-1' });
  await updateManualCollectionDraft('owner-a', queued.id, { state: 'saving' });
  await expectReject(
    () => updateManualCollectionDraft('owner-a', queued.id, { quantity: 2 }),
    /locked\. Retry its original selection/,
  );
  await expectReject(
    () => discardManualCollectionDraft('owner-a', queued.id),
    /submitted review must be verified before it can be cleared/,
  );
  const restored = await loadManualCollectionDraft('owner-a');
  assert.equal(restored?.state, 'saving');
  assert.equal(restored?.binderId, 'binder-1');
  assert.equal(restored?.quantity, 1);
}

async function testStorageRejectionDoesNotCreateDraft() {
  resetStorage();
  rejectWrites = true;
  await expectReject(
    () => createManualCollectionDraft('owner-a', card),
    /storage unavailable/,
  );
  rejectWrites = false;
  assert.equal(await loadManualCollectionDraft('owner-a'), null);
}

async function testHashVectorsAndAtMostOnceCoordinator() {
  assert.equal(sha256Text(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Text('Stackr collection'), '234e7272f4264a860d38325e419b67fc48b25ef64cbe2984054b31eb40ee1636');

  const coordinator = createCollectionBatchRequestCoordinator();
  const requestKey = `collection:${'a'.repeat(64)}`;
  const fingerprint = 'b'.repeat(64);
  let invoked = 0;
  let release!: () => void;
  const invokedOnce = new Promise<void>((resolve) => { release = resolve; });
  const first = coordinator.execute({
    requestKey,
    fingerprint,
    invoke: async () => {
      invoked += 1;
      await invokedOnce;
      return { saved: true };
    },
  });
  await Promise.resolve();
  const duplicate = coordinator.execute({ requestKey, fingerprint, invoke: async () => { invoked += 1; return { saved: false }; } });
  assert.equal(invoked, 1, 'a concurrent duplicate shares the first operation');
  release();
  assert.deepEqual(await first, { value: { saved: true }, replayed: false });
  assert.deepEqual(await duplicate, { value: { saved: true }, replayed: true });
  assert.equal(invoked, 1);
  assert.deepEqual(
    await coordinator.execute({ requestKey, fingerprint, invoke: async () => { invoked += 1; return { saved: false }; } }),
    { value: { saved: true }, replayed: true },
  );
  assert.equal(invoked, 1, 'a committed request is replayed without another mutation');

  const locked = createCollectionBatchRequestCoordinator();
  await expectReject(
    () => locked.execute({
      requestKey: `collection:${'c'.repeat(64)}`,
      fingerprint: 'd'.repeat(64),
      invoke: async () => { throw new CollectionBatchReconciliationRequiredError(`collection:${'c'.repeat(64)}`); },
    }),
    /exact result could not be proven/,
  );
  await assert.rejects(
    () => locked.execute({
      requestKey: `collection:${'c'.repeat(64)}`,
      fingerprint: 'd'.repeat(64),
      invoke: async () => ({ ignored: true }),
    }),
    CollectionBatchReconciliationRequiredError,
  );
}

async function main() {
  await testOwnerIsolationAndDraftReuse();
  await testLockedRetryAndDiscardOnlyBeforeWrite();
  await testStorageRejectionDoesNotCreateDraft();
  await testHashVectorsAndAtMostOnceCoordinator();
  console.log('Manual collection review regression tests passed');
}

void main();
