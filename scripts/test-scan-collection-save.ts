import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const values = new Map<string, string>();
const rows = new Map<string, any>();
const key = (row: { binder_id: string; card_id: string; set_id: string; language?: string | null }) => `${row.binder_id}:${row.set_id}:${row.card_id}:${row.language ?? 'en'}`;
const mock = (request: string, exports: unknown) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};

mock('@react-native-async-storage/async-storage', {
  getItem: async (name: string) => values.get(name) ?? null,
  setItem: async (name: string, value: string) => { values.set(name, value); },
  removeItem: async (name: string) => { values.delete(name); },
});
mock('../lib/binders', {
  fetchBinderById: async () => ({ id: 'binder-a', user_id: 'owner-a', language: 'en', default_condition: 'Near Mint' }),
  invalidateBinderCaches: () => undefined,
});
mock('../lib/pokemonTcg', { normalizePokemonCardLanguage: (value: unknown) => String(value ?? 'en').toLowerCase() });

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }) },
  from: () => ({
    select: () => ({ eq: async (_column: string, binderId: string) => ({ data: [...rows.values()].filter((row) => row.binder_id === binderId), error: null }) }),
    update: (next: any) => {
      const filters: Record<string, unknown> = {};
      const query: any = {
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        is: (column: string, value: unknown) => { filters[column] = value; return query; },
        select: () => ({ maybeSingle: async () => {
          const current = [...rows.values()].find((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
          if (!current) return { data: null, error: null };
          Object.assign(current, next);
          return { data: { id: current.id, card_id: current.card_id, owned: current.owned, owned_quantity: current.owned_quantity }, error: null };
        } }),
      };
      return query;
    },
    insert: (next: any) => ({ select: () => ({ single: async () => {
      const row = { ...next, id: `row-${rows.size + 1}` };
      rows.set(key(row), row);
      return { data: { id: row.id, card_id: row.card_id, owned: row.owned, owned_quantity: row.owned_quantity }, error: null };
    } }) }),
  }),
};
mock('../lib/supabase', { supabase });

const { addOwnedCardBatchToBinder, clearCollectionBatchRecoveryIntent, createCollectionBatchRequestKey, persistVerifiedCollectionBatchRecoveryIntent, sanitizeCollectionBatchCards } = require('../lib/collectionBatch') as typeof import('../lib/collectionBatch');

async function run() {
  rows.set(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'existing', language: 'en' }), {
    id: 'existing-row', binder_id: 'binder-a', set_id: 'set-a', card_id: 'existing', language: 'en', slot_order: 4,
    owned: true, owned_quantity: 2, condition: 'Near Mint', notes: 'Keep this note', card_name: 'Existing', card_number: '1', image_url: 'saved', set_name: 'Set A',
  });
  const cards = [
    { cardId: 'existing', setId: 'set-a', language: 'en', quantity: 1, notes: '' },
    { cardId: 'duplicate', setId: 'set-a', language: 'en', quantity: 1, notes: 'Pocket 1' },
    { cardId: 'duplicate', setId: 'set-a', language: 'en', quantity: 1, notes: 'Pocket 2' },
    { cardId: 'unique', setId: 'set-b', language: 'en', quantity: 1, notes: 'Pocket 3' },
  ];
  const requestKey = createCollectionBatchRequestKey({ sourceSessionId: 'scan-page-a', binderId: 'binder-a', cards });
  const saved = await addOwnedCardBatchToBinder('binder-a', cards, { requestKey });
  assert.deepEqual(saved, { requestKey, replayed: false, distinctCards: 3, copiesAdded: 4, newCards: 2, incrementedCards: 1 });
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'existing' })).owned_quantity, 3);
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'existing' })).notes, 'Keep this note');
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'duplicate' })).owned_quantity, 2);
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-b', card_id: 'unique' })).owned_quantity, 1);
  delete require.cache[require.resolve('../lib/collectionBatch')];
  const restarted = require('../lib/collectionBatch') as typeof import('../lib/collectionBatch');
  const replayed = await restarted.addOwnedCardBatchToBinder('binder-a', cards, { requestKey });
  assert.equal(replayed.replayed, true);
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'duplicate' })).owned_quantity, 2, 'restart/retry must not double-count pockets');
  const anotherCopy = [{ cardId: 'existing', setId: 'set-a', language: 'en', quantity: 1, notes: 'New scan pocket' }];
  const nextKey = createCollectionBatchRequestKey({ sourceSessionId: 'scan-page-b', binderId: 'binder-a', cards: anotherCopy });
  await restarted.addOwnedCardBatchToBinder('binder-a', anotherCopy, { requestKey: nextKey });
  const existing = rows.get(key({ binder_id: 'binder-a', set_id: 'set-a', card_id: 'existing' }));
  assert.equal(existing.owned_quantity, 4, 'a new physical copy is a distinct operation');
  assert.match(existing.notes, /Keep this note/);
  assert.match(existing.notes, /New scan pocket/);
  // Scan routes must preserve the source session identity when persisting an
  // intent; the request key remains the idempotency key for the subsequent save.
  const recoverySourceSessionId = 'scan-result-a:add:holo';
  const tcgdexReferenceUrl = 'https://assets.tcgdex.net/ja/sv/sv1/001/low.webp';
  const authorisedAssetUrl = 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/catalogue/card.webp';
  assert.equal(sanitizeCollectionBatchCards([{ cardId: 'asset-card', setId: 'set-asset', imageUrl: authorisedAssetUrl }])[0].imageUrl, authorisedAssetUrl, 'approved Supabase assets remain eligible for persistence');
  const recoveryCards = [{ cardId: 'recovery-card', setId: 'set-c', language: 'en', quantity: 1, notes: 'Verified scan', imageUrl: tcgdexReferenceUrl }];
  const recoveryRequestKey = createCollectionBatchRequestKey({
    sourceSessionId: recoverySourceSessionId,
    binderId: 'binder-a',
    cards: recoveryCards,
  });
  const intent = await persistVerifiedCollectionBatchRecoveryIntent({
    sourceSessionId: recoverySourceSessionId,
    binderId: 'binder-a',
    cards: recoveryCards,
    requestKey: recoveryRequestKey,
  });
  assert.equal(intent.sourceSessionId, recoverySourceSessionId);
  assert.equal(intent.requestKey, recoveryRequestKey);
  assert.equal(intent.cards[0].imageUrl, null, 'controlled TCGdex references are removed before the recovery intent is hashed');
  assert.equal(JSON.stringify([...values.values()]).includes('assets.tcgdex.net'), false, 'controlled references never enter local recovery storage');
  const recoverySaved = await restarted.addOwnedCardBatchToBinder(intent.binderId, [...intent.cards], { requestKey: intent.requestKey });
  assert.equal(recoverySaved.replayed, false);
  const persistedIntent = await persistVerifiedCollectionBatchRecoveryIntent({
    sourceSessionId: recoverySourceSessionId,
    binderId: 'binder-a',
    cards: recoveryCards,
    requestKey: recoveryRequestKey,
  });
  const recoveryRetry = await restarted.addOwnedCardBatchToBinder(persistedIntent.binderId, [...persistedIntent.cards], { requestKey: persistedIntent.requestKey });
  assert.equal(recoveryRetry.replayed, true, 'retrying a saved recovery intent must not add another copy');
  assert.equal(rows.get(key({ binder_id: 'binder-a', set_id: 'set-c', card_id: 'recovery-card' })).owned_quantity, 1);
  await clearCollectionBatchRecoveryIntent(recoverySourceSessionId);
  console.log('Scan collection save: duplicate pockets, mixed cards, notes, quantities and replay checks passed');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
