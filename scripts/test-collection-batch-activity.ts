import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const values = new Map<string, string>();
const rows = new Map<string, any>();
const activities = new Map<string, Record<string, unknown>>();
let owner: string | null = 'owner-a';
let legacySchema = false;
let rejectedCard: string | null = null;
let switchAfterCommit = false;
let switchAfterFirstWrite = false;
let switchBeforeMutation = false;
let activityAttempts = 0;
const key = (row: any) => `${row.binder_id}:${row.set_id}:${row.card_id}:${row.language ?? 'en'}`;
const mock = (request: string, exports: unknown) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};

mock('@react-native-async-storage/async-storage', {
  getItem: async (name: string) => values.get(name) ?? null,
  setItem: async (name: string, value: string) => {
    values.set(name, value);
    if (switchAfterCommit && name.includes('collection-batch:v1') && JSON.parse(value).state === 'committed') {
      switchAfterCommit = false;
      owner = 'owner-b';
    }
  },
  removeItem: async (name: string) => { values.delete(name); },
});
mock('../lib/binders', {
  fetchBinderById: async () => ({ id: 'binder-a', user_id: 'owner-a', language: 'en', default_condition: 'Near Mint' }),
  invalidateBinderCaches: () => undefined,
});
mock('../lib/pokemonTcg', { normalizePokemonCardLanguage: (value: unknown) => String(value ?? 'en').toLowerCase() });

function filteredQuery(source: () => Record<string, unknown>[], mutate?: (row: any) => any) {
  const filters: Record<string, unknown> = {};
  const selected = () => source().filter((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
  const query: any = {
    eq: (column: string, value: unknown) => { filters[column] = value; return query; },
    is: (column: string, value: unknown) => { filters[column] = value; return query; },
    select: () => query,
    maybeSingle: async () => {
      const row = selected()[0] ?? null;
      return { data: row && mutate ? mutate(row) : row, error: null };
    },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
      if (switchBeforeMutation) { switchBeforeMutation = false; owner = 'owner-b'; }
      return Promise.resolve({ data: selected(), error: null }).then(resolve, reject);
    },
  };
  return query;
}

mock('../lib/supabase', { supabase: {
  auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null }, error: null }) },
  from: (table: string) => {
    if (table === 'activity_feed') return {
      select: () => filteredQuery(() => [...activities.values()]),
      insert: async (payload: Record<string, unknown>) => {
        activityAttempts += 1;
        assert.equal(payload.user_id, owner, 'events must use the current verified owner');
        if (legacySchema && 'card_name_snapshot' in payload) return { error: {
          code: 'PGRST204', message: "Could not find the 'card_name_snapshot' column of 'activity_feed' in the schema cache",
        } };
        if (payload.card_id === rejectedCard) return { error: { code: '42501', message: 'simulated activity rejection' } };
        if (activities.has(String(payload.id))) return { error: { code: '23505', message: 'duplicate activity primary key' } };
        activities.set(String(payload.id), { ...payload });
        return { error: null };
      },
    };
    assert.equal(table, 'binder_cards', 'a supplied exact card snapshot avoids catalogue lookups');
    return {
      select: () => filteredQuery(() => [...rows.values()]),
      update: (next: any) => filteredQuery(() => [...rows.values()], (row) => {
        Object.assign(row, next);
        if (switchAfterFirstWrite) { switchAfterFirstWrite = false; owner = 'owner-b'; }
        return row;
      }),
      insert: (next: any) => ({ select: () => ({ single: async () => {
        assert.equal(owner, 'owner-a', 'a batch mutation must stay under its captured account');
        const row = { ...next, id: `row-${rows.size + 1}` };
        rows.set(key(row), row);
        if (switchAfterFirstWrite) { switchAfterFirstWrite = false; owner = 'owner-b'; }
        return { data: row, error: null };
      } }) }),
    };
  },
} });

function loadBatch() {
  delete require.cache[require.resolve('../lib/collectionBatch')];
  return require('../lib/collectionBatch') as typeof import('../lib/collectionBatch');
}
const card = (cardId: string, quantity = 1) => ({
  cardId, setId: 'set-a', language: 'en', quantity, cardName: `Exact ${cardId}`, cardNumber: cardId,
  imageUrl: 'https://images.example/permitted.jpg',
});
const quantity = (cardId: string) => rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: cardId })).owned_quantity;

async function main() {
  let batch = loadBatch();
  const mixedCards = [card('a'), card('a'), card('b')];
  const requestKey = batch.createCollectionBatchRequestKey({ sourceSessionId: 'mixed', binderId: 'binder-a', cards: mixedCards });
  const saved = await batch.addOwnedCardBatchToBinder('binder-a', mixedCards, { requestKey });
  assert.equal(saved.activityFailures, undefined);
  assert.equal(saved.copiesAdded, 3);
  assert.equal(activities.size, 2, 'one activity per exact aggregated card, including each added copy in its subtitle');
  assert.equal(quantity('a'), 2);
  const firstEventIds = [...activities.keys()];
  assert.ok(firstEventIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
  assert.ok([...activities.values()].every((row) => row.card_image_small_snapshot === 'https://images.example/permitted.jpg'));
  batch = loadBatch();
  const replayed = await batch.addOwnedCardBatchToBinder('binder-a', mixedCards, { requestKey });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.activityFailures, undefined);
  assert.equal(quantity('a'), 2, 'restarted activity recovery cannot double the saved quantities');
  assert.deepEqual([...activities.keys()], firstEventIds, 'event IDs remain stable across process restart');

  legacySchema = true;
  rejectedCard = 'repair-a';
  const repairCards = [card('repair-a'), card('repair-b')];
  const repairKey = batch.createCollectionBatchRequestKey({ sourceSessionId: 'repair', binderId: 'binder-a', cards: repairCards });
  const partiallyRecorded = await batch.addOwnedCardBatchToBinder('binder-a', repairCards, { requestKey: repairKey });
  assert.equal(partiallyRecorded.activityFailures, 1, 'an activity rejection is explicit while the card save succeeds');
  assert.equal(partiallyRecorded.copiesAdded, 2);
  assert.equal(quantity('repair-a'), 1);
  assert.equal(quantity('repair-b'), 1);
  assert.equal(activities.size, 3, 'an independent successful event survives its sibling history failure');
  rejectedCard = null;
  rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'repair-a' })).owned_quantity = 7;
  rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'repair-a' })).notes = 'A later legitimate edit';
  rows.delete(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'repair-b' }));
  batch = loadBatch();
  await assert.rejects(() => batch.addOwnedCardBatchToBinder('binder-a', repairCards, { requestKey: repairKey }), /reconcil/i,
    'ordinary collection replay still refuses to restore changed holdings');
  const repaired = await batch.resumeOwnedCardBatchToBinder('binder-a', repairCards, { requestKey: repairKey });
  assert.equal(repaired.replayed, true);
  assert.equal(repaired.activityFailures, undefined);
  assert.equal(quantity('repair-a'), 7, 'history repair preserves a later quantity edit');
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'repair-a' })).notes, 'A later legitimate edit');
  assert.equal(rows.has(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'repair-b' })), false,
    'history repair must not restore a subsequently removed holding');
  assert.equal(activities.size, 4, 'verified replay fills only the missing event on the legacy schema');

  legacySchema = false;
  const priorEvents = activities.size;
  const saveKey = (sourceSessionId: string, cards: ReturnType<typeof card>[]) =>
    batch.createCollectionBatchRequestKey({ sourceSessionId, binderId: 'binder-a', cards });
  switchBeforeMutation = true;
  const beforeCards = [card('before-switch')];
  await assert.rejects(() => batch.addOwnedCardBatchToBinder('binder-a', beforeCards, { requestKey: saveKey('before-switch', beforeCards) }), /account that started/);
  assert.equal(rows.has(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'before-switch' })), false);
  assert.equal(activities.size, priorEvents, 'an account change before a card mutation must create no event');
  owner = 'owner-a';
  switchAfterFirstWrite = true;
  const midCards = [card('mid-switch-a'), card('mid-switch-b')];
  await assert.rejects(() => batch.addOwnedCardBatchToBinder('binder-a', midCards, { requestKey: saveKey('mid-switch', midCards) }), /reconcil/i);
  assert.equal(activities.size, priorEvents, 'an unverified partial card mutation must create no event');
  assert.equal(rows.has(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'mid-switch-b' })), false);

  owner = 'owner-a';
  switchAfterCommit = true;
  const committedCards = [card('after-commit')];
  const committedKey = saveKey('after-commit', committedCards);
  const afterCommit = await batch.addOwnedCardBatchToBinder('binder-a', committedCards, { requestKey: committedKey });
  assert.equal(afterCommit.activityFailures, 1);
  assert.equal(quantity('after-commit'), 1, 'a card already verified and committed remains a successful save after account change');
  assert.equal(activities.size, priorEvents, 'no history may leak into the next account');
  owner = 'owner-a';
  batch = loadBatch();
  const recovered = await batch.addOwnedCardBatchToBinder('binder-a', committedCards, { requestKey: committedKey });
  assert.equal(recovered.activityFailures, undefined);
  assert.equal(quantity('after-commit'), 1);
  assert.equal(activities.size, priorEvents + 1, 'the original account can repair history from its committed receipt');

  const eventsBeforeInvalid = activities.size;
  const rowsBeforeInvalid = JSON.stringify([...rows.values()]);
  await assert.rejects(() => batch.repairOwnedCardBatchActivity('binder-a', [card('no-receipt')], {
    requestKey: saveKey('no-receipt', [card('no-receipt')]),
  }), /reconcil/i);
  await assert.rejects(() => batch.repairOwnedCardBatchActivity('binder-a', midCards, {
    requestKey: saveKey('mid-switch', midCards),
  }), /reconcil/i, 'a pending partial receipt cannot authorize history');
  await assert.rejects(() => batch.resumeOwnedCardBatchToBinder('binder-a', [{ ...committedCards[0], quantity: 2 }], {
    requestKey: committedKey,
  }), /reconcil/i, 'a changed payload must not fall back to a fresh collection save');
  const journalKey = `stackr:collection-batch:v1:${committedKey}`;
  const validJournal = values.get(journalKey)!;
  values.set(journalKey, '{broken receipt');
  await assert.rejects(() => batch.resumeOwnedCardBatchToBinder('binder-a', committedCards, { requestKey: committedKey }), /reconcil/i);
  values.set(journalKey, validJournal);
  owner = 'owner-b';
  await assert.rejects(() => batch.resumeOwnedCardBatchToBinder('binder-a', committedCards, { requestKey: committedKey }), /account that owns/);
  owner = 'owner-a';
  assert.equal(activities.size, eventsBeforeInvalid);
  assert.equal(JSON.stringify([...rows.values()]), rowsBeforeInvalid, 'invalid recovery requests cannot mutate holdings');

  const noOp = await batch.addOwnedCardBatchToBinder('binder-a', [{ cardId: '', setId: 'set-a' }], { requestKey: 'invalid-cards' });
  assert.equal(noOp.copiesAdded, 0);
  assert.equal(activities.size, priorEvents + 1, 'a no-op must not invent collection history');
  owner = null;
  await assert.rejects(() => batch.addOwnedCardBatchToBinder('binder-a', [card('signed-out')], { requestKey: 'signed-out' }), /account that owns/);
  assert.equal(activities.size, priorEvents + 1);
  assert.ok(activityAttempts > activities.size, 'the fixture exercises actual rejected/replayed inserts');
  console.log('Collection activity passed: mixed cards, legacy schema, history repair, stable replay IDs, no-op and account changes around card commit.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
