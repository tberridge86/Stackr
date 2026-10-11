import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function sha256Text(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

type Storage = {
  values: Map<string, string>;
  failWrites: boolean;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    values,
    failWrites: false,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      if (this.failWrites) throw new Error('storage unavailable');
      values.set(key, value);
    },
    async removeItem(key) { values.delete(key); },
    async getAllKeys() { return [...values.keys()]; },
  };
}

function loadRecoveryModule(storage: Storage, createActivityPost: (input: any, options: any) => Promise<any>) {
  const source = readFileSync('lib/directCollectionHistoryRecovery.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === './activity') return { createActivityPost };
      if (name === './collectionRequestHash') return { sha256Text };
      if (name === './collectionBatchIdempotency') return { canonicalCollectionBatchValue: canonical };
      throw new Error(`unexpected dependency: ${name}`);
    },
    globalThis: { crypto: { randomUUID: () => '10000000-0000-4000-8000-000000000001' } },
    Date,
    Math,
    Error,
    Map,
    Promise,
  });
  return exports as any;
}

function loadRealActivityForAmbiguousInsert() {
  let insertAttempts = 0;
  let lookupCount = 0;
  let stored: Record<string, unknown> | null = null;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }) },
    from: (table: string) => {
      if (table === 'pokemon_cards') {
        return { select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => {
          lookupCount += 1;
          return { data: { id: 'card-a', name: 'Changed catalogue name', language: 'en' }, error: null };
        } }) }) }) };
      }
      assert.equal(table, 'activity_feed');
      return {
        insert: async (payload: Record<string, unknown>) => {
          insertAttempts += 1;
          if (insertAttempts === 1) {
            stored = { ...payload };
            return { error: { code: 'ECONNRESET', message: 'transport ended after insert' } };
          }
          return { error: { code: '23505', message: 'duplicate key' } };
        },
        select: () => {
          const query: any = { eq: () => query, maybeSingle: async () => ({ data: stored, error: null }) };
          return query;
        },
      };
    },
  };
  const source = readFileSync('lib/activity.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === './supabase') return { supabase };
      if (name === './activityIdentity') return { assertActivityPostIdentity: (expected: string | undefined, current: string | null) => {
        if (expected !== undefined && expected !== current) throw new Error('activity_post_identity_changed');
      } };
      if (name === './activitySchema') return { isMissingActivitySnapshotColumn: () => false };
      throw new Error(`unexpected activity dependency: ${name}`);
    },
    AbortController, setTimeout, clearTimeout, console: { warn: () => {} },
  });
  return { createActivityPost: exports.createActivityPost, stored: () => stored, lookupCount: () => lookupCount };
}

async function main() {
  const storage = createStorage();
  const delivered = new Map<string, unknown>();
  let attempts = 0;
  let currentOwner = 'owner-a';
  let failNext = true;
  const createActivityPost = async (input: any, options: { expectedUserId: string; eventId: string }) => {
    attempts += 1;
    if (options.expectedUserId !== currentOwner) throw new Error('activity_post_identity_changed');
    // Model a server insert which succeeds before a client transport rejection.
    if (failNext) {
      failNext = false;
      delivered.set(options.eventId, input);
      throw new Error('transport ended after insert');
    }
    if (delivered.has(options.eventId)) return { status: 'created', snapshotStored: true };
    delivered.set(options.eventId, input);
    return { status: 'created', snapshotStored: true };
  };
  const first = loadRecoveryModule(storage, createActivityPost);
  const activity: any = {
    title: 'Quantity increased from 1 to 2', subtitle: 'Pikachu · Nrm', cardId: 'card-a', setId: 'set-a',
    type: 'binder_add', isPositive: true, cardSnapshot: { name: 'Pikachu', language: 'en' },
  };
  const intent = first.createDirectCollectionHistoryIntent({
    ownerUserId: 'owner-a', activity, operationId: 'set-quantity-commit-a',
  });
  activity.title = 'tampered after commit';
  activity.cardSnapshot.name = 'tampered nested snapshot';
  assert.equal(intent.activity.title, 'Quantity increased from 1 to 2', 'the persisted event facts cannot follow caller mutation');
  assert.equal(intent.activity.cardSnapshot?.name, 'Pikachu', 'nested snapshot facts are immutable too');
  assert.match(intent.eventId, /^[0-9a-f-]{36}$/);
  const pending = await first.recordDirectCollectionHistory(intent);
  assert.equal(pending.status, 'pending');
  assert.equal(storage.values.size, 1, 'the original account-bound activity remains durable after failure');
  const pendingKey = [...storage.values.keys()][0];
  storage.values.set(`${pendingKey.slice(0, pendingKey.lastIndexOf(':') + 1)}00000000-0000-5000-8000-000000000000`, '{bad json');

  // A restarted runtime reuses the original stable event ID and the server's duplicate check.
  const restarted = loadRecoveryModule(storage, createActivityPost);
  const recovered = await restarted.recoverDirectCollectionHistory('owner-a');
  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), { attempted: 1, completed: 1, pending: 0, invalid: 1 });
  assert.equal(delivered.size, 1, 'a post-commit transport failure still leaves exactly one event');
  assert.equal(storage.values.size, 1, 'corrupt local data is retained for diagnosis rather than silently deleted');

  // Duplicate local replays of one persisted intent are co-ordinated, and a late
  // account cannot receive the earlier account's event.
  const raceIntent = restarted.createDirectCollectionHistoryIntent({
    ownerUserId: 'owner-a', activity: { ...activity, title: 'Quantity reduced from 2 to 1', type: 'quantity_reduced', isPositive: false },
    operationId: 'shared-direct-commit-race',
  });
  await restarted.persistDirectCollectionHistoryIntent(raceIntent);
  const beforeRaceAttempts = attempts;
  await Promise.all([
    restarted.recordDirectCollectionHistory(raceIntent),
    restarted.recordDirectCollectionHistory(raceIntent),
  ]);
  assert.equal(attempts - beforeRaceAttempts, 1, 'both direct consumers share one in-flight history replay');
  assert.equal(delivered.size, 2);

  const switchedIntent = restarted.createDirectCollectionHistoryIntent({
    ownerUserId: 'owner-a', activity, operationId: 'late-account-change',
  });
  await restarted.persistDirectCollectionHistoryIntent(switchedIntent);
  currentOwner = 'owner-b';
  const switched = await restarted.recoverDirectCollectionHistory('owner-a');
  assert.equal(switched.pending, 1, 'a changed account retains the old owner intent instead of delivering it to the new account');
  assert.equal(delivered.has(switchedIntent.eventId), false);

  // If persistence itself fails after a committed holding, the caller receives an
  // explicit non-durable result rather than silently discarding the missing event.
  const failingStorage = createStorage();
  failingStorage.failWrites = true;
  currentOwner = 'owner-a';
  const unavailable = loadRecoveryModule(failingStorage, async () => ({ status: 'failed', error: new Error('offline') }));
  const persistenceFailure = await unavailable.recordDirectCollectionHistory(
    unavailable.createDirectCollectionHistoryIntent({ ownerUserId: 'owner-a', activity, operationId: 'storage-failure' }),
  );
  assert.equal(persistenceFailure.status, 'persistence_failed');

  const boundedStorage = createStorage();
  let boundedWrites = 0;
  const bounded = loadRecoveryModule(boundedStorage, async () => {
    boundedWrites += 1;
    return { status: 'created', snapshotStored: true };
  });
  for (let index = 0; index < 21; index += 1) {
    const boundedIntent = bounded.createDirectCollectionHistoryIntent({
      ownerUserId: 'owner-a', activity: { ...intent.activity, title: `bounded-${index}` }, operationId: `bounded-${index}`,
    });
    await bounded.persistDirectCollectionHistoryIntent(boundedIntent);
  }
  const firstBounded = await bounded.recoverDirectCollectionHistory('owner-a');
  assert.equal(firstBounded.attempted, 20, 'recovery bounds one run to twenty valid history writes');
  assert.equal(boundedWrites, 20);
  const secondBounded = await bounded.recoverDirectCollectionHistory('owner-a');
  assert.equal(secondBounded.attempted, 1, 'the remaining valid intent stays available for the next bounded run');

  // The real activity writer verifies a duplicate after an ambiguous insert. The
  // persisted snapshot prevents a later catalogue lookup from changing the event.
  const realActivity = loadRealActivityForAmbiguousInsert();
  const ambiguousStorage = createStorage();
  const ambiguous = loadRecoveryModule(ambiguousStorage, realActivity.createActivityPost);
  const ambiguousIntent = ambiguous.createDirectCollectionHistoryIntent({
    ownerUserId: 'owner-a', operationId: 'ambiguous-server-insert', activity: {
      title: 'Added to collection', subtitle: 'Original Pikachu', cardId: 'card-a', setId: 'set-a', type: 'binder_add', isPositive: true,
      cardSnapshot: { name: 'Original Pikachu', number: '001', language: 'en', imageSmall: 'original-small', imageLarge: 'original-large' },
    },
  });
  assert.equal((await ambiguous.recordDirectCollectionHistory(ambiguousIntent)).status, 'pending');
  assert.equal((await ambiguous.recoverDirectCollectionHistory('owner-a')).completed, 1);
  assert.equal(realActivity.stored()?.card_name_snapshot, 'Original Pikachu');
  assert.equal(realActivity.lookupCount(), 0, 'replay uses the captured snapshot rather than changed catalogue facts');

  console.log('Direct collection history recovery: stable history-only replay, restart, duplicate race, account switch and storage-failure checks passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
