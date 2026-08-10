import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { searchFixtureCatalogue } from '../backend/lib/stackrApiV1.js';

const supportedLanguages = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'];
const setIdByLanguage = {
  en: '10000000-0000-4000-8000-000000000001',
  ja: '10000000-0000-4000-8000-000000000002',
  'zh-Hans': '10000000-0000-4000-8000-000000000003',
  'zh-Hant': '10000000-0000-4000-8000-000000000004',
  ko: '10000000-0000-4000-8000-000000000005',
};

const cards = [
  makeCard('en', 'MEW', '006/165', 'Charizard ex', 'Charizard ex', 'normal'),
  makeCard('ja', 'SV2a', '157/165', 'リザードンex', 'Charizard ex', 'normal'),
  makeCard('zh-Hans', 'CSM2a', '007/151', '喷火龙ex', 'Charizard ex', 'poke_ball'),
  makeCard('zh-Hant', 'CSV2a', '007/151', '噴火龍ex', 'Charizard ex', 'master_ball'),
  makeCard('ko', 'SV2aF', '007/165', '리자몽ex', 'Charizard ex', 'reverse_holo'),
];

const names = [
  ...cards.flatMap((card) => [
    { nameType: 'native', name: card.nativeName, cardId: card.cardId, variantId: card.variantId },
    { nameType: 'english_display', name: card.englishDisplayName, cardId: card.cardId, variantId: card.variantId },
  ]),
  { nameType: 'alias', name: 'Lizardon ex', cardId: cards[1].cardId, variantId: cards[1].variantId },
  { nameType: 'translated', name: 'Fire Dragon ex', cardId: cards[2].cardId, variantId: cards[2].variantId },
  { nameType: 'alias', name: 'Lijamon ex', cardId: cards[4].cardId, variantId: cards[4].variantId },
];

const externalIds = [
  { externalId: 'tcgdex:en:mew:006', cardId: cards[0].cardId, variantId: cards[0].variantId },
  { externalId: 'tcgdex:ja:sv2a:157', cardId: cards[1].cardId, variantId: cards[1].variantId },
  { externalId: 'manual:zh-hans:csm2a:007-poke-ball', cardId: cards[2].cardId, variantId: cards[2].variantId },
  { externalId: 'manual:zh-hant:csv2a:007-master-ball', cardId: cards[3].cardId, variantId: cards[3].variantId },
  { externalId: 'manual:ko:sv2af:007-reverse', cardId: cards[4].cardId, variantId: cards[4].variantId },
];

const fixture = { cards, names, externalIds };
const cases = [
  {
    label: 'canonical id',
    query: cards[1].canonicalId,
    language: 'ja',
    expectedReason: 'exact_canonical_id',
    expectedLanguage: 'ja',
  },
  {
    label: 'external id',
    query: 'tcgdex:ja:sv2a:157',
    language: 'ja',
    expectedReason: 'exact_external_id',
    expectedLanguage: 'ja',
  },
  {
    label: 'set code and collector',
    query: 'SV2a 157',
    language: 'ja',
    expectedReason: 'exact_set_code_collector_number',
    expectedLanguage: 'ja',
  },
  {
    label: 'leading zero collector in selected set',
    query: '0007',
    language: 'ko',
    setId: setIdByLanguage.ko,
    expectedReason: 'exact_collector_number_in_set',
    expectedLanguage: 'ko',
  },
  {
    label: 'japanese native name',
    query: 'リザードンex',
    language: 'ja',
    expectedReason: 'exact_name',
    expectedLanguage: 'ja',
  },
  {
    label: 'simplified chinese native name',
    query: '喷火龙ex',
    language: 'zh-Hans',
    expectedReason: 'exact_name',
    expectedLanguage: 'zh-Hans',
  },
  {
    label: 'traditional chinese native name',
    query: '噴火龍ex',
    language: 'zh-Hant',
    expectedReason: 'exact_name',
    expectedLanguage: 'zh-Hant',
  },
  {
    label: 'korean native name',
    query: '리자몽ex',
    language: 'ko',
    expectedReason: 'exact_name',
    expectedLanguage: 'ko',
  },
  {
    label: 'english display name',
    query: 'Charizard ex',
    language: 'en',
    expectedReason: 'exact_name',
    expectedLanguage: 'en',
  },
  {
    label: 'alias transliteration',
    query: 'Lizardon ex',
    language: 'ja',
    expectedReason: 'exact_alias',
    expectedLanguage: 'ja',
  },
  {
    label: 'translated alias',
    query: 'Fire Dragon ex',
    language: 'zh-Hans',
    expectedReason: 'exact_translated_name',
    expectedLanguage: 'zh-Hans',
  },
  {
    label: 'fuzzy fallback',
    query: 'Chariz',
    language: 'en',
    expectedReason: 'fuzzy_name',
    expectedLanguage: 'en',
  },
];

function makeCard(languageCode, setCode, collectorNumber, nativeName, englishDisplayName, variantCode) {
  const index = supportedLanguages.indexOf(languageCode) + 1;
  const cardId = `20000000-0000-4000-8000-00000000000${index}`;
  const variantId = `30000000-0000-4000-8000-00000000000${index}`;
  return {
    cardId,
    variantId,
    canonicalId: `pokemon:${languageCode}:${setIdByLanguage[languageCode]}:${collectorNumber}:${variantCode}`,
    setId: setIdByLanguage[languageCode],
    setCode,
    collectorNumber,
    nativeName,
    englishDisplayName,
    languageCode,
    variantCode,
  };
}

const startedAt = performance.now();
const report = [];
for (const benchmarkCase of cases) {
  const results = searchFixtureCatalogue(benchmarkCase.query, fixture, {
    language: benchmarkCase.language,
    setId: benchmarkCase.setId,
    limit: 5,
  });
  const first = results[0];
  assert.ok(first, `${benchmarkCase.label} returned no result`);
  assert.equal(first.reason, benchmarkCase.expectedReason, `${benchmarkCase.label} returned the wrong reason`);
  assert.equal(first.languageCode, benchmarkCase.expectedLanguage, `${benchmarkCase.label} returned the wrong language`);
  report.push({
    label: benchmarkCase.label,
    query: benchmarkCase.query,
    language: benchmarkCase.language,
    reason: first.reason,
    canonicalId: first.canonicalId,
  });
}

const coveredLanguages = new Set(report.map((entry) => entry.language));
for (const language of supportedLanguages) {
  assert.ok(coveredLanguages.has(language), `benchmark did not cover ${language}`);
}

const elapsedMs = performance.now() - startedAt;
console.log(JSON.stringify({
  benchmark: 'stackr-search-v1-fixture',
  supportedLanguages,
  cases: report.length,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  results: report,
}, null, 2));
