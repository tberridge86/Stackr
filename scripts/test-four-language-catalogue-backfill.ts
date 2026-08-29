import assert from 'node:assert/strict';
import {
  FOUR_LANGUAGE_CATALOGUE_CODES,
  buildBatchPlans,
  buildFourLanguageLanes,
  canonicalImportRunKey,
  createFourLanguageAdapter,
  deterministicBatchSuffix,
  normaliseFourLanguageCodes,
  assertAcceptedBatchResult,
  type BackfillOptions,
} from './four-language-catalogue-backfill';

assert.deepEqual(
  normaliseFourLanguageCodes(['EN', 'ja', 'zh_CN', 'ko', 'en']),
  ['en', 'ja', 'zh-cn', 'ko'],
);
assert.deepEqual(buildFourLanguageLanes([...FOUR_LANGUAGE_CATALOGUE_CODES]), [
  { source: 'tcgdex', language: 'en' },
  { source: 'tcgdex', language: 'ja' },
  { source: 'tcgdex', language: 'zh-cn' },
  { source: 'tcgdex', language: 'ko' },
]);

assert.throws(
  () => normaliseFourLanguageCodes(['zh-tw']),
  /outside this four-language workstream/,
);
assert.throws(
  () => normaliseFourLanguageCodes(['jp']),
  /Unsupported catalogue language/,
);
assert.throws(
  () => normaliseFourLanguageCodes([]),
  /At least one workstream language/,
);

const cards = [
  { id: '1', image: 'https://example.test/1' },
  { id: '2' },
  { id: '3', image: 'https://example.test/3' },
  { id: '4', image: '' },
  { id: '5', image: 'https://example.test/5' },
];
assert.deepEqual(buildBatchPlans(cards, 2), [
  { offset: 0, limit: 2, expectedImageReferences: 1 },
  { offset: 2, limit: 2, expectedImageReferences: 1 },
  { offset: 4, limit: 1, expectedImageReferences: 1 },
]);
assert.deepEqual(buildBatchPlans(cards, 2, 3), [
  { offset: 0, limit: 2, expectedImageReferences: 1 },
  { offset: 2, limit: 1, expectedImageReferences: 1 },
]);
assert.deepEqual(buildBatchPlans([], 1000), []);
assert.throws(() => buildBatchPlans(cards, 0), /positive integer/);

const lane = { source: 'tcgdex' as const, language: 'ja' as const };
assert.equal(
  deterministicBatchSuffix(lane, 'snapshot-v1', 1000, 1000),
  'four-language-metadata-images:snapshot-v1:tcgdex:ja:0001000:1000',
);
assert.equal(
  canonicalImportRunKey(lane, 'snapshot-v1', 1000, 1000),
  'tcgdex:run_language:ja:all:all:with-assets:four-language-metadata-images:snapshot-v1:tcgdex:ja:0001000:1000',
);

const options: BackfillOptions = {
  languages: ['ja'],
  tcgdexBaseUrl: 'https://api.tcgdex.net/v2',
  tcgdexSnapshotRoot: '/tmp/pinned-tcgdex',
  tcgdexSnapshotVersion: 'snapshot-v1',
  version: 'snapshot-v1',
  batchSize: 1000,
  writeConcurrency: 8,
  maxAttempts: 3,
  batchPauseMs: 100,
  outputPath: '/tmp/report.json',
  dryPlan: true,
  maxRecords: null,
};
const adapter = createFourLanguageAdapter(lane, options);
assert.equal(adapter.language, 'ja');
assert.equal(adapter.licenceStatus, 'approved');
assert.equal(adapter.assetLicenceStatus, 'approved');
assert.equal(adapter.snapshotRoot, '/tmp/pinned-tcgdex');
assert.equal(adapter.snapshotVersion, 'snapshot-v1');

assert.doesNotThrow(() => assertAcceptedBatchResult({
  ok: true,
  stats: { recordsRetrieved: 10, recordsInserted: 2, recordsUpdated: 4, recordsConflicted: 1 },
}));
assert.doesNotThrow(() => assertAcceptedBatchResult({
  ok: true,
  stats: { recordsRetrieved: 10, recordsInserted: 0, recordsUpdated: 0, recordsConflicted: 0 },
}));
assert.throws(
  () => assertAcceptedBatchResult({
    ok: true,
    stats: { recordsRetrieved: 10, recordsInserted: 0, recordsUpdated: 0, recordsConflicted: 10 },
  }),
  /all 10 retrieved records conflicted/,
);
assert.throws(
  () => assertAcceptedBatchResult({
    ok: true,
    stats: { recordsRetrieved: 10, recordsInserted: 0, recordsUpdated: 0, recordsConflicted: 2 },
  }),
  /2 conflicts and no mapped inserts or updates/,
);
assert.throws(
  () => assertAcceptedBatchResult({ ok: false, error: 'provider unavailable' }),
  /provider unavailable/,
);

console.log('Four-language catalogue metadata and image-reference planning tests passed.');
