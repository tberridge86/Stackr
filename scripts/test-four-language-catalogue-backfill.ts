import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOUR_LANGUAGE_CATALOGUE_CODES,
  FOUR_LANGUAGE_IMPORTER_CONTRACT,
  batchManifestDigest,
  batchRunMetadata,
  buildBatchPlans,
  buildFourLanguageLanes,
  catalogueSnapshotDigest,
  canonicalImportRunKey,
  completedBatchManifestMatches,
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
  { id: '5', image: 'https://example.test/5' },
  { id: '2' },
  { id: '4', image: '' },
  { id: '1', image: 'https://example.test/1' },
  { id: '3', image: 'https://example.test/3' },
];
assert.deepEqual(buildBatchPlans(cards, 2), [
  {
    offset: 0,
    limit: 2,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[3], cards[1]]),
  },
  {
    offset: 2,
    limit: 2,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[4], cards[2]]),
  },
  {
    offset: 4,
    limit: 1,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[0]]),
  },
]);
assert.deepEqual(buildBatchPlans(cards, 2, 3), [
  {
    offset: 0,
    limit: 2,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[3], cards[1]]),
  },
  {
    offset: 2,
    limit: 1,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[4]]),
  },
]);
const sets = [
  { id: 'set-4', name: 'Four' },
  { id: 'set-1', name: 'One' },
  { id: 'set-3', name: 'Three' },
  { id: 'set-2', name: 'Two' },
];
assert.deepEqual(buildBatchPlans(cards, 2, 3, sets), [
  {
    offset: 0,
    limit: 2,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[3], cards[1]], [sets[1], sets[3]]),
  },
  {
    offset: 2,
    limit: 1,
    expectedImageReferences: 1,
    manifestDigest: batchManifestDigest('en', [cards[4]], [sets[2]]),
  },
], 'short batches must hash exactly the set rows imported with the same offset and limit');
assert.throws(() => buildBatchPlans([{ id: 'CARD-1' }, { id: ' card-1 ' }], 2), /duplicate provider ID card-1/);
assert.throws(() => buildBatchPlans([{ id: 'card-1' }, { name: 'missing-id' }], 2), /stable provider ID/);
assert.deepEqual(buildBatchPlans([], 1000), []);
assert.throws(() => buildBatchPlans(cards, 0), /positive integer/);

const lane = { source: 'tcgdex' as const, language: 'ja' as const };
const snapshotDigest = 'a'.repeat(64);
const manifestDigest = 'b'.repeat(64);
assert.equal(
  deterministicBatchSuffix(lane, 'snapshot-v2', snapshotDigest, 1000, 1000, manifestDigest),
  `four-language-metadata-images-v2:snapshot-v2:${FOUR_LANGUAGE_IMPORTER_CONTRACT}:snapshot-${snapshotDigest}:tcgdex:ja:0001000:1000:batch-${manifestDigest}`,
);
assert.equal(
  canonicalImportRunKey(lane, 'snapshot-v2', snapshotDigest, 1000, 1000, manifestDigest),
  `tcgdex:run_language:ja:all:all:with-assets:four-language-metadata-images-v2:snapshot-v2:${FOUR_LANGUAGE_IMPORTER_CONTRACT}:snapshot-${snapshotDigest}:tcgdex:ja:0001000:1000:batch-${manifestDigest}`,
);

const stableSnapshotA = catalogueSnapshotDigest('ja', [
  { id: 'set-b-2', image: 'b', variants: { holo: true, normal: true } },
  { id: 'SET-A-1', image: 'a' },
], [{ id: 'set-b', name: 'B' }, { id: 'set-a', name: 'A' }]);
const stableSnapshotB = catalogueSnapshotDigest('ja', [
  { image: 'a', id: 'SET-A-1' },
  { variants: { normal: true, holo: true }, image: 'b', id: 'set-b-2' },
], [{ name: 'A', id: 'set-a' }, { name: 'B', id: 'set-b' }]);
assert.equal(stableSnapshotA, stableSnapshotB, 'semantic snapshot hashing must ignore row and object-key order');
assert.equal(
  stableSnapshotA,
  catalogueSnapshotDigest('ja', [
    { id: 'SET-A-1', image: 'changed' },
    { id: 'set-b-2', image: 'b', variants: { normal: true, holo: true } },
  ], [{ id: 'set-a', name: 'A' }, { id: 'set-b', name: 'B' }]),
  'content-only changes must not invalidate every batch membership namespace',
);
assert.notEqual(
  batchManifestDigest('ja', [{ id: 'SET-A-1', image: 'a' }]),
  batchManifestDigest('ja', [{ id: 'SET-A-1', image: 'changed' }]),
  'provider content changes must invalidate their exact batch',
);
assert.notEqual(
  batchManifestDigest('ja', [{ id: 'SET-A-1' }], [{ id: 'set-a', name: 'Original' }]),
  batchManifestDigest('ja', [{ id: 'SET-A-1' }], [{ id: 'set-a', name: 'Changed' }]),
  'set content changes must invalidate the exact batch that imports the set',
);
assert.notEqual(
  stableSnapshotA,
  catalogueSnapshotDigest('ja', [
    { id: 'SET-A-1' },
    { id: 'set-b-2' },
    { id: 'set-c-3' },
  ], [{ id: 'set-a' }, { id: 'set-b' }]),
  'card membership changes must invalidate the snapshot namespace',
);

const plan = buildBatchPlans([{ id: 'set-a-1' }, { id: 'set-a-2' }], 1000)[0];
const runMetadata = batchRunMetadata(lane, 'snapshot-v2', snapshotDigest, plan, 1000);
assert.equal(completedBatchManifestMatches({ workstream: runMetadata }, runMetadata), true);
assert.equal(completedBatchManifestMatches({ workstream: { ...runMetadata, batchCardCount: 99 } }, runMetadata), false);
assert.equal(completedBatchManifestMatches({}, runMetadata), false);

const workflow = readFileSync('.github/workflows/four-language-catalogue-images.yml', 'utf8');
assert.match(workflow, /tcgdex-771a8381c57c-four-primary-v2/);
assert.doesNotMatch(workflow, /four-primary-v1/);

const targetedChineseImageWorkflow = readFileSync(
  '.github/workflows/recover-tcgdex-zh-cn-images.yml',
  'utf8',
);
assert.match(targetedChineseImageWorkflow, /github\.event\.issue\.number == 74/);
assert.match(targetedChineseImageWorkflow, /github\.actor == 'tberridge86'/);
assert.match(targetedChineseImageWorkflow, /github\.event\.comment\.body == '\/run-tcgdex-zh-cn-images'/);
assert.match(targetedChineseImageWorkflow, /environment: staging/);
assert.match(targetedChineseImageWorkflow, /SUPABASE_PROJECT_REF: lmwfhvexfcoyeuoyrlco/);
assert.match(targetedChineseImageWorkflow, /SUPABASE_URL: https:\/\/lmwfhvexfcoyeuoyrlco\.supabase\.co/);
assert.match(targetedChineseImageWorkflow, /STACKR_CATALOGUE_IMPORT_TARGET: staging/);
assert.match(targetedChineseImageWorkflow, /TCGDEX_SET_IDS: SV7a,SV7,SV8,SV9,SV8a,SV9a,SV10/);
assert.match(targetedChineseImageWorkflow, /EXPECTED_TARGET_CARDS: ["']829["']/);
assert.match(targetedChineseImageWorkflow, /EXPECTED_IMAGE_REFERENCES: ["']746["']/);
assert.match(targetedChineseImageWorkflow, /group: stackr-staging-tcgdex-zh-cn-images\n\s+cancel-in-progress: false/);
assert.match(targetedChineseImageWorkflow, /--target=staging/);
assert.match(
  targetedChineseImageWorkflow,
  /name: Prepare the verified staging database URL[\s\S]+prepare-postgres-urls\.mjs --source-only[\s\S]+name: Measure staging coverage read-only/,
);
assert.match(targetedChineseImageWorkflow, /from ingest\.external_identifiers identifier/);
assert.match(targetedChineseImageWorkflow, /identifier\.source_entity_type = 'asset'/);
assert.match(targetedChineseImageWorkflow, /join catalog\.assets asset on asset\.id = link\.asset_id/);
assert.match(targetedChineseImageWorkflow, /variant\.same_artwork_as_variant_id/);
assert.match(
  targetedChineseImageWorkflow,
  /effective_asset\.variant_id in \(target_link\.variant_id, target_link\.same_artwork_as_variant_id\)/,
);
assert.match(targetedChineseImageWorkflow, /releasePercent: 0/);
assert.doesNotMatch(targetedChineseImageWorkflow, /environment: production/);
assert.doesNotMatch(targetedChineseImageWorkflow, /--target=production/);

const pinnedCompilerPatch = readFileSync('catalogue/tcgdex-pinned-compiler.patch', 'utf8');
assert.match(
  pinnedCompilerPatch,
  /diff --git a\/data-asia\/SV\/CBB1C\.ts b\/data-asia\/SV\/CBB1C\.ts/,
);
assert.ok(
  pinnedCompilerPatch.includes("-\tid: 'CSV1C',\n+\tid: 'CBB1C',"),
  'the pinned TCGdex snapshot must correct the upstream CBB1C provider ID typo',
);
const cardUtilPatch = pinnedCompilerPatch.slice(
  pinnedCompilerPatch.indexOf('diff --git a/server/compiler/utils/cardUtil.ts'),
);
const addedCardUtilSource = cardUtilPatch
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
const manifestResolverSource = addedCardUtilSource.match(
  /function resolveAssetManifestKey[\s\S]*?\n}/,
)?.[0];
assert.ok(manifestResolverSource, 'the pinned compiler patch must add an asset-manifest key resolver');
const executableManifestResolverSource = manifestResolverSource.replace(
  'function resolveAssetManifestKey(container: unknown, requestedKey: string, context: string): string | undefined',
  'function resolveAssetManifestKey(container, requestedKey, context)',
);
const resolveAssetManifestKey = Function(
  `'use strict'; ${executableManifestResolverSource}; return resolveAssetManifestKey;`,
)() as (container: unknown, requestedKey: string, context: string) => string | undefined;
assert.equal(
  resolveAssetManifestKey({ SV: {} }, 'SV', 'series'),
  'SV',
  'an exact asset-manifest key must win without rewriting its path casing',
);
assert.equal(
  resolveAssetManifestKey({ sv: {} }, 'SV', 'series'),
  'sv',
  'one case-folded asset-manifest key must resolve to the provider path casing',
);
assert.throws(
  () => resolveAssetManifestKey({ SV: {}, sv: {} }, 'Sv', 'series'),
  /Ambiguous TCGdex asset manifest series key/,
  'case-folded manifest ambiguity must fail closed instead of guessing an image path',
);
assert.equal(resolveAssetManifestKey({ other: {} }, 'SV', 'series'), undefined);
assert.ok(
  cardUtilPatch.includes('https://assets.tcgdex.net/${lang}/${seriesKey}/${setKey}/${cardId}'),
  'TCGdex image URLs must preserve the exact series and set keys found in the provider manifest',
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
