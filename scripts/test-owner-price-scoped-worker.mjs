import assert from 'node:assert/strict';
import test from 'node:test';
import { runOwnerProviderRefresh } from './refresh-owner-provider-prices.mjs';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const setId = '11111111-1111-4111-8111-111111111111';
const normalVariant = '22222222-2222-4222-8222-222222222222';
const holoVariant = '33333333-3333-4333-8333-333333333333';
const foreignSet = '44444444-4444-4444-8444-444444444444';
const foreignVariant = '55555555-5555-4555-8555-555555555555';
const printing = '66666666-6666-4666-8666-666666666666';
const saved = { user_id: owner, set_id: 'ja:S12a', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
const catalogueBase = { set_id: setId, language_code: 'ja', variant_code: 'normal', finish_code: 'normal' };

function database() {
  const reads = [];
  const tables = {
    'public.user_card_variants': [
      { ...saved, id: 'saved-normal', card_id: 'ja:S12a-146' },
      { ...saved, id: 'saved-holo', card_id: 'ja:S12a-005' },
      { ...saved, id: 'another-owner', user_id: otherOwner, card_id: 'ja:S12a-999' },
    ],
    'api.catalogue_external_identifiers': [
      { source_entity_type: 'set', external_id: 'S12a', language_code: 'ja', set_id: setId },
      { source_entity_type: 'card', external_id: 'S12a-146', language_code: 'ja', variant_id: normalVariant },
      { source_entity_type: 'card', external_id: 'S12a-005', language_code: 'ja', variant_id: holoVariant },
      { source_entity_type: 'set', external_id: 'S12a', language_code: 'zh-tw', set_id: foreignSet },
      { source_entity_type: 'card', external_id: 'S12a-146', language_code: 'zh-tw', variant_id: foreignVariant },
    ],
    'api.catalogue_cards': [
      { ...catalogueBase, variant_id: normalVariant, printing_id: printing },
      { ...catalogueBase, variant_id: holoVariant, variant_code: 'holo', finish_code: 'holo' },
      { ...catalogueBase, set_id: foreignSet, variant_id: foreignVariant, language_code: 'zh-tw' },
    ],
    'public.market_price_snapshots': [],
  };
  const from = (schema, name) => {
    const table = `${schema}.${name}`;
    assert(table in tables, `unexpected table: ${table}`);
    const read = { table, filters: [] };
    reads.push(read);
    let rows = tables[table];
    let maximum = Infinity;
    const chain = {
      select(columns) { read.columns = columns.split(','); return chain; },
      eq(column, value) { read.filters.push(['eq', column, value]); rows = rows.filter((row) => row[column] === value); return chain; },
      gt(column, value) { rows = rows.filter((row) => row[column] > value); return chain; },
      is(column, value) { rows = rows.filter((row) => (row[column] ?? null) === value); return chain; },
      in(column, values) { read.filters.push(['in', column, values]); rows = rows.filter((row) => values.includes(row[column])); return chain; },
      order() { return chain; },
      limit(value) { maximum = value; return chain; },
      then(resolve, reject) { return Promise.resolve({ data: rows.slice(0, maximum).map((row) => Object.fromEntries(read.columns.map((column) => [column, row[column]]))), error: null }).then(resolve, reject); },
    };
    // No insert/update/rpc methods: an unexpected write cannot pass silently.
    return chain;
  };
  return { reads, from: (name) => from('public', name), schema: (schema) => ({ from: (name) => from(schema, name) }) };
}

test('actual owner worker resolves scoped saved IDs with filter-aware reads and no provider calls in dry run', async () => {
  const supabase = database();
  let providerCalls = 0;
  const result = await runOwnerProviderRefresh({
    supabase, ownerId: owner, limit: 3, dryRun: true,
    refreshExactProviderEstimate: async () => { providerCalls += 1; throw new Error('unexpected provider call'); },
  });
  assert.equal(result.scanned, 2, 'another owner must not enter the cohort');
  assert.equal(result.eligible, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.skipReasons, { unsupported_or_unpublished_variant: 1 });
  assert.deepEqual(result.selectedVariantIds, [normalVariant]);
  assert.equal(result.refreshed, 0);
  assert.equal(providerCalls, 0);
  const identifiers = supabase.reads.find((read) => read.table === 'api.catalogue_external_identifiers');
  const refs = identifiers.filters.find(([operation]) => operation === 'in')[2];
  for (const reference of ['ja:S12a', 'S12a', 'ja:S12a-146', 'S12a-146']) assert(refs.includes(reference));
  assert(!refs.includes('S12a-999'));
  assert(supabase.reads[0].filters.some(([operation, column, value]) => operation === 'eq' && column === 'user_id' && value === owner));
});
