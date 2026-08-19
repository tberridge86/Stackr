import assert from 'node:assert/strict';
import {
  buildBackfillLanes,
  buildBatchOffsets,
  canonicalImportRunKey,
  deterministicBatchSuffix,
  normaliseBackfillLanguages,
  normaliseBackfillSources,
} from './full-catalogue-metadata-backfill';
import { validateProviderRecord, type ProviderRecord } from './catalogue-ingestion/sourceAdapter';

const languages = normaliseBackfillLanguages(['EN', 'ja', 'zh_TW', 'zh-cn', 'ko', 'en']);
assert.deepEqual(languages, ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);

const sources = normaliseBackfillSources(['tcgdex', 'pokemon-tcg', 'pokemontcg']);
assert.deepEqual(sources, ['tcgdex', 'pokemon-tcg-api']);

const lanes = buildBackfillLanes(sources, languages);
assert.deepEqual(lanes, [
  { source: 'tcgdex', language: 'en' },
  { source: 'tcgdex', language: 'ja' },
  { source: 'tcgdex', language: 'zh-tw' },
  { source: 'tcgdex', language: 'zh-cn' },
  { source: 'tcgdex', language: 'ko' },
  { source: 'pokemon-tcg-api', language: 'en' },
]);

assert.deepEqual(buildBatchOffsets(2501, 1000), [0, 1000, 2000]);
assert.deepEqual(buildBatchOffsets(2501, 1000, 1500), [0, 1000]);
assert.deepEqual(buildBatchOffsets(0, 1000), []);

const lane = { source: 'tcgdex' as const, language: 'ja' as const };
assert.equal(
  deterministicBatchSuffix(lane, 'v2.47.0', 1000, 1000),
  'full-metadata:v2.47.0:tcgdex:ja:0001000:1000',
);
assert.equal(
  canonicalImportRunKey(lane, 'v2.47.0', 1000, 1000),
  'tcgdex:run_language:ja:all:all:metadata:full-metadata:v2.47.0:tcgdex:ja:0001000:1000',
);

const baseRecord: ProviderRecord = {
  provider: 'tcgdex',
  providerRecordId: 'sv2a-1',
  recordType: 'card',
  languageCode: 'ja',
  licenceStatus: 'approved',
  payload: { id: 'sv2a-1', name: 'フシギダネ' },
};
assert.equal(validateProviderRecord(baseRecord).ok, true);

const underReview = validateProviderRecord({ ...baseRecord, licenceStatus: 'under_review' });
assert.equal(underReview.ok, false);
assert.ok(underReview.issues.some((issue) => (
  issue.code === 'legal_use_not_approved'
  && issue.severity === 'error'
)));

assert.throws(
  () => normaliseBackfillSources(['scraped-random-site']),
  /Unsupported metadata source/,
);
assert.throws(
  () => normaliseBackfillLanguages(['jp']),
  /Unsupported catalogue language/,
);

console.log('Full multilingual catalogue metadata backfill planning tests passed.');
