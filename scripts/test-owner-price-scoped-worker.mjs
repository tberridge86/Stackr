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

function database({ ownerRows = null, identifiers = null, catalogue = null, languageContext = null, languageContextError = null } = {}) {
  const reads = [];
  const rpcCalls = [];
  const tables = {
    'public.user_card_variants': ownerRows ?? [
      { ...saved, id: 'saved-normal', card_id: 'ja:S12a-146' },
      { ...saved, id: 'saved-holo', card_id: 'ja:S12a-005' },
      { ...saved, id: 'another-owner', user_id: otherOwner, card_id: 'ja:S12a-999' },
    ],
    'api.catalogue_external_identifiers': identifiers ?? [
      { source_entity_type: 'set', external_id: 'S12a', language_code: 'ja', set_id: setId },
      { source_entity_type: 'card', external_id: 'S12a-146', language_code: 'ja', variant_id: normalVariant },
      { source_entity_type: 'card', external_id: 'S12a-005', language_code: 'ja', variant_id: holoVariant },
      { source_entity_type: 'set', external_id: 'S12a', language_code: 'zh-tw', set_id: foreignSet },
      { source_entity_type: 'card', external_id: 'S12a-146', language_code: 'zh-tw', variant_id: foreignVariant },
    ],
    'api.catalogue_cards': catalogue ?? [
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
  return {
    reads,
    rpcCalls,
    from: (name) => from('public', name),
    schema: (schema) => ({
      from: (name) => from(schema, name),
      rpc: async (name, args) => {
        rpcCalls.push({ schema, name, args });
        return { data: languageContext, error: languageContextError };
      },
    }),
  };
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
  assert.equal(supabase.rpcCalls.length, 0, 'unrelated scoped identities do not read a private language snapshot');
});

test('active owner dry run carries only unanimous English binder context into the verified SV10 alias bridge', async () => {
  const sv10Set = '77777777-7777-4777-8777-777777777777';
  const sv10Variants = ['88888888-8888-4888-8888-888888888881', '88888888-8888-4888-8888-888888888882', '88888888-8888-4888-8888-888888888883'];
  const owned = ['001', '002', '010'].map((collector, index) => ({
    id: `sv10-owned-${collector}`, user_id: owner, card_id: `sv10-${collector}`, set_id: 'sv10', variant: 'normal', quantity: [3, 3, 2][index], condition: 'Near Mint', grade_company: '', grade: '',
  }));
  const supabase = database({
    ownerRows: [...owned, { ...owned[0], id: 'other-owner-row', user_id: otherOwner, card_id: 'sv10-999' }],
    identifiers: [{ source_entity_type: 'set', external_id: 'sv10', language_code: 'en', set_id: sv10Set }],
    catalogue: ['001', '002', '010'].flatMap((collector, index) => [
      { variant_id: sv10Variants[index], set_id: sv10Set, language_code: 'en', collector_number: collector, variant_code: 'normal', finish_code: 'normal' },
      { variant_id: `99999999-9999-4999-8999-99999999999${index}`, set_id: sv10Set, language_code: 'en', collector_number: collector, variant_code: 'reverse_holo', finish_code: 'reverse_holo' },
    ]),
    languageContext: {
      binders: [{ id: 'binder-en', user_id: owner, type: 'custom', language: 'en' }],
      binderCards: owned.map((row) => ({ id: `placement-${row.id}`, binder_id: 'binder-en', owned_card_variant_id: row.id, card_id: row.card_id, set_id: row.set_id, owned: true, owned_quantity: row.quantity })),
    },
  });
  let providerCalls = 0;
  const result = await runOwnerProviderRefresh({
    supabase, ownerId: owner, limit: 3, dryRun: true,
    refreshExactProviderEstimate: async () => { providerCalls += 1; },
  });
  assert.equal(result.scanned, 3, 'another owner cannot enter the scan');
  assert.equal(result.eligible, 3);
  assert.deepEqual(result.selectedVariantIds, sv10Variants);
  assert.equal(providerCalls, 0, 'dry run does not call the provider');
  assert.deepEqual(supabase.rpcCalls, [{ schema: 'api', name: 'collection_valuation_inputs', args: { p_owner: owner } }]);
});

test('active owner dry run refreshes only exact English holo and reverse-holo variants after binder language proof', async () => {
  const holo = 'abababab-abab-4bab-8bab-abababababab';
  const reverse = 'acacacac-acac-4cac-8cac-acacacacacac';
  const owned = [
    { id: 'owned-holo', user_id: owner, card_id: holo, set_id: setId, variant: 'holofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
    { id: 'owned-reverse', user_id: owner, card_id: reverse, set_id: setId, variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
  ];
  const supabase = database({
    ownerRows: owned,
    identifiers: [],
    catalogue: [
      { variant_id: holo, printing_id: printing, set_id: setId, language_code: 'en', variant_code: 'holo', finish_code: 'holo' },
      { variant_id: reverse, printing_id: printing, set_id: setId, language_code: 'en', variant_code: 'reverse_holo', finish_code: 'reverse_holo' },
      { variant_id: normalVariant, printing_id: printing, set_id: setId, language_code: 'en', variant_code: 'normal', finish_code: 'normal' },
    ],
    languageContext: {
      binders: [{ id: 'binder-en', user_id: owner, type: 'custom', language: 'en' }],
      binderCards: owned.map((row) => ({
        id: `placement-${row.id}`, binder_id: 'binder-en', owned_card_variant_id: row.id,
        card_id: row.card_id, set_id: row.set_id, owned: true, owned_quantity: 1,
      })),
    },
  });
  let providerCalls = 0;
  const result = await runOwnerProviderRefresh({
    supabase, ownerId: owner, limit: 2, dryRun: true,
    refreshExactProviderEstimate: async () => { providerCalls += 1; },
  });
  assert.equal(result.scanned, 2, 'the bounded owner scan must retain both saved finish identities');
  assert.equal(result.eligible, 2);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.selectedVariantIds, [holo, reverse], 'only the exact selected English finish variants are refreshable');
  assert.equal(providerCalls, 0, 'dry run never invokes a provider');
  assert.deepEqual(supabase.rpcCalls, [{ schema: 'api', name: 'collection_valuation_inputs', args: { p_owner: owner } }],
    'the worker may use only the owner-scoped binder snapshot to supply otherwise absent language');
});

test('disagreeing, missing, or failed language context fails closed without assigning English', async () => {
  const owned = { id: 'sv10-owned', user_id: owner, card_id: 'sv10-001', set_id: 'sv10', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
  const base = {
    ownerRows: [owned],
    identifiers: [{ source_entity_type: 'set', external_id: 'sv10', language_code: 'en', set_id: setId }],
    catalogue: [{ variant_id: normalVariant, set_id: setId, language_code: 'en', collector_number: '001', variant_code: 'normal', finish_code: 'normal' }],
  };
  const disagreement = database({ ...base, languageContext: {
    binders: [{ id: 'binder-en', user_id: owner, type: 'custom', language: 'en' }, { id: 'binder-ja', user_id: owner, type: 'custom', language: 'ja' }],
    binderCards: [
      { id: 'placement-en', binder_id: 'binder-en', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 },
      { id: 'placement-ja', binder_id: 'binder-ja', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 },
    ],
  } });
  const unresolved = await runOwnerProviderRefresh({ supabase: disagreement, ownerId: owner, limit: 1, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } });
  assert.deepEqual(unresolved.skipReasons, { unresolved_saved_card: 1 });
  assert.equal(unresolved.selected, 0);
  const failed = database({ ...base, languageContextError: new Error('snapshot unavailable') });
  await assert.rejects(
    runOwnerProviderRefresh({ supabase: failed, ownerId: owner, limit: 1, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } }),
    /snapshot unavailable/,
  );
});

test('conflicting explicit language prefixes are refused before any context lookup', async () => {
  const conflicted = { id: 'conflicted', user_id: owner, card_id: 'en:sv10-001', set_id: 'ja:sv10', variant: 'holofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
  const supabase = database({ ownerRows: [conflicted] });
  const result = await runOwnerProviderRefresh({ supabase, ownerId: owner, limit: 1, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } });
  assert.deepEqual(result.skipReasons, { ambiguous_saved_identity: 1 });
  assert.equal(supabase.rpcCalls.length, 0);
});

test('explicit English prefixes permit only the exact saved holo and reverse finishes without a binder snapshot', async () => {
  const prefixSet = '76767676-7676-4676-8676-767676767676';
  const prefixHolo = '78787878-7878-4878-8878-787878787878';
  const prefixReverse = '79797979-7979-4979-8979-797979797979';
  const owned = [
    { id: 'prefix-holo', user_id: owner, card_id: 'en:prefix-holo', set_id: 'en:prefix-set', variant: 'holofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
    { id: 'prefix-reverse', user_id: owner, card_id: 'en:prefix-reverse', set_id: 'en:prefix-set', variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
  ];
  const supabase = database({
    ownerRows: owned,
    identifiers: [
      { source_entity_type: 'set', external_id: 'prefix-set', language_code: 'en', set_id: prefixSet },
      { source_entity_type: 'card', external_id: 'prefix-holo', language_code: 'en', set_id: prefixSet, variant_id: prefixHolo },
      { source_entity_type: 'card', external_id: 'prefix-reverse', language_code: 'en', set_id: prefixSet, variant_id: prefixReverse },
    ],
    catalogue: [
      { variant_id: prefixHolo, printing_id: printing, set_id: prefixSet, language_code: 'en', variant_code: 'holo', finish_code: 'holo' },
      { variant_id: prefixReverse, printing_id: printing, set_id: prefixSet, language_code: 'en', variant_code: 'reverse_holo', finish_code: 'reverse_holo' },
      { variant_id: normalVariant, printing_id: printing, set_id: prefixSet, language_code: 'en', variant_code: 'normal', finish_code: 'normal' },
    ],
  });
  const result = await runOwnerProviderRefresh({
    supabase, ownerId: owner, limit: 2, dryRun: true,
    refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); },
  });
  assert.equal(result.eligible, 2);
  assert.deepEqual(result.selectedVariantIds, [prefixHolo, prefixReverse]);
  assert.equal(supabase.rpcCalls.length, 0, 'explicit en: evidence must not read a binder snapshot');
});

test('an unbound verified ME pair needs one English printing-only alias and an exact published finish', async () => {
  const meSet = '89898989-8989-4989-8989-898989898989';
  const mePrinting = '8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a';
  const meReverse = '8b8b8b8b-8b8b-4b8b-8b8b-8b8b8b8b8b8b';
  const owned = { id: 'me-reverse', user_id: owner, card_id: 'me4-068', set_id: 'me4', variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
  const supabase = database({
    ownerRows: [owned],
    identifiers: [
      { source_entity_type: 'set', external_id: 'me4', language_code: 'en', set_id: meSet },
      { source_entity_type: 'set', external_id: 'me04', language_code: 'en', set_id: meSet },
      { source_entity_type: 'card', external_id: 'me4-068', language_code: 'en', set_id: meSet, printing_id: mePrinting, variant_id: null },
    ],
    catalogue: [
      { variant_id: meReverse, printing_id: mePrinting, set_id: meSet, language_code: 'en', collector_number: '068', variant_code: 'reverse_holo', finish_code: 'reverse_holo' },
      { variant_id: normalVariant, printing_id: mePrinting, set_id: meSet, language_code: 'en', collector_number: '068', variant_code: 'normal', finish_code: 'normal' },
    ],
    languageContext: { binders: [], binderCards: [] },
  });
  const result = await runOwnerProviderRefresh({
    supabase, ownerId: owner, limit: 1, dryRun: true,
    refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); },
  });
  assert.equal(result.eligible, 1);
  assert.deepEqual(result.selectedVariantIds, [meReverse]);
  assert.deepEqual(supabase.rpcCalls, [{ schema: 'api', name: 'collection_valuation_inputs', args: { p_owner: owner } }]);
  const legacyRead = supabase.reads.find((read) => read.table === 'api.catalogue_cards'
    && read.filters.some(([operation, column, value]) => operation === 'eq' && column === 'set_id' && value === meSet));
  assert(legacyRead, 'the verified ME resolution must read its one published English set');
  assert(legacyRead.columns.includes('printing_id'), 'the ME printing guard must receive the production projection');
});

test('a projected ME catalogue row without its printing ID cannot resolve a physical finish', async () => {
  const meSet = '92929292-9292-4292-8292-929292929292';
  const mePrinting = '93939393-9393-4393-8393-939393939393';
  const meReverse = '94949494-9494-4494-8494-949494949494';
  const owned = { id: 'me-no-printing', user_id: owner, card_id: 'me4-068', set_id: 'me4', variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
  const supabase = database({
    ownerRows: [owned],
    identifiers: [
      { source_entity_type: 'set', external_id: 'me4', language_code: 'en', set_id: meSet },
      { source_entity_type: 'card', external_id: 'me4-068', language_code: 'en', set_id: meSet, printing_id: mePrinting, variant_id: null },
    ],
    catalogue: [{ variant_id: meReverse, set_id: meSet, language_code: 'en', collector_number: '068', variant_code: 'reverse_holo', finish_code: 'reverse_holo' }],
    languageContext: { binders: [], binderCards: [] },
  });
  const result = await runOwnerProviderRefresh({ supabase, ownerId: owner, limit: 1, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } });
  assert.equal(result.selected, 0);
  assert.deepEqual(result.skipReasons, { unsupported_or_unpublished_variant: 1 });
});

test('ME finish inference fails closed for foreign, missing, or conflicting binder language evidence', async () => {
  const meSet = '8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c';
  const mePrinting = '8d8d8d8d-8d8d-4d8d-8d8d-8d8d8d8d8d8d';
  const meReverse = '8e8e8e8e-8e8e-4e8e-8e8e-8e8e8e8e8e8e';
  const owned = { id: 'me-context', user_id: owner, card_id: 'me4-068', set_id: 'me4', variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
  const base = {
    ownerRows: [owned],
    identifiers: [
      { source_entity_type: 'set', external_id: 'me4', language_code: 'en', set_id: meSet },
      { source_entity_type: 'card', external_id: 'me4-068', language_code: 'en', set_id: meSet, printing_id: mePrinting, variant_id: null },
    ],
    catalogue: [{ variant_id: meReverse, printing_id: mePrinting, set_id: meSet, language_code: 'en', collector_number: '068', variant_code: 'reverse_holo', finish_code: 'reverse_holo' }],
  };
  const contexts = [
    { label: 'foreign', binders: [{ id: 'binder-ja', user_id: owner, type: 'custom', language: 'ja' }], binderCards: [{ id: 'placement', binder_id: 'binder-ja', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 }] },
    { label: 'missing', binders: [{ id: 'binder-empty', user_id: owner, type: 'custom', language: '' }], binderCards: [{ id: 'placement', binder_id: 'binder-empty', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 }] },
    { label: 'conflicting', binders: [{ id: 'binder-en', user_id: owner, type: 'custom', language: 'en' }, { id: 'binder-ja', user_id: owner, type: 'custom', language: 'ja' }], binderCards: [{ id: 'placement-en', binder_id: 'binder-en', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 }, { id: 'placement-ja', binder_id: 'binder-ja', owned_card_variant_id: owned.id, card_id: owned.card_id, set_id: owned.set_id, owned: true, owned_quantity: 1 }] },
  ];
  for (const { label, ...languageContext } of contexts) {
    const supabase = database({ ...base, languageContext });
    const result = await runOwnerProviderRefresh({ supabase, ownerId: owner, limit: 1, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } });
    assert.equal(result.selected, 0, `${label} binder evidence must not infer English`);
    assert.deepEqual(result.skipReasons, { non_normal_saved_variant: 1 }, `${label} binder evidence must fail closed`);
    assert.equal(supabase.rpcCalls.length, 1, `${label} evidence must be inspected before refusing`);
  }
});

test('English non-normal rows reject a normal sibling and generic printing-only aliases', async () => {
  const guardSet = '8f8f8f8f-8f8f-4f8f-8f8f-8f8f8f8f8f8f';
  const guardPrinting = '90909090-9090-4090-8090-909090909090';
  const normalOnly = '91919191-9191-4191-8191-919191919191';
  const owned = [
    { id: 'normal-sibling', user_id: owner, card_id: 'en:normal-only', set_id: 'en:guard-set', variant: 'holofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
    { id: 'printing-only', user_id: owner, card_id: 'en:printing-only', set_id: 'en:guard-set', variant: 'reverseHolofoil', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' },
  ];
  const supabase = database({
    ownerRows: owned,
    identifiers: [
      { source_entity_type: 'set', external_id: 'guard-set', language_code: 'en', set_id: guardSet },
      { source_entity_type: 'card', external_id: 'normal-only', language_code: 'en', set_id: guardSet, variant_id: normalOnly },
      { source_entity_type: 'card', external_id: 'printing-only', language_code: 'en', set_id: guardSet, printing_id: guardPrinting, variant_id: null },
    ],
    catalogue: [{ variant_id: normalOnly, printing_id: guardPrinting, set_id: guardSet, language_code: 'en', variant_code: 'normal', finish_code: 'normal' }],
  });
  const result = await runOwnerProviderRefresh({ supabase, ownerId: owner, limit: 2, dryRun: true, refreshExactProviderEstimate: async () => { throw new Error('provider must not run'); } });
  assert.equal(result.selected, 0);
  assert.deepEqual(result.skipReasons, { unsupported_or_unpublished_variant: 2 });
  assert.equal(supabase.rpcCalls.length, 0, 'explicit English evidence does not require binder context');
});
