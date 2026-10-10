import assert from 'node:assert/strict';
import { createCatalogueV1Service, normalizeSearchText, searchPublishedEnglishTranslations } from '../backend/lib/stackrApiV1.js';
import { findNativeCardNamesForEnglishQuery, normalizeCardEnglishSearchText } from '../backend/lib/cardNameTranslations.js';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS as records } from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = id(100);
const otherSetId = id(101);
const languages = ['ja', 'zh-cn', 'zh-tw', 'ko'];
const aliasRecords = languages.map((language) => {
  const record = records.find(([code, , name]) => code === language && name === 'Brute Bonnet');
  assert.ok(record, `An approved Brute Bonnet fixture is required for ${language}`);
  return record;
});
const cardRow = (record, n, set = setId) => ({
  printing_id: record[3][0], variant_id: id(n), canonical_key: `pokemon:${record[0]}:${record[3][0]}:001:normal`,
  game_code: 'pokemon', language_code: record[0], set_id: set, set_code: 'fixture',
  catalogue_version_id: id(200), card_native_name: record[1], card_english_display_name: 'Translation pending',
  collector_number: '001', variant_code: 'normal', finish_code: 'normal',
});
const cards = aliasRecords.map((record, index) => cardRow(record, 1000 + index));
const reviewed = { source: 'provider_complete_native_name', status: 'reviewed_provider_metadata',
  verifiedOfficial: false, sourceEvidenceSha256: 'a'.repeat(64) };
const changedTitle = { ...cards[0], variant_id: id(1010), card_english_display_name: 'Raichu',
  card_english_display_provenance: reviewed };
const otherSet = { ...cards[0], variant_id: id(1011), set_id: otherSetId };

function mockClient(tables, operations, ignoreNativeFilter = false, translationError = null) {
  return { schema(schema) {
    assert.equal(schema, 'api', 'Translation search must stay inside public-safe API projections');
    return { from(table) {
      assert.ok(['catalogue_cards', 'catalogue_card_names', 'catalogue_external_identifiers', 'catalogue_sets', 'asset_manifest'].includes(table));
      const filters = [];
      const request = {
        select() { return this; },
        eq(column, value) { filters.push(['eq', column, value]); return this; },
        in(column, value) { filters.push(['in', column, value]); return this; },
        ilike(column, value) { filters.push(['ilike', column, value]); return this; },
        order(column) { filters.push(['order', column]); return this; },
        limit(value) { filters.push(['limit', value]); return this; },
        range(from, to) { filters.push(['range', from, to]); return this; },
        abortSignal(signal) { filters.push(['abortSignal', signal]); return this; },
        then(resolve, reject) {
          operations.push({ table, filters });
          if (translationError && filters.some(([kind, column]) => kind === 'in' && column === 'card_native_name')) {
            return (typeof translationError === 'function' ? translationError(filters) : Promise.reject(translationError)).then(resolve, reject);
          }
          let data = [...(tables[table] ?? [])];
          for (const [kind, column, value] of filters) {
            if (ignoreNativeFilter && column === 'card_native_name') continue;
            if (kind === 'eq') data = data.filter((row) => row[column] === value);
            if (kind === 'in') data = data.filter((row) => value.includes(row[column]));
            if (kind === 'ilike') {
              const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('%', '.*').replaceAll('_', '.');
              const pattern = new RegExp(`^${escaped}$`, 'i');
              data = data.filter((row) => pattern.test(String(row[column] ?? '')));
            }
            if (kind === 'order') data.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')));
          }
          const limit = filters.find(([kind]) => kind === 'limit')?.[1];
          if (limit != null) data = data.slice(0, limit);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return request;
    } };
  } };
}

const operations = [];
const published = mockClient({ catalogue_cards: [...cards, changedTitle, otherSet] }, operations);
const translated = await searchPublishedEnglishTranslations(published, 'Brute Bonnet', 20, null, setId);
assert.deepEqual(new Set(translated.map((result) => result.languageCode)), new Set(languages));
assert.equal(translated.length, 4, 'Reviewed current English metadata and set scope reject unrelated rows');
for (const result of translated) {
  const record = aliasRecords.find(([language]) => language === result.languageCode);
  assert.equal(result.nativeName, record[1]);
  assert.equal(result.matchedName, 'Brute Bonnet');
  assert.equal(result.reason, 'exact_translated_name');
}
assert.equal(operations.length, 4, 'One bounded published-card query per candidate language');
for (const operation of operations) {
  assert.equal(operation.table, 'catalogue_cards');
  assert.ok(operation.filters.find(([kind, column]) => kind === 'in' && column === 'card_native_name')[2].length <= 80);
  assert.deepEqual(operation.filters.find(([kind]) => kind === 'limit'), ['limit', 80]);
  assert.deepEqual(operation.filters.find(([kind, column]) => kind === 'eq' && column === 'set_id'), ['eq', 'set_id', setId]);
}
const scoped = await searchPublishedEnglishTranslations(published, 'Brute Bonnet', 100, 'ja', setId);
assert.equal(scoped.length, 1);
assert.deepEqual(operations.at(-1).filters.find(([kind]) => kind === 'limit'), ['limit', 400]);
const energyCandidates = findNativeCardNamesForEnglishQuery('Energy');
for (const language of languages) {
  const local = energyCandidates.filter((candidate) => candidate.language === language);
  assert.ok(local.length > 0 && local.length <= 80, `Broad queries retain bounded candidates for ${language}`);
}
const chineseEnergy = energyCandidates.find((candidate) => candidate.language === 'zh-cn');
const chineseRecord = records.find(([language, native]) => language === chineseEnergy.language && native === chineseEnergy.nativeName);
const energyResult = await searchPublishedEnglishTranslations(mockClient({ catalogue_cards: [cardRow(chineseRecord, 1020)] }, []),
  'Energy', 20, null, setId);
assert.equal(energyResult.length, 1, 'Japanese candidate saturation cannot erase a selected Chinese set');
assert.equal(energyResult[0].languageCode, 'zh-cn');
assert.equal(findNativeCardNamesForEnglishQuery('Brute Bonnet', 'fr').length, 0);

const nidoran = records.filter(([language, nativeName]) => language === 'ja' && nativeName === 'ニドラン（デルタ種）');
const male = nidoran.find((record) => record[2] === 'Nidoran♂ δ');
assert.ok(male);
assert.notEqual(normalizeCardEnglishSearchText('Nidoran♂ δ'), normalizeCardEnglishSearchText('Nidoran♀ δ'));
assert.notEqual(normalizeCardEnglishSearchText('Nidoran♂ δ'), normalizeCardEnglishSearchText('Nidoran♂'));
assert.ok(findNativeCardNamesForEnglishQuery('Nidoran♂ δ', 'ja').some((candidate) => candidate.nativeName === male[1]));
const unknownPrinting = { ...cardRow(male, 2002), printing_id: id(9999) };
const unrelated = { ...cardRow(male, 2003), card_native_name: 'デルビル' };
const ambiguousClient = mockClient({ catalogue_cards: [...nidoran.map((record, i) => cardRow(record, 2000 + i)), unknownPrinting, unrelated] }, [], true);
const genders = await searchPublishedEnglishTranslations(ambiguousClient, 'Nidoran♂ δ', 20, 'ja', setId);
assert.equal(genders.length, 1, 'Actual printing resolution rejects the other gender, unknown printing and unrelated native text');
assert.equal(genders[0].cardId, male[3][0]);
assert.equal(genders[0].matchedName, male[2]);

function service(tables, translationError = null) {
  const calls = [];
  const searchSupabase = mockClient(tables, calls, false, translationError);
  const api = createCatalogueV1Service({
    supabase: { schema() { throw new Error('Search must use its published search client'); } },
    searchSupabase, assetSupabase: mockClient({}, []),
  });
  return { api, calls };
}
const full = service({ catalogue_cards: cards });
assert.equal((await full.api.search({ q: 'Brute Bonnet', limit: 20 })).results.length, 4, 'First-party search exposes all four language aliases');
for (const [q, extra, reason, tables] of [
  [cards[0].variant_id, {}, 'exact_canonical_id', {}],
  ['provider-pikachu-fixture', {}, 'exact_external_id', { catalogue_external_identifiers: [{ external_id: 'provider-pikachu-fixture',
    source_entity_type: 'card', language_code: 'ja', printing_id: cards[0].printing_id, variant_id: cards[0].variant_id }] }],
  ['001', { setId, language: 'ja' }, 'exact_collector_number_in_set', {}],
]) {
  const instance = service({ catalogue_cards: cards, ...tables });
  const result = await instance.api.search({ q, limit: 20, ...extra });
  assert.equal(result.results[0].reason, reason);
  assert.equal(instance.calls.some((call) => call.filters.some(([kind, column]) => kind === 'in' && column === 'card_native_name')), false,
    'Canonical, external and collector identity hits must not request translation candidates');
}
const englishCard = { ...cards[0], language_code: 'en', printing_id: id(3000), variant_id: id(3001), card_native_name: 'Brute Bonnet', card_english_display_name: 'Brute Bonnet' };
const merged = service({ catalogue_cards: [englishCard, ...cards], catalogue_card_names: [{ name_type: 'english_display', name: 'Brute Bonnet',
  normalized_name: normalizeSearchText('Brute Bonnet'), printing_id: englishCard.printing_id, variant_id: englishCard.variant_id, language_code: 'en' }] });
const nameResults = (await merged.api.search({ q: 'Brute Bonnet', limit: 3 })).results;
assert.equal(nameResults.length, 3);
assert.equal(nameResults[0].variantId, englishCard.variant_id, 'Stored exact names retain their position');
assert.ok(nameResults.some((result) => result.reason === 'exact_translated_name'));
assert.equal(new Set(nameResults.map((result) => result.variantId)).size, 3);
assert.equal(merged.calls.filter((call) => call.filters.some(([kind, column]) => kind === 'in' && column === 'card_native_name')).length, 4);
const warnings = [];
const originalWarn = console.warn;
try {
  console.warn = (message) => warnings.push(JSON.parse(message));
  for (const [nameType, storedName, reason] of [
    ['english_display', 'Brute Bonnet', 'exact_name'],
    ['alias', 'Brute Bonnet', 'exact_alias'],
    ['english_display', 'Brute Bonnet rare', 'fuzzy_name'],
  ]) {
    const failedAliases = service({ catalogue_cards: [englishCard], catalogue_card_names: [{ name_type: nameType, name: storedName,
      normalized_name: normalizeSearchText(storedName), printing_id: englishCard.printing_id, variant_id: englishCard.variant_id, language_code: 'en' }] },
      { code: '57014', message: 'fixture database timeout' });
    const retained = (await failedAliases.api.search({ q: 'Brute Bonnet', limit: 20 })).results;
    assert.equal(retained.length, 1);
    assert.equal(retained[0].reason, reason);
    assert.equal(retained[0].variantId, englishCard.variant_id, 'Optional alias failure preserves a successful exact, alias or fuzzy result');
    assert.ok(failedAliases.calls.filter((call) => call.filters.some(([kind, column]) => kind === 'in' && column === 'card_native_name'))
      .every((call) => call.filters.some(([kind, signal]) => kind === 'abortSignal' && signal instanceof AbortSignal)));
  }
  let rejectTransport;
  const deferredTransport = new Promise((_, reject) => { rejectTransport = reject; });
  const stalledAliases = service({ catalogue_cards: [englishCard], catalogue_card_names: [{ name_type: 'english_display', name: 'Brute Bonnet',
    normalized_name: normalizeSearchText('Brute Bonnet'), printing_id: englishCard.printing_id, variant_id: englishCard.variant_id, language_code: 'en' }] },
    () => deferredTransport);
  const startedAt = performance.now();
  const retained = (await stalledAliases.api.search({ q: 'Brute Bonnet', limit: 20 })).results;
  assert.ok(performance.now() - startedAt < 1_000, 'Nonresponsive optional transport cannot hold successful search for a second');
  assert.equal(retained[0].variantId, englishCard.variant_id);
  const stalledReads = stalledAliases.calls.filter((call) => call.filters.some(([kind, column]) => kind === 'in' && column === 'card_native_name'));
  assert.ok(stalledReads.length > 0);
  assert.ok(stalledReads.every((call) => call.filters.some(([kind, signal]) => kind === 'abortSignal' && signal.aborted)));
  const snapshot = JSON.stringify(retained);
  rejectTransport(new Error('fixture late transport rejection'));
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(retained), snapshot, 'A late transport rejection cannot mutate a returned search snapshot');
} finally { console.warn = originalWarn; }
assert.deepEqual(warnings, [...Array.from({ length: 3 }, () => ({ event: 'optional_translation_search_failed', code: '57014' })),
  { event: 'optional_translation_search_failed', code: 'translation_search_timeout' }]);
const failedFallback = service({ catalogue_cards: cards }, { code: '57014', message: 'fixture database timeout' });
await assert.rejects(failedFallback.api.search({ q: 'Brute Bonnet', limit: 20 }), (error) => error.code === '57014',
  'A failed translation-only read remains a genuine failure rather than empty results');
console.log('Backend translation search passed: four languages, bounded published reads, exact printing/gender checks, set scope, current-name rejection, identity priority and merged aliases.');
