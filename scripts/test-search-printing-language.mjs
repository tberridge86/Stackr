import assert from 'node:assert/strict';
import { createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';

const enSet = '11111111-1111-4111-8111-111111111111';
const cnSet = '22222222-2222-4222-8222-222222222222';
const makeCard = (language, i) => ({
  printing_id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  variant_id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  language_code: language, set_id: language === 'en' ? enSet : cnSet,
  game_code: 'pokemon', collector_number: '002', card_native_name: language === 'en' ? 'Charmander' : '小火龙',
  card_english_display_name: 'Charmander', variant_code: 'normal', finish_code: 'normal',
});
// More foreign English-display names than the first page's limit reproduce the
// live regression; filtering after truncation would incorrectly return empty.
const cards = [...Array.from({ length: 90 }, (_, i) => makeCard('zh-cn', i + 1)), makeCard('en', 100)];
const names = cards.map((card) => ({ ...card, language_code: 'en',
  printing_language_code: card.language_code, name_type: 'english_display',
  name: 'Charmander', normalized_name: 'charmander' }));
const sources = { catalogue_cards: cards, catalogue_card_names: names, catalogue_sets: [],
  catalogue_external_identifiers: [], asset_manifest: [] };
const db = { schema: () => ({ from: (table) => {
  assert.ok(table in sources, `Unexpected table ${table}`);
  const filters = [];
  let limit = Infinity;
  const query = {
    select() { return this; }, order() { return this; }, range() { return this; },
    limit(n) { limit = n; return this; },
    eq(key, value) { filters.push((row) => row[key] === value); return this; },
    in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
    ilike(key, value) { filters.push((row) => String(row[key] ?? '').toLowerCase().includes(value.replaceAll('%', '').toLowerCase())); return this; },
    then(resolve, reject) {
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
console.log('Search selects card language before limiting, preserves translated lookup, and constrains UUID matches.');
