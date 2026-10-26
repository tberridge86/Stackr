import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCollectionSummaryDatabase, explainCollectionSummary } from './test-fixtures/collection-summary-db.mjs';

const { db, userA: ownerA, userB: ownerB, id, binder, owned, saved, card, add, asUser, clear } = await createCollectionSummaryDatabase();
let responseCount = 0;
async function read(overrides = []) {
  const response = await db.query('select public.collection_summary_v1($1::uuid[]) result', [overrides]);
  responseCount += 1;
  assert.equal(response.rows.length, 1, 'one scalar response, independent of collection size');
  return response.rows[0].result;
}
function reconcile(value) {
  assert.equal(value.schemaVersion, 'collection-summary-v1');
  assert.equal(value.subjectUserId, ownerA);
  assert.equal(value.totalCardsOwned, value.rawCardsOwned + value.gradedSlabsOwned);
  assert.equal(value.totalOwnedItems, value.totalCardsOwned + value.sealedProductsOwned);
  assert.equal(value.valuation.totalUnits, value.totalOwnedItems);
  assert.equal(value.valuation.pricedUnits + value.valuation.unpricedUnits, value.totalOwnedItems);
  assert.equal(value.valuation.unsupportedUnits + value.valuation.missingPriceUnits, value.valuation.unpricedUnits);
  assert.equal(value.valuation.freshness, 'unknown');
  assert.equal(value.valuation.basis, 'stored_tcg_raw_estimate');
  assert.equal(value.valuation.currency, 'GBP');
  assert.equal(value.valuation.usdToGbp, 0.79);
  assert.ok(Number.isFinite(Date.parse(value.updatedAt)));
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 1400, 'aggregate never embeds owned rows, metadata or images');
}

try {
  const signature = 'public.collection_summary_v1(uuid[])';
  assert.equal((await db.query('select prosecdef from pg_proc where oid=$1::regprocedure', [signature])).rows[0].prosecdef, false);
  for (const role of ['anon', 'service_role']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed', [role, signature])).rows[0].allowed, false);
    await db.exec('set role ' + role);
    await assert.rejects(read(), /permission denied/);
    await db.exec('reset role');
  }
  assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed", [signature])).rows[0].allowed, true);
  await asUser('');
  await assert.rejects(read(), /Sign in/);
  await asUser();
  await assert.rejects(read(null), /at most 10000/);
  await assert.rejects(read(Array.from({ length: 10001 }, () => id(1))), /at most 10000/);
  await assert.rejects(db.query('select public.collection_summary_v1(p_owner := $1::uuid)', [ownerB]), /does not exist/);
  let value = await read();
  reconcile(value);
  assert.equal(value.totalOwnedItems, 0);
  assert.equal(value.collectionValue, 0);
  assert.equal(value.valuation.state, 'empty');

  await clear();
  await add('binders', [binder(1), binder(2, { card_mode: 'graded', edition: '1st_edition' }),
    binder(3, { user_id: ownerB, is_public: true }), binder(4, { user_id: ownerB, is_public: false })]);
  await add('user_card_variants', [owned(20, '38', { quantity: 2 }), owned(21, '38', { grade_company: 'PSA', grade: '9' }),
    owned(22, 'foreign', { user_id: ownerB, quantity: 9000 })]);
  const duplicated = [
    saved(30, id(1), '38', { owned_quantity: 8, slot_order: 0 }),
    saved(31, id(2), '39', { owned_quantity: 3, slot_order: 1 }),
    ...Array.from({ length: 1001 }, (_, n) => saved(100 + n, id(1), 'page-card', { slot_order: n + 2 })),
  ];
  await add('binder_cards', [...duplicated, saved(1200, id(3), 'foreign', { owned_quantity: 8000 }),
    saved(1201, id(4), 'hidden', { owned_quantity: 7000 })]);
  await add('pokemon_cards', [card('38'), card('39', { '1stEditionNormal': { market: 20 }, normal: { market: 1 } }),
    card('page-card', { normal: { market: 2 } }), card('foreign'), card('hidden')]);
  await add('pokemon_sets', [{ id: 'base3', printed_total: 3, total: 3 }]);
  await asUser();
  assert.equal((await db.query('select count(*) count from public.binders')).rows[0].count, 3, 'fixture really permits another owner public binder');
  assert.equal((await db.query("select count(*) count from public.binder_cards where card_id='foreign'")).rows[0].count, 1);
  const beforeResponses = responseCount;
  value = await read([id(3)]);
  reconcile(value);
  assert.equal(responseCount - beforeResponses, 1);
  assert.equal(value.totalOwnedItems, 7);
  assert.equal(value.rawCardsOwned, 3);
  assert.equal(value.gradedSlabsOwned, 4);
  assert.equal(value.uniqueCards, 3);
  assert.equal(value.duplicateCopies, 3);
  assert.equal(value.binderCount, 2);
  assert.equal(value.completedSets, 1);
  assert.equal(value.collectionValue, 17.38, 'raw estimates never become slab values');
  assert.deepEqual([value.valuation.pricedUnits, value.valuation.unpricedUnits, value.valuation.unsupportedUnits], [3, 4, 4]);
  assert.equal(value.valuation.state, 'partial');
  const duplicateBytes = Buffer.byteLength(JSON.stringify(value));
  await asUser(ownerB);
  const other = await read();
  assert.equal(other.subjectUserId, ownerB);
  assert.equal(other.binderCount, 2);
  assert.equal(other.totalOwnedItems, 16000, 'other account receives only its own holdings');

  await clear();
  await add('binders', [binder(1, { source_set_id: 'en:bulk' })]);
  const distinct = Array.from({ length: 1003 }, (_, n) => saved(2000 + n, id(1), 'bulk-' + n, { set_id: 'en:bulk' }));
  await add('binder_cards', distinct);
  await add('pokemon_cards', distinct.map((row) => card(row.card_id, { normal: { market: 1 } }, { set_id: row.set_id })));
  await add('pokemon_sets', [{ id: 'en:bulk', printed_total: 1003, total: 1003 }]);
  await asUser();
  value = await read();
  reconcile(value);
  assert.equal(value.totalOwnedItems, 1003);
  assert.equal(value.uniqueCards, 1003);
  assert.equal(value.collectionValue, 792.37);
  assert.equal(value.completedSets, 1);
  assert.equal(value.valuation.pricedUnits, 1003, 'last distinct identity beyond old page 50 is retained');
  const distinctBytes = Buffer.byteLength(JSON.stringify(value));
  const explained = await explainCollectionSummary(db, ownerA);
  assert.equal(explained.Plan['Actual Rows'], 1, 'the exact aggregate statement plans as one complete response');
  assert.ok(Number.isFinite(explained['Execution Time']));

  await clear();
  const rows = [
    owned(1, 'en:001', { set_id: 'en:set' }),
    owned(2, 'ja:001', { set_id: 'ja:set' }),
    owned(3, 'ko:001', { set_id: 'ko:set' }),
    owned(4, 'zh-tw:001', { set_id: 'zh-tw:set' }),
    owned(5, 'zh-cn:001', { set_id: 'zh-cn:set' }),
    owned(6, 'same-id', { set_id: 'ja:set' }),
    owned(7, 'unknown-variant', { variant: 'reverseHolofoil' }),
    owned(8, 'zero'), owned(9, 'missing'), owned(10, 'worn', { condition: 'Played' }),
    owned(11, 'negative'), owned(12, 'bad-string'), owned(13, 'unknown-language'),
  ];
  await add('user_card_variants', rows);
  await add('pokemon_cards', [
    ...['en', 'ja', 'ko', 'zh-tw', 'zh-cn'].map((language) => card(language + ':001',
      { normal: { market: 10 } }, { set_id: language + ':set', language })),
    card('same-id', { normal: { market: 999 } }, { set_id: 'en:set' }),
    card('unknown-variant'), card('zero', { normal: { market: 0 } }), card('missing', {}),
    card('worn'), card('negative', { normal: { market: -1 } }), card('bad-string', { normal: { market: '100' } }),
    card('unknown-language', { normal: { market: 99 } }, { language: 'unknown' }),
  ]);
  await asUser();
  value = await read();
  reconcile(value);
  assert.equal(value.uniqueCards, 13);
  assert.equal(value.collectionValue, 39.5, 'five verified language identities plus a known zero; no borrowed set or finish price');
  assert.deepEqual([value.valuation.pricedUnits, value.valuation.missingPriceUnits, value.valuation.unsupportedUnits], [6, 6, 1]);

  await clear();
  await add('binders', [binder(1, { edition: '1st_edition' }), binder(2, { edition: null }),
    binder(3, { language: 'ja' }), binder(4, { edition: 'unknown' }), binder(5, { default_condition: 'Played' })]);
  await add('binder_cards', [
    saved(11, id(1), 'first'), saved(12, id(1), 'ambiguous-first'), saved(13, id(2), 'ambiguous-edition'),
    saved(14, id(3), 'language-conflict'), saved(15, id(4), 'edition-unknown'), saved(16, id(5), 'binder-worn', { condition: '' }),
  ]);
  await add('pokemon_cards', [
    card('first', { normal: { market: 1 }, '1stEditionNormal': { market: 20 } }),
    card('ambiguous-first', { '1stEditionNormal': { market: 20 }, '1stEditionHolofoil': { market: 50 } }),
    card('ambiguous-edition', { normal: { market: 1 }, '1stEditionNormal': { market: 20 } }),
    card('language-conflict'), card('edition-unknown'), card('binder-worn'),
  ]);
  await asUser();
  value = await read();
  reconcile(value);
  assert.equal(value.collectionValue, 15.8, 'explicit RAW first edition preserves only its proven edition entry');
  assert.deepEqual([value.valuation.pricedUnits, value.valuation.missingPriceUnits, value.valuation.unsupportedUnits], [1, 4, 1]);
  await db.exec('reset role; update public.pokemon_cards set raw_data=\'{}\'; update public.binder_cards set tcg_price=500');
  await asUser();
  value = await read();
  assert.equal(value.collectionValue, null, 'unknown collection value is never invented as zero');
  assert.equal(value.valuation.state, 'unavailable');

  await clear();
  await add('binders', [binder(1, { source_set_id: 'ja:master', language: 'ja' })]);
  await add('pokemon_sets', [{ id: 'ja:master', printed_total: 2, total: 2 }]);
  await add('pokemon_cards', [card('ja:a', { normal: {}, holofoil: {} }, { set_id: 'ja:master', language: 'ja' }),
    card('ja:b', {}, { set_id: 'ja:master', language: 'ja' })]);
  await add('user_card_variants', [owned(10, 'ja:a', { set_id: 'ja:master' }), owned(11, 'ja:b', { set_id: 'ja:master' })]);
  await asUser();
  assert.equal((await read()).completedSets, 1);
  assert.equal((await read([id(1)])).completedSets, 0, 'local true master override retains missing parallel identity');
  await db.exec("reset role; update public.binders set master_set_enabled=true");
  await asUser();
  assert.equal((await read()).completedSets, 0, 'server true cannot be disabled by absent local override');
  await db.exec('reset role');
  await add('user_card_variants', [owned(12, 'ja:a', { set_id: 'ja:master', variant: 'holofoil' })]);
  await asUser();
  assert.equal((await read()).completedSets, 1);


  await clear();
  await add('binders', [binder(1, { card_mode: null }), binder(2)]);
  await add('binder_cards', [saved(10, id(1), 'same-raw', { owned_quantity: 2, slot_order: 0 }),
    saved(11, id(2), 'same-raw', { owned_quantity: 99, slot_order: 1 })]);
  await add('pokemon_cards', [card('same-raw')]);
  await asUser();
  value = await read();
  assert.equal(value.totalOwnedItems, 2, 'null and raw binder modes deduplicate as the same physical mode');
  assert.equal(value.rawCardsOwned, 2);

  await clear();
  const roundedCards = Array.from({ length: 21 }, (_, n) => card('round-' + n, { normal: { market: n + 0.5 } }));
  await add('pokemon_cards', roundedCards);
  await add('user_card_variants', roundedCards.map((row, n) => owned(10 + n, row.id, { condition: n % 2 ? 'near-mint' : 'raw_near_mint' })));
  await asUser();
  value = await read();
  assert.equal(value.collectionValue, 174.30, 'USD half-cent boundaries round each .79-converted unit before summing');
  assert.equal(value.valuation.pricedUnits, 21);


  await clear();
  await add('binders', Array.from({ length: 51 }, (_, n) => binder(n + 1, { sort_order: n === 50 ? -1 : n })));
  await add('binder_cards', [
    saved(100, id(50), 'chunk-boundary', { owned_quantity: 99, slot_order: 0 }),
    saved(101, id(51), 'chunk-boundary', { owned_quantity: 2, slot_order: 100 }),
  ]);
  await add('pokemon_cards', [card('chunk-boundary')]);
  await asUser();
  value = await read();
  assert.equal(value.binderCount, 51);
  assert.equal(value.totalOwnedItems, 2, 'sort_order selects the first legacy 50-binder chunk before slot/id placement order');
  assert.equal(value.collectionValue, 15.8);

  await clear();
  await add('binders', [binder(1, { source_set_id: 'en:master', master_set_enabled: true })]);
  await add('pokemon_sets', [{ id: 'en:master', printed_total: 1, total: 1 }]);
  await add('pokemon_cards', [card('en:a', { normal: { market: 1 }, holofoil: { market: 2 } }, { set_id: 'en:master' })]);
  await add('user_card_variants', [owned(10, 'en:a', { set_id: 'en:master', variant: '' }),
    owned(11, 'en:a', { set_id: 'en:master', variant: 'holofoil' })]);
  await asUser();
  value = await read();
  assert.equal(value.completedSets, 1, 'legacy empty owned variants normalize to normal for master completion as well as prices');
  assert.equal(value.collectionValue, 2.37);

  console.log(JSON.stringify({ check: 'collection-summary-sql', engine: 'PGlite PostgreSQL',
    cohorts: { duplicateSavedRows: { rows: 1003, priorSavedPageResponses: 22, aggregateResponses: 1, responseBytes: duplicateBytes },
      distinctOwnedRows: { rows: 1003, aggregateResponses: 1, responseBytes: distinctBytes } },
    syntheticExplain: { format: 'ANALYZE, BUFFERS, JSON', resultRows: explained.Plan['Actual Rows'], localExecutionMs: explained['Execution Time'] },
    verified: ['real SQL/RLS/privileges', 'owner-only despite public binder visibility', 'complete deduplicated counts',
      'raw exact edition/variant/language estimates', 'graded and condition coverage', 'known zero versus unavailable',
      'master completion and local override'], liveLatency: 'unmeasured' }));
} finally {
  await db.close();
}
