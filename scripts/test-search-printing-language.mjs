import assert from 'node:assert/strict';
import { createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';

const enSet = '11111111-1111-4111-8111-111111111111';
const cnSet = '22222222-2222-4222-8222-222222222222';
const dottedSet = '33333333-3333-4333-8333-333333333333';
const makeCard = (language, i) => ({
  printing_id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  variant_id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  language_code: language, set_id: language === 'en' ? enSet : cnSet,
  game_code: 'pokemon', collector_number: '002', card_native_name: language === 'en' ? 'Charmander' : '小火龙',
  card_english_display_name: 'Charmander', variant_code: 'normal', finish_code: 'normal',
});
const cards = [...Array.from({ length: 90 }, (_, i) => makeCard('zh-cn', i + 1)), makeCard('en', 100)];
const names = cards.map((card) => ({ ...card, language_code: 'en',
  printing_language_code: card.language_code, name_type: 'english_display',
  name: 'Charmander', normalized_name: 'charmander' }));

const scopedPrinting = '30000000-0000-4000-8000-000000009001';
const printingOnlyPrinting = '30000000-0000-4000-8000-000000009002';
const scopedNormal = {
  ...makeCard('en', 901), printing_id: scopedPrinting,
  variant_id: '40000000-0000-4000-8000-000000009001',
  collector_number: '123', variant_code: 'normal', finish_code: 'normal',
};
const scopedHoloSibling = {
  ...scopedNormal, variant_id: '40000000-0000-4000-8000-000000009003',
  variant_code: 'holo', finish_code: 'holo',
};
const printingOnlyNormal = {
  ...makeCard('en', 902), printing_id: printingOnlyPrinting,
  variant_id: '40000000-0000-4000-8000-000000009002',
  collector_number: '124', variant_code: 'normal', finish_code: 'normal',
};
const printingOnlyReverse = {
  ...printingOnlyNormal, variant_id: '40000000-0000-4000-8000-000000009004',
  variant_code: 'reverse_holo', finish_code: 'reverse_holo',
};
const dottedPinsir = {
  ...makeCard('en', 903), set_id: dottedSet,
  printing_id: '30000000-0000-4000-8000-000000009003',
  variant_id: '40000000-0000-4000-8000-000000009005',
  collector_number: '003', card_native_name: 'Pinsir', card_english_display_name: 'Pinsir',
};
cards.push(scopedNormal, scopedHoloSibling, printingOnlyNormal, printingOnlyReverse, dottedPinsir);
names.push(
  { name_type: 'alias', name: 'Variant Alias', normalized_name: 'variant alias', printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, printing_language_code: 'en' },
  { name_type: 'english_display', name: 'Exact Scoped', normalized_name: 'exact scoped', printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, printing_language_code: 'en' },
  { name_type: 'alias', name: 'Fuzzy Scoped Solar', normalized_name: 'fuzzy scoped solar', printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, printing_language_code: 'en' },
  { name_type: 'alias', name: 'Printing All', normalized_name: 'printing all', printing_id: printingOnlyPrinting, variant_id: null, printing_language_code: 'en' },
  { name_type: 'alias', name: 'Mixed Identity', normalized_name: 'mixed identity', printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, printing_language_code: 'en' },
  { name_type: 'alias', name: 'Mixed Identity', normalized_name: 'mixed identity', printing_id: printingOnlyPrinting, variant_id: null, printing_language_code: 'en' },
  { name_type: 'alias', name: 'Mixed Identity', normalized_name: 'mixed identity', printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, printing_language_code: 'en' },
  { name_type: 'english_display', name: 'Pinsir', normalized_name: 'pinsir', printing_id: dottedPinsir.printing_id, variant_id: dottedPinsir.variant_id, printing_language_code: 'en' },
);
const cardInReads = [];
const cardQueryShapes = [];
const sources = { catalogue_cards: cards, catalogue_card_names: names, catalogue_sets: [{
  set_id: enSet, set_code: 'SVX1', language_code: 'en', game_code: 'pokemon', native_name: 'Scoped Set', english_display_name: 'Scoped Set',
}, {
  set_id: dottedSet, set_code: 'sv08.5', language_code: 'en', game_code: 'pokemon', native_name: 'Prismatic Evolutions', english_display_name: 'Prismatic Evolutions',
}], catalogue_external_identifiers: [{
  source_entity_type: 'variant', external_id: 'variant-external-id', language_code: 'en', set_id: enSet,
  printing_id: scopedPrinting, variant_id: scopedNormal.variant_id, confidence: 1,
}], asset_manifest: [] };
const db = { schema: () => ({ from: (table) => {
  assert.ok(table in sources, `Unexpected table ${table}`);
  const filters = [];
  const clauses = [];
  let limit = Infinity;
  const query = {
    select() { return this; }, order() { return this; }, range() { return this; },
    limit(n) { limit = n; return this; },
    eq(key, value) { clauses.push({ operator: 'eq', key, value }); filters.push((row) => row[key] === value); return this; },
    in(key, values) {
      if (table === 'catalogue_cards') cardInReads.push({ key, values: [...values] });
      clauses.push({ operator: 'in', key, values: [...values] });
      filters.push((row) => values.includes(row[key])); return this;
    },
    ilike(key, value) {
      clauses.push({ operator: 'ilike', key, value });
      const expression = new RegExp(`^${value.split('%').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
      filters.push((row) => expression.test(String(row[key] ?? ''))); return this;
    },
    then(resolve, reject) {
      if (table === 'catalogue_cards') cardQueryShapes.push({ clauses: [...clauses] });
      return Promise.resolve({ data: sources[table].filter((row) => filters.every((filter) => filter(row))).slice(0, limit), error: null }).then(resolve, reject);
    },
  };
  return query;
} }) };
const service = createCatalogueV1Service({ supabase: db });

const en = await service.search({ q: 'Charmander', language: 'en', limit: 2 });
assert.equal(en.results.length, 1);
assert.ok(en.results.every((row) => row.languageCode === 'en'));
const cn = await service.search({ q: 'Charmander', language: 'zh-cn', limit: 2 });
assert.equal(cn.results.length, 2, 'English aliases must still find the selected Chinese printing.');
assert.ok(cn.results.every((row) => row.languageCode === 'zh-cn'));
const wrongLanguage = await service.search({ q: cards[0].variant_id, language: 'en', limit: 2 });
assert.equal(wrongLanguage.results.length, 0, 'Canonical UUID paths must also honor requested card language.');
const wrongSet = await service.search({ q: cards[0].variant_id, setId: enSet, limit: 2 });
assert.equal(wrongSet.results.length, 0, 'Canonical UUID paths must honor the selected set.');

const runAndReadCards = async (query) => {
  cardInReads.length = 0;
  cardQueryShapes.length = 0;
  const response = await service.search(query);
  return {
    cardResults: response.results.filter((row) => row.type === 'card'),
    reads: cardInReads.map((read) => ({ ...read, values: [...read.values] })),
    queryShapes: cardQueryShapes.map((queryShape) => ({ clauses: [...queryShape.clauses] })),
  };
};

const external = await runAndReadCards({ q: 'variant-external-id', language: 'en', limit: 10 });
assert.deepEqual(external.cardResults.map((row) => row.variantId), [scopedNormal.variant_id],
  'An external ID bound to one variant must not return its sibling finish.');
assert.deepEqual(external.reads, [{ key: 'variant_id', values: [scopedNormal.variant_id] }],
  'A variant external ID must not issue a sibling-expanding printing read.');

const exactName = await runAndReadCards({ q: 'Variant Alias', language: 'en', limit: 10 });
assert.deepEqual(exactName.cardResults.map((row) => row.variantId), [scopedNormal.variant_id],
  'A variant-specific alias must resolve only that exact finish.');
assert.deepEqual(exactName.reads, [{ key: 'variant_id', values: [scopedNormal.variant_id] }],
  'A variant-specific alias must not issue a redundant printing read.');

const exactNameInSet = await runAndReadCards({ q: 'Exact Scoped SVX1', language: 'en', limit: 10 });
assert.deepEqual(exactNameInSet.cardResults.map((row) => row.variantId), [scopedNormal.variant_id],
  'A variant-specific exact name plus set must not expand to its sibling finish.');
assert.deepEqual(exactNameInSet.reads, [{ key: 'variant_id', values: [scopedNormal.variant_id] }]);

const dottedSetName = await runAndReadCards({ q: 'Pinsir sv08.5', language: 'en', limit: 10 });
assert.deepEqual(dottedSetName.cardResults.map((row) => row.variantId), [dottedPinsir.variant_id],
  'A name plus dotted set code must resolve the matching card.');
assert.ok(!dottedSetName.queryShapes.some((queryShape) => queryShape.clauses.some((clause) => clause.key === 'collector_number')),
  'A name plus dotted set code must resolve before the global collector-number fallback.');

const selectedCollector = await runAndReadCards({ q: '123', language: 'en', setId: enSet, limit: 10 });
assert.deepEqual(new Set(selectedCollector.cardResults.map((row) => row.variantId)), new Set([
  scopedNormal.variant_id, scopedHoloSibling.variant_id,
]), 'An explicit collector number with a selected set must retain each matching finish.');
assert.ok(selectedCollector.queryShapes.some((queryShape) => queryShape.clauses.some((clause) => clause.key === 'collector_number')
  && queryShape.clauses.some((clause) => clause.key === 'set_id' && clause.value === enSet)),
  'Selected-set collector lookup must remain constrained to the selected set.');

const fuzzy = await runAndReadCards({ q: 'Scoped Sol', language: 'en', limit: 10 });
assert.deepEqual(fuzzy.cardResults.map((row) => row.variantId), [scopedNormal.variant_id],
  'A fuzzy variant-specific alias must not expand to its sibling finish.');
assert.deepEqual(fuzzy.reads, [{ key: 'variant_id', values: [scopedNormal.variant_id] }]);

const printingLevel = await runAndReadCards({ q: 'Printing All', language: 'en', limit: 10 });
assert.deepEqual(new Set(printingLevel.cardResults.map((row) => row.variantId)), new Set([
  printingOnlyNormal.variant_id, printingOnlyReverse.variant_id,
]), 'A printing-level name must continue to return every published finish.');
assert.deepEqual(printingLevel.reads, [{ key: 'printing_id', values: [printingOnlyPrinting] }]);

const mixed = await runAndReadCards({ q: 'Mixed Identity', language: 'en', limit: 10 });
assert.deepEqual(new Set(mixed.cardResults.map((row) => row.variantId)), new Set([
  scopedNormal.variant_id, printingOnlyNormal.variant_id, printingOnlyReverse.variant_id,
]), 'Mixed variant and printing identities must dedupe the exact variant while retaining printing-level finishes.');
assert.equal(mixed.reads.filter((read) => read.key === 'variant_id').length, 1);
assert.equal(mixed.reads.filter((read) => read.key === 'printing_id').length, 1,
  'Mixed identities must make one printing lookup only.');
const mixedChinese = await runAndReadCards({ q: 'Mixed Identity', language: 'zh-cn', limit: 10 });
assert.equal(mixedChinese.cardResults.length, 0, 'Name identity hydration must preserve requested printing language.');
assert.equal(mixedChinese.reads.length, 0);

console.log('Search selects card language before limiting, preserves translated lookup, constrains UUID matches, and keeps variant identities from expanding to sibling finishes.');
