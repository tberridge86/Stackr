import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const values = new Map<string, string>();
const binderRows = new Map<string, any>();
const variantRows = new Map<string, number>();
let failVariantInsert = true;
const mock = (request: string, exports: unknown) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
const binderKey = (row: { binder_id: string; card_id: string; set_id: string; language?: string | null }) => `${row.binder_id}:${row.set_id}:${row.card_id}:${row.language ?? 'en'}`;
const variantKey = (row: Record<string, unknown>) => [row.user_id, row.card_id, row.set_id, row.variant, row.condition, row.grade_company, row.grade].join(':');

mock('@react-native-async-storage/async-storage', {
  getItem: async (name: string) => values.get(name) ?? null,
  setItem: async (name: string, value: string) => { values.set(name, value); },
  removeItem: async (name: string) => { values.delete(name); },
});
mock('../lib/binders', { fetchBinderById: async () => ({ id: 'binder-a', user_id: 'owner-a', language: 'en', default_condition: 'Near Mint' }), invalidateBinderCaches: () => undefined });
mock('../lib/pokemonTcg', { normalizePokemonCardLanguage: (value: unknown) => String(value ?? 'en').toLowerCase() });
mock('../lib/tcgdexControlledCardReference', { stripTcgdexReferenceBeforePersistence: (value: unknown) => value, preserveExistingImageUrlBeforePersistence: (next: unknown, existing: unknown) => existing ?? next ?? null });
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }) },
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
    sourceSessionId: 'scan-result-100:add:holo', binderId: 'binder-a',
    cards: [{ cardId: 'card-a', setId: 'set-a', language: 'en', quantity: 1, cardName: 'Card A' }],
    variant: { userId: 'owner-a', cardId: 'card-a', setId: 'set-a', variant: 'holo', condition: 'Near Mint', gradeCompany: '', grade: '' },
  };
  const { saveScanCollectionVariant } = require('../lib/scanCollectionVariantSave') as typeof import('../lib/scanCollectionVariantSave');
  await assert.rejects(() => saveScanCollectionVariant(input), /simulated interruption/);
  assert.equal(binderRows.size, 1, 'the binder copy commits before the interrupted variant write');
  assert.equal(variantRows.size, 0);

  failVariantInsert = false;
  delete require.cache[require.resolve('../lib/collectionBatch')];
  delete require.cache[require.resolve('../lib/scanVariantOwnership')];
  delete require.cache[require.resolve('../lib/scanCollectionVariantSave')];
  const restarted = require('../lib/scanCollectionVariantSave') as typeof import('../lib/scanCollectionVariantSave');
  const resumed = await restarted.saveScanCollectionVariant(input);
  assert.equal(resumed.batch.replayed, true, 'a restarted composite save replays its successful binder batch');
  assert.equal(binderRows.size, 1, 'the replay must not add another binder copy');
  assert.equal(variantRows.get('owner-a:card-a:set-a:holo:Near Mint::'), 1, 'the exact selected finish resumes after restart');
  console.log('Scan composite save restart: binder replay and exact variant recovery passed');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });