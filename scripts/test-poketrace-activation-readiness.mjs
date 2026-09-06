import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPokeTraceActivationReadiness,
  resolveReviewedPokeTraceReportPath,
  resolveReviewedTerapeakRightsReviewPath,
} from './check-poketrace-activation-readiness.mjs';

const rightsReview = {
  schemaVersion: 'stackr-amber-rights-review-v1',
  featureKey: 'poketrace_terapeak_manual_benchmark',
  approvalStatus: 'approved',
  operatingBoundaryReference: 'docs/stackrtcg-ip-operating-boundary.md (effective 2026-09-04)',
  dataAsset: 'Manually labelled individual-sale comparison sample',
  source: 'eBay Product Research (Terapeak)',
  ownerOrLicensor: 'eBay',
  permittedPurpose: 'One-off manual validation of PokeTrace accuracy',
  territory: 'United Kingdom',
  term: 'Single reviewed benchmark exercise',
  transformationRights: 'Aggregate accuracy metrics and row-level mismatch review only',
  storageRights: 'Private raw sample; reviewed aggregate report in deployment checkout',
  deletionRequirements: 'Delete raw sample when the documented review retention ends',
  attribution: 'Internal source attribution retained with the review',
  downstreamDeliveryRights: 'No public or third-party delivery of raw Terapeak rows',
  approvingPerson: 'Test Reviewer',
  approvedAt: '2026-09-04T00:00:00.000Z',
  evidenceReferences: ['https://www.ebay.co.uk/help/selling/selling-tools/product-research?id=4853'],
  controls: {
    manualOnly: true,
    noScraping: true,
    noAutomation: true,
    no130point: true,
    privateRawSample: true,
    uniqueListingIdsOnly: true,
    privateEvidenceManifestRequired: true,
    providerEvidenceFingerprintsRequired: true,
    reviewerMustInspectPrivateEvidenceIndex: true,
    reviewerMustRecomputeProviderEvidenceFingerprints: true,
  },
};
const rightsReviewText = `${JSON.stringify(rightsReview, null, 2)}\n`;
const rightsReviewHash = createHash('sha256').update(rightsReviewText).digest('hex');
const report = {
  schemaVersion: 'stackr-poketrace-terapeak-benchmark-v2',
  offlineOnly: true,
  activationEligible: true,
  audit: {
    inputSchemaVersion: 'stackr-poketrace-terapeak-manual-sample-v1',
    inputSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    manifest: {
      schemaVersion: 'stackr-private-benchmark-evidence-manifest-v1',
      reviewer: 'Test Reviewer',
      capturedAt: '2026-09-04T00:30:00.000Z',
      rightsReviewReference: 'terapeak-rights-review.json',
      rightsReviewSha256: rightsReviewHash,
      sourceTermsReference: 'private/terapeak-terms-snapshot.txt',
      privateEvidenceIndexSha256: 'c'.repeat(64),
      retentionUntil: '2030-09-04T00:30:00.000Z',
      attestation: {
        manuallyCollected: true,
        noScraping: true,
        noAutomation: true,
        no130point: true,
        exactListingPairsReviewed: true,
        privateEvidenceIndexReviewed: true,
        providerEvidenceFingerprintsRecomputed: true,
      },
    },
  },
  thresholds: {
    minComparable: 30,
    maxMedianApe: 0.03,
    maxMeanApe: 0.04,
    maxSingleSaleApe: 0.05,
    maxMedianDateDeltaDays: 1,
    maxSingleSaleDateDeltaDays: 1,
  },
  metrics: {
    recordCount: 30,
    comparableCount: 30,
    nonComparableRows: 0,
    exactListingIdOverlap: 30,
    uniqueExactListingIds: 30,
    duplicateListingIds: 0,
    duplicateEvidenceReferences: 0,
    listingIdMismatches: 0,
    exactPriceMismatches: 0,
    invalidPriceRows: 0,
    medianAbsolutePercentageError: 0,
    meanAbsolutePercentageError: 0,
    maximumAbsolutePercentageError: 0,
    medianDateDeltaDays: 0,
    maximumDateDeltaDays: 0,
    identityMismatches: 0,
    gradeMismatches: 0,
    missingFields: 0,
    anomalyRows: 0,
    currencyMismatches: 0,
    invalidEvidenceHashes: 0,
    reviewerMismatches: 0,
    invalidCaptureTimestamps: 0,
  },
  failures: [],
  pass: true,
  issues: [],
};
const reportText = `${JSON.stringify(report, null, 2)}\n`;
const reportHash = createHash('sha256').update(reportText).digest('hex');
const activeEnv = {
  PRICING_ENGINE_V2_ENABLED: 'true',
  PRICING_V2_POKETRACE_SOLD_ENABLED: 'true',
  PRICING_V2_POKETRACE_SOLD_AUTHORISED: 'true',
  POKETRACE_API_KEY: 'test-only',
  POKETRACE_TERAPEAK_BENCHMARK_REPORT: 'reviewed-report.json',
  POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: reportHash,
  POKETRACE_TERAPEAK_RIGHTS_REVIEW: 'terapeak-rights-review.json',
  POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256: rightsReviewHash,
};

assert.deepEqual(
  checkPokeTraceActivationReadiness({ env: {}, reportText: null }),
  { active: false, ready: true, reason: 'provider_disabled' },
);
assert.equal(checkPokeTraceActivationReadiness({ env: activeEnv, reportText, rightsReviewText }).ready, true);

const workspaceRoot = mkdtempSync(join(tmpdir(), 'stackr-poketrace-readiness-'));
mkdirSync(join(workspaceRoot, 'reports'));
writeFileSync(join(workspaceRoot, 'reports', 'reviewed.json'), reportText);
writeFileSync(join(workspaceRoot, 'reports', 'terapeak-rights-review.json'), rightsReviewText);
const diskEnv = {
  ...activeEnv,
  POKETRACE_TERAPEAK_BENCHMARK_REPORT: 'reports/reviewed.json',
  POKETRACE_TERAPEAK_RIGHTS_REVIEW: 'reports/terapeak-rights-review.json',
};
assert.equal(checkPokeTraceActivationReadiness({ env: diskEnv, workspaceRoot }).ready, true);
assert.equal(
  resolveReviewedPokeTraceReportPath('reports/reviewed.json', workspaceRoot),
  join(workspaceRoot, 'reports', 'reviewed.json'),
);
assert.throws(() => resolveReviewedPokeTraceReportPath('../outside.json', workspaceRoot), /escapes the reviewed deployment checkout/);
assert.throws(() => resolveReviewedPokeTraceReportPath(join(workspaceRoot, 'reports', 'reviewed.json'), workspaceRoot), /must be relative/);
assert.throws(() => resolveReviewedTerapeakRightsReviewPath('../outside.json', workspaceRoot), /escapes the reviewed deployment checkout/);
assert.throws(() => resolveReviewedTerapeakRightsReviewPath(join(workspaceRoot, 'reports', 'terapeak-rights-review.json'), workspaceRoot), /must be relative/);

assert.throws(() => checkPokeTraceActivationReadiness({
  env: { ...activeEnv, PRICING_V2_POKETRACE_SOLD_AUTHORISED: 'false' },
  reportText,
  rightsReviewText,
}), /enabled and authorised flags must both be true/);
assert.throws(() => checkPokeTraceActivationReadiness({
  env: { ...activeEnv, PRICING_ENGINE_V2_ENABLED: 'false' },
  reportText,
  rightsReviewText,
}), /PRICING_ENGINE_V2_ENABLED must be true/);
assert.throws(() => checkPokeTraceActivationReadiness({
  env: { ...activeEnv, POKETRACE_API_KEY: '' },
  reportText,
  rightsReviewText,
}), /POKETRACE_API_KEY is missing/);

assert.throws(() => checkPokeTraceActivationReadiness({
  env: { ...activeEnv, POKETRACE_API_BASE_URL: 'https://example.invalid/v1' },
  reportText,
  rightsReviewText,
}), /POKETRACE_API_BASE_URL must be the reviewed official endpoint/);
assert.throws(() => checkPokeTraceActivationReadiness({
  env: { ...activeEnv, POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: '0'.repeat(64) },
  reportText,
  rightsReviewText,
}), /SHA-256 does not match/);

const pendingRightsReview = { ...rightsReview, approvalStatus: 'pending' };
const pendingRightsReviewText = `${JSON.stringify(pendingRightsReview)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256: createHash('sha256').update(pendingRightsReviewText).digest('hex'),
  },
  reportText,
  rightsReviewText: pendingRightsReviewText,
}), /Terapeak amber review is not approved/);

const internalApprovalOnly = {
  schemaVersion: 'stackr-internal-decision-record-v1',
  decisionKey: 'live_pricing_and_sold_evidence_rollout',
  decisionStatus: 'approved_with_external_stop_conditions',
  approvedBy: { name: 'StackrTCG internal approver' },
};
const internalApprovalOnlyText = `${JSON.stringify(internalApprovalOnly)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256: createHash('sha256').update(internalApprovalOnlyText).digest('hex'),
  },
  reportText,
  rightsReviewText: internalApprovalOnlyText,
}), /Terapeak amber review schema or feature key is invalid/);

const genericPokemonCompanyTerms = 'The Pokemon Company International Terms of Use: personal, noncommercial home use only.';
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256: createHash('sha256').update(genericPokemonCompanyTerms).digest('hex'),
  },
  reportText,
  rightsReviewText: genericPokemonCompanyTerms,
}), /Terapeak amber review is not valid JSON/);

const tooSmall = structuredClone(report);
tooSmall.metrics.recordCount = 29;
tooSmall.metrics.comparableCount = 29;
const tooSmallText = `${JSON.stringify(tooSmall)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(tooSmallText).digest('hex'),
  },
  reportText: tooSmallText,
  rightsReviewText,
}), /fewer than 30 exact comparable sales/);

const unresolvedAnomaly = structuredClone(report);
unresolvedAnomaly.metrics.anomalyRows = 1;
const anomalyText = `${JSON.stringify(unresolvedAnomaly)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(anomalyText).digest('hex'),
  },
  reportText: anomalyText,
  rightsReviewText,
}), /anomalyRows must be zero/);

const olderReportWithoutExactPriceMetric = structuredClone(report);
delete olderReportWithoutExactPriceMetric.metrics.exactPriceMismatches;
const olderReportText = `${JSON.stringify(olderReportWithoutExactPriceMetric)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(olderReportText).digest('hex'),
  },
  reportText: olderReportText,
  rightsReviewText,
}), /metrics\.exactPriceMismatches/);

const onePennyMismatch = structuredClone(report);
onePennyMismatch.metrics.exactPriceMismatches = 1;
const pennyMismatchText = `${JSON.stringify(onePennyMismatch)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(pennyMismatchText).digest('hex'),
  },
  reportText: pennyMismatchText,
  rightsReviewText,
}), /exactPriceMismatches must be zero/);

const looseSingleSale = structuredClone(report);
looseSingleSale.metrics.maximumAbsolutePercentageError = 0.051;
const looseSingleSaleText = `${JSON.stringify(looseSingleSale)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(looseSingleSaleText).digest('hex'),
  },
  reportText: looseSingleSaleText,
  rightsReviewText,
}), /matched sale price error exceeds 5%/);

const duplicateListings = structuredClone(report);
duplicateListings.metrics.uniqueExactListingIds = 29;
duplicateListings.metrics.duplicateListingIds = 1;
const duplicateText = `${JSON.stringify(duplicateListings)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(duplicateText).digest('hex'),
  },
  reportText: duplicateText,
  rightsReviewText,
}), /unique exact-listing comparable sale/);

const unboundEvidence = structuredClone(report);
unboundEvidence.audit.manifest.rightsReviewSha256 = 'f'.repeat(64);
const unboundText = `${JSON.stringify(unboundEvidence)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(unboundText).digest('hex'),
  },
  reportText: unboundText,
  rightsReviewText,
}), /not bound to the reviewed Terapeak approval/);

const separatelyApprovedTerapeakReview = structuredClone(rightsReview);
separatelyApprovedTerapeakReview.approvingPerson = 'Different Test Reviewer';
const separatelyApprovedTerapeakReviewText = `${JSON.stringify(separatelyApprovedTerapeakReview)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256: createHash('sha256').update(separatelyApprovedTerapeakReviewText).digest('hex'),
  },
  reportText,
  rightsReviewText: separatelyApprovedTerapeakReviewText,
}), /not bound to the reviewed Terapeak approval/);

const exploratoryOnly = structuredClone(report);
exploratoryOnly.activationEligible = false;
const exploratoryText = `${JSON.stringify(exploratoryOnly)}\n`;
assert.throws(() => checkPokeTraceActivationReadiness({
  env: {
    ...activeEnv,
    POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256: createHash('sha256').update(exploratoryText).digest('hex'),
  },
  reportText: exploratoryText,
  rightsReviewText,
}), /benchmark report did not pass/);

console.log('PokeTrace activation readiness tests passed.');
