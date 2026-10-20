import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const values = new Map<string, string>();
const binderRows = new Map<string, any>();
const variantRows = new Map<string, number>();
let failVariantInsert = true;
let activeUserId = 'owner-a';
let failStorageWrite = false;
let failActivity = false;
const activityIds = new Set<string>();
const mock = (request: string, exports: unknown) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
const binderKey = (row: { binder_id: string; card_id: string; set_id: string; language?: string | null }) => `${row.binder_id}:${row.set_id}:${row.card_id}:${row.language ?? 'en'}`;
const variantKey = (row: Record<string, unknown>) => [row.user_id, row.card_id, row.set_id, row.variant, row.condition, row.grade_company, row.grade].join(':');

mock('@react-native-async-storage/async-storage', {
  getItem: async (name: string) => values.get(name) ?? null,
  setItem: async (name: string, value: string) => { if (failStorageWrite) throw new Error('simulated storage failure'); values.set(name, value); },
  removeItem: async (name: string) => { values.delete(name); },
});
mock('../lib/binders', { fetchBinderById: async () => ({ id: 'binder-a', user_id: 'owner-a', language: 'en', default_condition: 'Near Mint' }), invalidateBinderCaches: () => undefined });
mock('../lib/pokemonTcg', { normalizePokemonCardLanguage: (value: unknown) => String(value ?? 'en').toLowerCase() });
mock('../lib/activity', {
  createActivityPost: async (_input: unknown, options: { expectedUserId: string; eventId: string }) => {
    assert.equal(options.expectedUserId, activeUserId);
    if (failActivity) return { status: 'failed', error: new Error('simulated activity failure') };
    activityIds.add(options.eventId);
    return { status: 'created', snapshotStored: true };
  },
});
const supabase = {
  auth: { getUser: async () => ({ data: { user: activeUserId ? { id: activeUserId } : null }, error: null }) },
  from: (table: string) => {
    if (table === 'binder_cards') return {
      select: () => ({ eq: async (_column: string, binderId: string) => ({ data: [...binderRows.values()].filter((row) => row.binder_id === binderId), error: null }) }),
      update: (next: any) => { const filters: Record<string, unknown> = {}; const query: any = { eq: (column: string, value: unknown) => { filters[column] = value; return query; }, is: (column: string, value: unknown) => { filters[column] = value; return query; } }; query.select = () => ({ maybeSingle: async () => { const row = [...binderRows.values()].find((candidate) => Object.entries(filters).every(([column, expected]) => candidate[column] === expected)); if (!row) return { data: null, error: null }; Object.assign(row, next); return { data: { id: row.id, card_id: row.card_id, owned: row.owned, owned_quantity: row.owned_quantity }, error: null }; } }); return query; },
      insert: (next: any) => ({ select: () => ({ single: async () => { const row = { ...next, id: `binder-${binderRows.size + 1}` }; binderRows.set(binderKey(row), row); return { data: { id: row.id, card_id: row.card_id, owned: row.owned, owned_quantity: row.owned_quantity }, error: null }; } }) }),
    };
    if (table === 'user_card_variants') {
      const filters: Record<string, unknown> = {};
      const query: any = { eq: (column: string, value: unknown) => { filters[column] = value; return query; } };
      query.select = () => query;
      query.maybeSingle = async () => { const quantity = variantRows.get(variantKey(filters)); return { data: quantity === undefined ? null : { quantity }, error: null }; };
      query.insert = (next: any) => ({ select: () => ({ single: async () => { if (failVariantInsert) return { data: null, error: new Error('simulated interruption') }; variantRows.set(variantKey(next), next.quantity); return { data: { quantity: next.quantity }, error: null }; } }) });
      return query;
    }
    throw new Error(`Unexpected table ${table}`);
  },
};
mock('../lib/supabase', { supabase });

async function run() {
  const input = {
    ownerUserId: 'owner-a', sourceSessionId: 'scan-result-100:add:holo', binderId: 'binder-a',
    cards: [{ cardId: 'card-a', setId: 'set-a', language: 'en', quantity: 1, cardName: 'Card A', imageUrl: 'https://assets.tcgdex.net/ja/sv/sv1/001/low.webp' }],
    variant: { userId: 'owner-a', cardId: 'card-a', setId: 'set-a', variant: 'holo', condition: 'Near Mint', gradeCompany: '', grade: '' },
  };
  const { saveScanCollectionVariant } = require('../lib/scanCollectionVariantSave') as typeof import('../lib/scanCollectionVariantSave');
  await assert.rejects(() => saveScanCollectionVariant({
    ...input,
    sourceSessionId: 'scan-result-100:add:mismatch',
    variant: { ...input.variant, cardId: 'other-card' },
  }), /does not match its card/);
  assert.equal(binderRows.size, 0, 'a mismatched finish is rejected before the binder write');
  failStorageWrite = true;
  await assert.rejects(() => saveScanCollectionVariant({ ...input, sourceSessionId: 'scan-result-100:add:storage' }), /simulated storage failure/);
  failStorageWrite = false;
  assert.equal(binderRows.size, 0, 'a recovery storage failure is rejected before the binder write');
  await assert.rejects(() => saveScanCollectionVariant(input), /simulated interruption/);
  assert.equal(binderRows.size, 1, 'the binder copy commits before the interrupted variant write');
  assert.equal(variantRows.size, 0);

  failVariantInsert = false;
  delete require.cache[require.resolve('../lib/collectionBatch')];
  delete require.cache[require.resolve('../lib/scanVariantOwnership')];
  delete require.cache[require.resolve('../lib/scanCollectionVariantSave')];
  const restarted = require('../lib/scanCollectionVariantSave') as typeof import('../lib/scanCollectionVariantSave');
  activeUserId = 'owner-b';
  await assert.rejects(() => restarted.listPendingScanCollectionVariants('owner-a'), /another account/);
  activeUserId = 'owner-a';
  const pending = await restarted.listPendingScanCollectionVariants('owner-a');
  assert.equal(pending.length, 1, 'the exact unfinished operation survives a fresh module load');
  assert.equal(pending[0].variant?.variant, 'holo');
  assert.equal(pending[0].cards[0].imageUrl, null, 'the durable composite intent strips controlled TCGdex references');
  assert.equal(JSON.stringify([...values.values()]).includes('assets.tcgdex.net'), false, 'the composite storage bucket contains no controlled provider URL');
  const [resumed, concurrentResume] = await Promise.all([
    restarted.resumePendingScanCollectionVariant('owner-a', pending[0].sourceSessionId),
    restarted.resumePendingScanCollectionVariant('owner-a', pending[0].sourceSessionId),
  ]);
  assert.equal(resumed.batch.replayed, true, 'a restarted composite save replays its successful binder batch');
  assert.equal(concurrentResume.batch.replayed, true, 'concurrent resume joins the same recovery operation');
  assert.equal(binderRows.size, 1, 'the replay must not add another binder copy');
  assert.equal(variantRows.get('owner-a:card-a:set-a:holo:Near Mint::'), 1, 'the exact selected finish resumes after restart');
  assert.equal([...binderRows.values()][0].image_url, null, 'the database batch receives the same sanitized image payload');
  assert.deepEqual(await restarted.listPendingScanCollectionVariants('owner-a'), [], 'the durable operation clears only after both writes succeed');
  assert.equal(activityIds.size, 1, 'a variant interruption and replay keep the same collection event identity');

  failActivity = true;
  const historyInput = {
    ...input,
    sourceSessionId: 'scan-result-101:add:holo',
    cards: [{ ...input.cards[0], cardId: 'card-b', cardName: 'Card B' }],
    variant: { ...input.variant, cardId: 'card-b' },
  };
  const historyFailed = await restarted.saveScanCollectionVariant(historyInput);
  assert.equal(historyFailed.batch.activityFailures, 1, 'history failure preserves collection and variant success');
  assert.equal(binderRows.get('binder-a:set-a:card-b:en').owned_quantity, 1);
  assert.equal(variantRows.get('owner-a:card-b:set-a:holo:Near Mint::'), 1);
  const historyPending = await restarted.listPendingScanCollectionVariants('owner-a');
  assert.equal(historyPending.length, 1, 'an activity failure retains the original recoverable operation');
  assert.equal(historyPending[0].historyOnly, true, 'the durable intent records that both holding writes are complete');
  binderRows.get('binder-a:set-a:card-b:en').owned_quantity = 5;
  binderRows.get('binder-a:set-a:card-b:en').notes = 'Later collector edit';
  variantRows.delete('owner-a:card-b:set-a:holo:Near Mint::');
  failActivity = false;
  delete require.cache[require.resolve('../lib/collectionBatch')];
  delete require.cache[require.resolve('../lib/scanCollectionVariantSave')];
  const historyRestarted = require('../lib/scanCollectionVariantSave') as typeof import('../lib/scanCollectionVariantSave');
  const historyRepaired = await historyRestarted.resumePendingScanCollectionVariant('owner-a', historyPending[0].sourceSessionId);
  assert.equal(historyRepaired.batch.replayed, true);
  assert.equal(historyRepaired.batch.activityFailures, undefined);
  assert.equal(binderRows.get('binder-a:set-a:card-b:en').owned_quantity, 5, 'history repair preserves a later binder quantity edit');
  assert.equal(binderRows.get('binder-a:set-a:card-b:en').notes, 'Later collector edit');
  assert.equal(variantRows.has('owner-a:card-b:set-a:holo:Near Mint::'), false, 'history repair must not restore a subsequently removed finish');
  assert.equal(activityIds.size, 2);
  assert.deepEqual(await historyRestarted.listPendingScanCollectionVariants('owner-a'), [], 'completed history repair clears the retained operation');
  values.set('stackr:scan-composite-save:v1:owner:owner-a', '{bad json');
  await assert.rejects(() => restarted.listPendingScanCollectionVariants('owner-a'), /could not be verified/);
  console.log('Scan composite save restart: owner-bound persistence, replay, exact variant recovery, activity repair and concurrency passed');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
