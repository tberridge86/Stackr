#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  renderCatalogueGapSummary,
  validateCatalogueGapSummary,
} from './catalogue-gap-summary.mjs';

const workflow = readFileSync('.github/workflows/catalogue-gap-report.yml', 'utf8');

assert.match(workflow, /environment: staging/);
assert.match(workflow, /SUPABASE_URL: https:\/\/lmwfhvexfcoyeuoyrlco\.supabase\.co/);
assert.match(workflow, /SUPABASE_SECRET_KEY: \$\{\{ secrets\.SUPABASE_STAGING_SECRET_KEY \}\}/);
assert.match(workflow, /STACKR_CATALOGUE_IMPORT_TARGET: staging/);
assert.match(workflow, /scripts\/catalogue-master\.ts report/);
assert.match(workflow, /--target=staging/);
assert.match(workflow, /--dry-run/);
assert.match(workflow, /--languages=en,ja,zh-cn,ko/);
assert.doesNotMatch(workflow, /scripts\/catalogue-master\.ts (?:apply|publish)/);
assert.doesNotMatch(workflow, /--apply(?:\s|$)/m);
assert.match(workflow, /\/report-stackr-catalogue-gaps/);
assert.match(workflow, /github\.event\.issue\.number == 74/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /stackr-catalogue-gap-report-\$\{\{ github\.run_id \}\}/);
for (const file of [
  'master-coverage.csv',
  'pikaqian-coverage.csv',
  'missing-card-records.csv',
  'missing-card-images.csv',
  'missing-set-art.csv',
  'image-leftovers.csv',
  'exact-approved-image-candidates.csv',
  'same-artwork-references.csv',
  'scan-acquisition-queue.csv',
  'conflicts.csv',
  'rights-blocked.csv',
  'summary.json',
]) {
  assert.match(workflow, new RegExp(file.replaceAll('.', '\\.')));
}

const fixture = {
  generatedAt: '2026-08-31T12:00:00.000Z',
  target: 'staging',
  stagingProjectRef: 'lmwfhvexfcoyeuoyrlco',
  readOnly: true,
  sourceOfTruth: 'staging_supabase',
  productionModified: false,
  totals: {
    exactApprovedImageCandidates: 12,
    sameArtworkReferences: 3,
    scanAcquisitionQueue: 4,
    missingCardRecordRows: 5,
    missingRequiredVariants: 6,
    missingSetArt: 7,
    conflicts: 8,
    rightsBlocked: 9,
  },
  providerReports: { pikaqianCoverageRows: 10 },
  byLanguage: [{
    language: 'ja',
    sets: 2,
    expectedCards: 100,
    storedCardRecords: 90,
    exactNativeImages: 75,
    missingExactNativeImages: 25,
    conflicts: 1,
  }],
  cardImageInventory: {
    totals: {
      assets: 100,
      withStorageObject: 80,
      withContentSha256: 70,
      storedMissingRequiredDerivatives: 20,
      requiredDerivativesReady: 60,
    },
    groups: [{
      provider: 'tcgdex',
      storageProvider: 'supabase_storage',
      unavailableReason: 'none',
      assets: 100,
      withStorageObject: 80,
      withContentSha256: 70,
      derivativeRoleCounts: {
        'card-grid': 61,
        'search-result': 62,
        'detail-page': 63,
      },
      requiredDerivativesReady: 60,
    }],
  },
};

const markdown = renderCatalogueGapSummary(fixture);
assert.match(markdown, /Group A — exact approved image candidate \| 12/);
assert.match(markdown, /Stored images missing one or more required derivatives \| 20/);
assert.match(markdown, /\| ja \| 2 \| 90% \| 75% \| 25 \| 1 \|/);
assert.match(markdown, /\| tcgdex \| supabase_storage \| none \| 100 \| 80 \| 70 \| 61 \| 62 \| 63 \| 60 \|/);
assert.match(markdown, /PikaQian coverage rows: \*\*10\*\*/);

assert.throws(
  () => validateCatalogueGapSummary({ ...fixture, target: 'production' }),
  /target_must_be_staging/,
);
assert.throws(
  () => validateCatalogueGapSummary({ ...fixture, productionModified: true }),
  /production_modified_contract_failed/,
);

console.log('Catalogue gap report tests passed.');
