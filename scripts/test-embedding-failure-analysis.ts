import assert from 'node:assert/strict';
import {
  EMBEDDING_FAILURE_CATEGORIES,
  buildEmbeddingFailureAnalysisReport,
  categoriesForHardNegativeType,
  type HardNegativePayload,
} from '../lib/embeddingFailureAnalysis';

const hardNegatives: HardNegativePayload = {
  summary: {
    hardNegativeCoverage: {
      represented: 2,
      blocked: 0,
      total: 2,
    },
  },
  groups: [
    {
      groupId: 'same_art_set',
      type: 'identical_artwork_different_set',
      status: 'represented',
      difficulty: 'near_identical',
      members: [],
      reason: 'same art in different sets',
      notes: 'fixture',
    },
    {
      groupId: 'same_number_set',
      type: 'same_collector_number_different_set',
      status: 'represented',
      difficulty: 'hard',
      members: [],
      reason: 'collector number alone is ambiguous',
      notes: 'fixture',
    },
  ],
};

assert.deepEqual(
  categoriesForHardNegativeType('identical_artwork_different_language'),
  ['same_artwork', 'wrong_language', 'model_confusion']
);
assert.ok(categoriesForHardNegativeType('standard_versus_reverse_holo').includes('reverse_holo'));
assert.ok(categoriesForHardNegativeType('stamped_versus_unstamped').includes('promo_stamp'));

const report = buildEmbeddingFailureAnalysisReport({
  generatedAt: '2026-07-26T13:00:00.000Z',
  hardNegatives,
  v0: {
    status: 'blocked',
    blockers: ['no_approved_training_pixels', 'no_real_phone_test_captures'],
    datasetManifestSha256: 'a'.repeat(64),
    datasetVersion: 'stackr-pilot-recognition-dataset-v1.0.0',
    selectedBaseline: null,
    protectedTestSet: {
      available: true,
      rowCount: 336,
      hasRealPhoneCaptures: false,
    },
  },
});

assert.equal(report.status, 'blocked');
assert.ok(report.blockers.includes('v0_model_blocked'));
assert.ok(report.blockers.includes('no_approved_training_pixels'));
assert.equal(report.v1.status, 'not_advanced');
assert.equal(report.unknownCardPolicy.modelAdvanced, false);
assert.equal(report.retrievalVersusAcceptance.retrievalMetricsMeasured, false);
assert.equal(report.retrievalVersusAcceptance.acceptedMatchPrecisionMeasured, false);
assert.equal(report.confusionGroups.length, 2);
assert.equal(report.failureCategorySummary.same_artwork.candidateConfusionGroupCount, 1);
assert.equal(report.failureCategorySummary.wrong_set.candidateConfusionGroupCount, 2);
assert.equal(report.failureCategorySummary.ocr_conflict.candidateConfusionGroupCount, 1);

for (const category of EMBEDDING_FAILURE_CATEGORIES) {
  assert.ok(category in report.failureCategorySummary, `Missing category ${category}`);
}

console.log('Embedding failure-analysis tests passed.');
