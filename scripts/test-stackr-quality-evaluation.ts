import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUALITY_LANGUAGES,
  STACKR_QUALITY_SCHEMA_VERSION,
  STACKR_RELEASE_GATE_VERSION,
  STACKR_RELEASE_TARGETS,
  evaluateStackrQuality,
  type GoldTestCase,
  type GoldTestSetManifest,
  type PerformanceObservation,
  type QualityObservation,
} from '../lib/stackrQualityEvaluation';

const MIGRATION = 'supabase/migrations/20260728182743_stackr_quality_performance_observability.sql';
const ROLLBACK = 'supabase/manual/rollback_20260728182743_stackr_quality_performance_observability.sql';

function goldCase(index: number, overrides: Partial<GoldTestCase> = {}): GoldTestCase {
  return {
    caseId: `case-${index}`,
    imageId: `image-${index}`,
    physicalCardId: `physical-${index}`,
    captureSessionId: `session-${index}`,
    split: 'final_test',
    sourceKind: 'real_capture',
    authorizedForEvaluation: true,
    labelStatus: 'verified',
    expectedMatch: true,
    canonicalCardId: `card-${index}`,
    variantId: `variant-${index}`,
    finishCode: index % 2 ? 'normal' : 'parallel',
    language: QUALITY_LANGUAGES[index % QUALITY_LANGUAGES.length],
    era: index % 2 ? 'modern' : 'vintage',
    itemType: ['raw_card', 'sleeved_card', 'binder_capture', 'slab'][index % 4] as GoldTestCase['itemType'],
    captureConditions: [],
    finishClass: index % 2 ? 'normal' : 'parallel',
    valueTier: index % 2 ? 'common' : 'high_value',
    artworkGroupId: `artwork-${index}`,
    ...overrides,
  };
}

function manifest(cases: GoldTestCase[], approved = true): GoldTestSetManifest {
  return {
    schemaVersion: STACKR_QUALITY_SCHEMA_VERSION,
    datasetKey: 'quality-test-fixture',
    status: approved ? 'locked' : 'draft',
    generatedAt: '2026-07-28T00:00:00.000Z',
    evidencePolicy: {
      policyVersion: 'test-policy-v1',
      approved,
      approvedBy: approved ? 'test-reviewer' : null,
      minimumMetricDenominators: Object.fromEntries(
        Object.keys(STACKR_RELEASE_TARGETS).map((key) => [key, 1]),
      ),
    },
    cases,
    limitations: [],
  };
}

function observation(row: GoldTestCase, overrides: Partial<QualityObservation> = {}): QualityObservation {
  return {
    caseId: row.caseId,
    candidates: row.expectedMatch ? [{
      canonicalCardId: row.canonicalCardId,
      variantId: row.variantId,
      finishCode: row.finishCode,
    }] : [],
    matchStatus: row.expectedMatch ? 'exact' : 'no_match',
    autoConfirmed: row.expectedMatch,
    confidence: row.expectedMatch ? 0.999 : 0.1,
    calibratedThreshold: 0.995,
    manualCorrection: false,
    ximilarFallbackUsed: false,
    imageUploadUsed: false,
    totalLatencyMs: 100,
    modelVersion: 'test-model-v1',
    indexVersion: 'test-index-v1',
    ...overrides,
  };
}

const performance: PerformanceObservation[] = [
  { routeClass: 'catalogue_read', durationMs: 100, cacheStatus: 'HIT', statusCode: 200 },
  { routeClass: 'structured_search', durationMs: 200, statusCode: 200 },
  { routeClass: 'recognition_embedding', durationMs: 300, statusCode: 200 },
  { routeClass: 'image_fallback', durationMs: 1000, warm: true, statusCode: 200 },
];

const cases = [
  goldCase(0, { language: 'en', era: 'vintage', itemType: 'raw_card', captureConditions: ['glare'], finishClass: 'parallel', valueTier: 'high_value' }),
  goldCase(1, { language: 'ja', itemType: 'sleeved_card', captureConditions: ['blur'], finishClass: 'normal', valueTier: 'common' }),
  goldCase(2, { language: 'zh-Hans', era: 'vintage', itemType: 'binder_capture', captureConditions: ['perspective_distortion'] }),
  goldCase(3, { language: 'zh-Hant', itemType: 'slab', captureConditions: ['partial_crop'] }),
  goldCase(4, { language: 'ko', captureConditions: ['duplicate_artwork'], artworkGroupId: 'shared-artwork' }),
  goldCase(5, { captureConditions: ['duplicate_artwork'], artworkGroupId: 'shared-artwork' }),
  goldCase(6, { split: 'no_match_test', expectedMatch: false, canonicalCardId: null, variantId: null, finishCode: null, captureConditions: ['clean'] }),
];
const observations = cases.map((row) => observation(row));

const ready = evaluateStackrQuality({ manifest: manifest(cases), observations, performance });
assert.equal(ready.releaseGateVersion, STACKR_RELEASE_GATE_VERSION);
assert.equal(ready.claimStatus, 'release_candidate');
assert.ok(ready.releaseGates.every((gate) => gate.status === 'pass'));
assert.equal(ready.evidenceCounts.physicalCards, 7);
assert.equal(ready.evidenceCounts.captureSessions, 7);
assert.equal(ready.evidenceCounts.images, 7);
assert.equal(ready.evidenceCounts.variants, 6);
assert.deepEqual(ready.strataCoverage.missing, []);

const draft = evaluateStackrQuality({ manifest: manifest(cases, false), observations, performance });
assert.equal(draft.claimStatus, 'internal_only');
assert.ok(draft.releaseGates.every((gate) => gate.status === 'insufficient_data'));

const syntheticCases = cases.map((row) => ({ ...row, sourceKind: 'synthetic_supplement' as const }));
const synthetic = evaluateStackrQuality({ manifest: manifest(syntheticCases), observations, performance });
assert.notEqual(synthetic.claimStatus, 'release_candidate');
assert.equal(synthetic.evidenceCounts.realImages, 0);
assert.ok(synthetic.limitations.some((value) => value.includes('No authorised real captures')));

const leakyCases = cases.map((row, index) => index === 1
  ? { ...row, physicalCardId: cases[0].physicalCardId, split: 'model_selection' as const }
  : row);
const leaky = evaluateStackrQuality({ manifest: manifest(leakyCases), observations, performance });
assert.equal(leaky.leakage.physicalCardLeakage, true);
assert.notEqual(leaky.claimStatus, 'release_candidate');

const slow = evaluateStackrQuality({
  manifest: manifest(cases, false),
  observations,
  performance: [{ routeClass: 'catalogue_read', durationMs: 151, cacheStatus: 'HIT', statusCode: 200 }],
});
assert.equal(slow.releaseGates.find((gate) => gate.key === 'cached_catalogue_p95_ms')?.status, 'fail');
assert.equal(slow.releaseGates.find((gate) => gate.key === 'cached_catalogue_p95_ms')?.targetValue, 150);

const belowThreshold = evaluateStackrQuality({
  manifest: manifest(cases),
  observations: observations.map((row, index) => index === 0 ? { ...row, confidence: 0.8, autoConfirmed: true } : row),
  performance,
});
assert.equal(belowThreshold.releaseGates.find((gate) => gate.key === 'auto_confirm_below_threshold')?.status, 'fail');
assert.notEqual(belowThreshold.claimStatus, 'release_candidate');

const uncalibratedAutoConfirm = evaluateStackrQuality({
  manifest: manifest(cases),
  observations: observations.map((row, index) => index === 0 ? { ...row, calibratedThreshold: null, autoConfirmed: true } : row),
  performance,
});
assert.equal(uncalibratedAutoConfirm.releaseGates.find((gate) => gate.key === 'auto_confirm_below_threshold')?.status, 'fail');

const partial = evaluateStackrQuality({
  manifest: manifest(cases),
  observations: observations.slice(0, 1),
  performance,
});
assert.notEqual(partial.claimStatus, 'release_candidate');
assert.ok(partial.releaseGates.some((gate) => gate.status === 'insufficient_data'));
assert.ok(partial.limitations.some((value) => value.includes('have no observation')));

const fastFailurePerformance = performance.map((row) => row.routeClass === 'structured_search'
  ? { ...row, statusCode: 429, durationMs: 1 }
  : row);
const fastFailure = evaluateStackrQuality({ manifest: manifest(cases), observations, performance: fastFailurePerformance });
assert.equal(fastFailure.releaseGates.find((gate) => gate.key === 'structured_search_p95_ms')?.status, 'insufficient_data');

const emptyTemplate = JSON.parse(readFileSync('data/quality/gold-test-set.template.json', 'utf8')) as GoldTestSetManifest;
const empty = evaluateStackrQuality({ manifest: emptyTemplate, observations: [], performance: [] });
assert.equal(empty.claimStatus, 'blocked');
assert.ok(empty.releaseGates.every((gate) => gate.status === 'insufficient_data'));
assert.throws(() => evaluateStackrQuality({
  manifest: emptyTemplate,
  observations: [{ ...observation(cases[0]), caseId: 'unknown-case' }],
  performance: [],
}), /unknown gold case/);

const sql = readFileSync(MIGRATION, 'utf8');
assert.match(sql, /create schema if not exists audit/i);
assert.match(sql, /revoke all on schema audit from public, anon, authenticated/i);
assert.match(sql, /quality_gold_sets/i);
assert.match(sql, /quality_evaluation_runs/i);
assert.match(sql, /quality_release_gate_results/i);
assert.match(sql, /observability_trace_spans/i);
assert.match(sql, /provider_cost_observations/i);
assert.match(sql, /cost_per_1000_scans/i);
assert.doesNotMatch(sql, /image_(path|payload)|ocr_text|user_email/i);
assert.match(readFileSync(ROLLBACK, 'utf8'), /drop table if exists audit\.quality_gold_sets/i);

console.log('Stackr quality evaluation tests passed.');
