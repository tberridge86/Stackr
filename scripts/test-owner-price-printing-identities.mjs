import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveOwnedProviderVariant } from './lib/owner-provider-price-refresh-core.mjs';
import { readOwnerPrintingCatalogue } from './lib/owner-price-printing-identities.mjs';

// Synthetic contract fixtures, not production holdings or price evidence.
const printing = '11111111-1111-4111-8111-111111111111';
const variant = '22222222-2222-4222-8222-222222222222';
const set = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const owned = { card_id: 'provider-card', set_id: 'provider-set', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
const setAlias = { source_entity_type: 'set', external_id: 'provider-set', set_id: set, language_code: 'en' };
const cardAlias = { source_entity_type: 'card', external_id: 'provider-card', set_id: set, printing_id: printing, variant_id: null, language_code: 'en' };
const card = { variant_id: variant, printing_id: printing, set_id: set, language_code: 'en', collector_number: '001', variant_code: 'normal', finish_code: 'normal' };
const resolve = (row = owned, aliases = [setAlias, cardAlias], cards = [card]) => resolveOwnedProviderVariant(row, aliases, cards);
const exact = { ok: true, variantId: variant };

test('printing-only published card alias resolves its exact normal variant', () => {
  assert.deepEqual(resolve(), exact);
});
test('saved canonical printing UUID resolves without pretending it is a variant UUID', () => {
  assert.deepEqual(resolve({ ...owned, card_id: printing, set_id: set }, []), exact);
});
test('existing canonical variant UUID path remains supported', () => {
  assert.deepEqual(resolve({ ...owned, card_id: variant, set_id: set }, []), exact);
});
test('explicit published variant alias remains supported', () => {
  assert.deepEqual(resolve(owned, [setAlias, { ...cardAlias, variant_id: variant }]), exact);
});
test('duplicate printing references do not manufacture ambiguity', () => {
  assert.deepEqual(resolve(owned, [setAlias, cardAlias, { ...cardAlias }], [card, { ...card }]), exact);
});
test('a printing with two eligible normal variants remains ambiguous', () => {
  assert.equal(resolve(owned, undefined, [card, { ...card, variant_id: other }]).reason, 'ambiguous_saved_identity');
});
test('a different-language printing cannot satisfy an English provider alias', () => {
  assert.equal(resolve(owned, undefined, [{ ...card, language_code: 'ja' }]).ok, false);
});
test('a different saved set cannot receive the price', () => {
  assert.equal(resolve({ ...owned, set_id: other }).ok, false);
});
test('a contradictory alias set is rejected even when the saved set matches', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, set_id: other }]).ok, false);
});
test('a contradictory explicit-variant printing is rejected', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, variant_id: variant, printing_id: other }]).ok, false);
});
test('an explicit holo alias never broadens to its printing normal sibling', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, variant_id: other }], [card, { ...card, variant_id: other, finish_code: 'holo' }]).ok, false);
});
test('an unpublished explicit variant never broadens to its printing', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, variant_id: other }]).ok, false);
});
test('a malformed explicit variant never broadens to its printing', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, variant_id: 'bad-uuid' }]).ok, false);
});
test('printing-only matching requires an explicitly normal physical finish', () => {
  for (const finish_code of ['holo', 'reverse_holo', '', null, 'master_ball']) {
    assert.equal(resolve(owned, undefined, [{ ...card, finish_code }]).ok, false);
  }
});
test('normal/non_holo is a supported attested printing finish', () => {
  assert.deepEqual(resolve(owned, undefined, [{ ...card, finish_code: 'non_holo' }]), exact);
});
test('saved reverse-holo, graded and non-NM cards remain unsupported', () => {
  assert.equal(resolve({ ...owned, variant: 'reverse_holo' }).reason, 'non_normal_saved_variant');
  assert.equal(resolve({ ...owned, grade: '10' }).reason, 'graded_card');
  assert.equal(resolve({ ...owned, condition: 'Lightly Played' }).reason, 'not_raw_near_mint');
});
test('a missing saved-set mapping is not invented from the card alias', () => {
  assert.equal(resolve(owned, [cardAlias]).reason, 'unresolved_saved_set');
});
test('a missing saved-card mapping remains unresolved', () => {
  assert.equal(resolve(owned, [setAlias]).reason, 'unresolved_saved_card');
});
test('a set identifier is not reinterpreted as a card identifier', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, source_entity_type: 'set' }]).ok, false);
});
test('an unrelated alias in the same owner batch cannot price this row', () => {
  assert.equal(resolve(owned, [setAlias, { ...cardAlias, external_id: 'another-card' }]).ok, false);
});
test('the existing scoped English ME spelling bridge is preserved', () => {
  assert.deepEqual(resolve({ ...owned, card_id: 'me2pt5-1', set_id: 'me2pt5' },
    [{ ...setAlias, external_id: 'me02.5' }], [card]), exact);
});
test('unmapped SV spellings are not guessed as English', () => {
  assert.equal(resolve({ ...owned, card_id: 'sv8pt5-1', set_id: 'sv8pt5' }, [], [card]).ok, false);
});

function database({ rows = [card], error = null } = {}) {
  const reads = [];
  return {
    reads,
    schema(schema) {
      assert.equal(schema, 'api');
      return { from(table) {
        assert.equal(table, 'catalogue_cards');
        const read = { table };
        reads.push(read);
        const chain = {
          select(columns) { read.columns = columns; return chain; },
          in(column, ids) { read.column = column; read.ids = ids; return chain; },
          limit(value) { read.limit = value; return chain; },
          then(resolve, reject) {
            const data = rows.filter((row) => read.ids.includes(row[read.column]));
            return Promise.resolve({ data, error }).then(resolve, reject);
          },
        };
        return chain;
      } };
    },
  };
}

test('the reader retrieves printing-only aliases by printing_id, not variant_id', async () => {
  const db = database();
  const result = await readOwnerPrintingCatalogue(db, [owned], [setAlias, cardAlias], []);
  assert.deepEqual(result, [card]);
  assert.deepEqual(db.reads[0].ids, [printing]);
  assert.equal(db.reads[0].column, 'printing_id');
  for (const field of ['printing_id', 'variant_id', 'set_id', 'language_code', 'finish_code']) assert(db.reads[0].columns.split(',').includes(field));
  assert.equal(db.reads[0].limit, 1001);
  assert.deepEqual(resolveOwnedProviderVariant(owned, [setAlias, cardAlias], result), exact);
});
test('the reader resolves saved printing UUIDs absent from the direct variant lookup', async () => {
  const db = database();
  const row = { ...owned, card_id: printing, set_id: set };
  const result = await readOwnerPrintingCatalogue(db, [row], [], []);
  assert.deepEqual(resolveOwnedProviderVariant(row, [], result), exact);
});
test('known exact variants and explicit variant aliases do not broaden the read', async () => {
  const db = database();
  const result = await readOwnerPrintingCatalogue(db, [{ ...owned, card_id: variant }], [{ ...cardAlias, variant_id: variant }], [card]);
  assert.deepEqual(result, []);
  assert.equal(db.reads.length, 0);
});
test('the reader does not fetch variants for ineligible or unrelated saved rows', async () => {
  const db = database();
  await readOwnerPrintingCatalogue(db, [{ ...owned, variant: 'reverse_holo' }], [cardAlias], []);
  await readOwnerPrintingCatalogue(db, [owned], [{ ...cardAlias, external_id: 'other-card' }], []);
  await readOwnerPrintingCatalogue(db, [owned], [{ ...cardAlias, variant_id: 'invalid' }], []);
  assert.equal(db.reads.length, 0);
});
test('the reader refuses an apparently complete response at the project row cap', async () => {
  const db = database({ rows: Array.from({ length: 1000 }, () => card) });
  await assert.rejects(readOwnerPrintingCatalogue(db, [owned], [cardAlias], []), /safe result bound/);
});
test('database errors cannot become a successful empty mapping result', async () => {
  const failure = new Error('test database unavailable');
  await assert.rejects(readOwnerPrintingCatalogue(database({ error: failure }), [owned], [cardAlias], []), (error) => error === failure);
});
test('printing-ID queries are bounded to 100 IDs per request', async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({ ...owned, card_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}` }));
  const db = database({ rows: [] });
  await readOwnerPrintingCatalogue(db, rows, [], []);
  assert.deepEqual(db.reads.map((read) => read.ids.length), [100, 100, 5]);
});
test('the production worker wires the printing reader into candidate resolution', () => {
  const source = readFileSync(new URL('./refresh-owner-provider-prices.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ readOwnerPrintingCatalogue \} from '\.\/lib\/owner-price-printing-identities\.mjs'/);
  assert.match(source, /await readOwnerPrintingCatalogue\(supabase, referenceRows, identifierRows, directCatalogueRows\)/);
  assert.match(source, /const catalogueRows = \[\.\.\.directCatalogueRows, \.\.\.printingCatalogueRows, \.\.\.legacyCatalogueRows\]/);
  assert.match(source, /identifierRows\.length >= 1000/);
  assert.match(source, /directCatalogueRows\.length >= 1000/);
});
