#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  FOUR_LANGUAGE_CODES,
  LANGUAGE_PROGRESS_SQL,
  LOGICAL_ASSET_DUPLICATION_SQL,
  RAW_DUPLICATION_SQL,
  STORAGE_OBJECT_DUPLICATION_SQL,
  assertStagingReportTarget,
  buildFourLanguageCatalogueProgressReport,
  collectFourLanguageCatalogueProgress,
  equalWeightPercent,
  percent,
} from './four-language-catalogue-progress.mjs';

assert.deepEqual(FOUR_LANGUAGE_CODES, ['en', 'ja', 'zh-cn', 'ko']);
assert.equal(percent(3, 4), 75);
assert.equal(percent(0, 0), 0);
assert.equal(equalWeightPercent([100, 50, 25, 0]), 43.75);

const reportSql = [
  LANGUAGE_PROGRESS_SQL,
  RAW_DUPLICATION_SQL,
  LOGICAL_ASSET_DUPLICATION_SQL,
  STORAGE_OBJECT_DUPLICATION_SQL,
];
for (const sql of reportSql) {
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\b\s/i);
}
for (const sql of [LANGUAGE_PROGRESS_SQL, RAW_DUPLICATION_SQL]) {
  assert.match(sql, /'en'/);
  assert.match(sql, /'ja'/);
  assert.match(sql, /'zh-cn'/);
  assert.match(sql, /'ko'/);
  assert.doesNotMatch(sql, /'zh-tw'/);
}
assert.match(LOGICAL_ASSET_DUPLICATION_SQL, /from catalog\.assets asset/i);
assert.match(STORAGE_OBJECT_DUPLICATION_SQL, /object\.bucket_id = 'stackr-catalogue-public'/i);
assert.match(LANGUAGE_PROGRESS_SQL, /select distinct language_code, game_code, set_id, collector_number/i);
assert.match(LANGUAGE_PROGRESS_SQL, /select distinct language_code, canonical_key/i);
assert.match(LANGUAGE_PROGRESS_SQL, /asset\.derivative_list @>/i);
assert.match(RAW_DUPLICATION_SQL, /duplicate_record\.raw_payload = representative_record\.raw_payload/i);
assert.match(LOGICAL_ASSET_DUPLICATION_SQL, /partition by asset\.content_sha256/i);
assert.match(STORAGE_OBJECT_DUPLICATION_SQL, /partition by scoped\.etag, scoped\.object_bytes/i);

const languageRows = [
  {
    language_code: 'en', active_printing_rows: '12', active_printing_identities: '10',
    active_variant_rows: '10', active_variant_identities: '10',
    approved_provider_image_references: '8', physically_mirrored_images: '6', stackr_ready_images: '5',
  },
  {
    language_code: 'ja', active_printing_rows: '8', active_printing_identities: '8',
    active_variant_rows: '8', active_variant_identities: '8',
    approved_provider_image_references: '4', physically_mirrored_images: '4', stackr_ready_images: '2',
  },
  {
    language_code: 'zh-cn', active_printing_rows: '4', active_printing_identities: '4',
    active_variant_rows: '4', active_variant_identities: '4',
    approved_provider_image_references: '4', physically_mirrored_images: '3', stackr_ready_images: '3',
  },
  {
    language_code: 'ko', active_printing_rows: '2', active_printing_identities: '2',
    active_variant_rows: '2', active_variant_identities: '2',
    approved_provider_image_references: '0', physically_mirrored_images: '0', stackr_ready_images: '0',
  },
];
const fixtureResults = [
  { rows: languageRows },
  { rows: [{ extra_rows: '7', repeated_payload_bytes: '2048', payload_hash_collision_rows: '0' }] },
  { rows: [{ extra_rows: '2', estimated_repeated_logical_bytes: '512' }] },
  { rows: [{ extra_objects: '0', repeated_object_bytes: '0' }] },
];

const report = buildFourLanguageCatalogueProgressReport({
  languageRows,
  rawDuplicateRows: fixtureResults[1].rows,
  logicalAssetDuplicateRows: fixtureResults[2].rows,
  storageObjectDuplicateRows: fixtureResults[3].rows,
  generatedAt: '2026-08-29T00:00:00.000Z',
});
assert.equal(report.productionModified, false);
assert.equal(report.releaseEligible, false);
assert.equal(report.readOnly, true);
assert.equal(report.target, 'staging');
assert.equal(report.perLanguage.length, 4);
assert.equal(report.perLanguage[0].activePrintingIdentities, 10);
assert.equal(report.perLanguage[0].duplicatePrintingRows, 2);
assert.equal(report.perLanguage[0].approvedProviderImageReferencePercent, 80);
assert.equal(report.perLanguage[0].stackrMirroredDerivativeReadyPercent, 50);
assert.equal(report.overall.activePrintingIdentities, 24);
assert.equal(report.overall.activeVariantIdentities, 24);
assert.equal(report.overall.approvedProviderImageReferencePercent, 57.5);
assert.equal(report.overall.physicallyMirroredPercent, 46.25);
assert.equal(report.overall.stackrMirroredDerivativeReadyPercent, 37.5);
assert.equal(report.duplication.exactRawRevisions.extraRows, 7);
assert.equal(report.duplication.exactLogicalAssetContent.estimatedRepeatedLogicalBytes, 512);
assert.equal(report.duplication.exactStorageObjects.extraObjects, 0);

const seenSql = [];
const fakeClient = {
  async query(sql) {
    seenSql.push(sql);
    return fixtureResults[seenSql.length - 1];
  },
};
const collected = await collectFourLanguageCatalogueProgress(fakeClient, {
  generatedAt: '2026-08-29T00:00:00.000Z',
});
assert.equal(seenSql.length, 4);
assert.deepEqual(collected.overall, report.overall);

assert.doesNotThrow(() => assertStagingReportTarget({
  target: 'staging',
  projectRef: 'lmwfhvexfcoyeuoyrlco',
  connectionString: 'postgresql://postgres.lmwfhvexfcoyeuoyrlco:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
}));
assert.throws(() => assertStagingReportTarget({
  target: 'production',
  projectRef: 'oakdbbzdqwurpjnoqhmu',
  connectionString: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
}), /restricted to --target=staging/);

console.log('Four-language catalogue progress report tests passed.');
