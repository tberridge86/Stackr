import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createCatalogueV1Service } from '../lib/stackrApiV1.js';
import { correctedCatalogueCardId, correctedCatalogueSetId, validateCatalogueCorrectionAliases } from '../lib/catalogueLanguageCorrections.js';

const aliases = JSON.parse(readFileSync(new URL('../data/chinese-language-correction-aliases.json', import.meta.url)));
test('changed same-count mapping and wrong language fail validation', () => {
  const tampered = structuredClone(aliases);
  tampered.sets[Object.keys(tampered.sets)[0]] = Object.values(tampered.sets)[1];
  assert.throws(() => validateCatalogueCorrectionAliases(tampered), /Unreviewed/);
  assert.throws(() => validateCatalogueCorrectionAliases({ ...aliases, targetLanguage: 'zh-cn' }), /metadata/);
});
test('reviewed aliases retain exactly five sets, 605 printings and 750 unique finish variants', () => {
  for (const [kind, count] of [['sets', 5], ['printings', 605], ['variants', 750]]) {
    const entries = Object.entries(aliases[kind]);
    assert.equal(entries.length, count);
    assert.equal(new Set(entries.map(([, target]) => target)).size, count);
    for (const [source, target] of entries) {
      assert.notEqual(source, target);
      assert.equal(aliases[kind][target], undefined, 'correction must not chain or cycle');
      assert.equal((kind === 'sets' ? correctedCatalogueSetId : correctedCatalogueCardId)(source.toUpperCase()), target);
    }
  }
  assert.equal(correctedCatalogueCardId('unrelated-id'), 'unrelated-id');
});

test('old card, variant, set, set-card and UUID-search links return Traditional facts', async () => {
  const [sourceSet, targetSet] = Object.entries(aliases.sets)[0];
  const [sourcePrinting, targetPrinting] = Object.entries(aliases.printings)[0];
  const [sourceVariant, targetVariant] = Object.entries(aliases.variants)[0];
  const version = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  let targetLanguage = 'zh-tw';
  const client = { schema(schema) {
    assert.equal(schema, 'api');
    return { rpc: async () => ({ data: [], error: null }), from(table) {
      const filters = [];
      const query = {
        select() { return this; }, eq(column, value) { filters.push([column, value]); return this; },
        in() { return this; }, order() { return this; }, limit() { return this; }, range() { return this; },
        then(resolve, reject) {
          calls.push({ table, filters });
          let data = table === 'catalogue_sets'
            ? [{ set_id: targetSet, catalogue_version_id: version, language_code: targetLanguage }]
            : table === 'catalogue_cards' ? [{ printing_id: targetPrinting, variant_id: targetVariant,
              set_id: targetSet, catalogue_version_id: version, language_code: targetLanguage,
              collector_number: '001', card_native_name: '測試卡', variant_code: 'normal', finish_code: 'normal' }] : [];
          data = data.filter(row => filters.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
        async maybeSingle() { const result = await this; return { data: result.data[0] ?? null, error: null }; },
      };
      return query;
    } };
  } };
  const service = createCatalogueV1Service({ supabase: client, assetSupabase: client, assetIdentityRpc: true });
  assert.equal((await service.card(sourcePrinting)).card.cardId, targetPrinting);
  assert.equal((await service.card(sourceVariant)).card.languageCode, 'zh-tw');
  assert.equal((await service.set(sourceSet)).set.setId, targetSet);
  assert.equal((await service.setCards(sourceSet, { language: 'zh-cn' })).cards[0].languageCode, 'zh-tw');
  assert.equal((await service.search({ q: sourcePrinting, language: 'zh-cn' })).results[0].languageCode, 'zh-tw');
  assert.equal((await service.search({ q: sourceVariant, language: 'zh-cn' })).results[0].card.variants[0].variantId, targetVariant);
  assert.ok(calls.some(call => call.filters.some(([column, value]) => column === 'language_code' && value === 'zh-tw')));
  targetLanguage = 'zh-cn';
  await assert.rejects(() => service.card(sourcePrinting), error => error.code === 'invalid_language_correction');
  await assert.rejects(() => service.setCards(sourceSet), error => error.code === 'invalid_language_correction');
});
