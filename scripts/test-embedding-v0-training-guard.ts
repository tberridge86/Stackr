import assert from 'node:assert/strict';
import {
  buildEmbeddingV0TrainingRun,
  createEmbeddingV0TrainingConfig,
  getEmbeddingV0TrainingBlockers,
  type PilotDatasetSummary,
} from '../lib/embeddingV0Training';

function summary(overrides: Partial<PilotDatasetSummary> = {}): PilotDatasetSummary {
  return {
    datasetVersion: 'stackr-pilot-recognition-dataset-v1.0.0',
    rowCount: 1092,
    classCount: 52,
    sourceImageCount: 52,
    syntheticViewRowCount: 1040,
    realPhoneCaptureSourceCount: 0,
    approvedTrainingPixelSourceCount: 0,
    splitDistribution: [
      { key: 'train', count: 567 },
      { key: 'validation', count: 189 },
      { key: 'test', count: 336 },
    ],
    duplicateAnalysis: {
      sourceLeakageExists: false,
    },
    hardNegativeCoverage: {
      represented: 6,
      blocked: 4,
      total: 10,
    },
    limitations: ['synthetic-heavy'],
    ...overrides,
  };
}

const config = createEmbeddingV0TrainingConfig();
assert.equal(config.backbone.name, 'MobileNetV3 Small');
assert.equal(config.input.width, 224);
assert.equal(config.input.height, 320);
assert.equal(config.embedding.dimensions, 128);
assert.equal(config.embedding.l2Normalised, true);
assert.equal(config.baselinesCompared.length, 3);

const blocked = getEmbeddingV0TrainingBlockers(summary());
assert.ok(blocked.includes('no_approved_training_pixels'));
assert.ok(blocked.includes('no_real_phone_test_captures'));
assert.ok(!blocked.includes('source_leakage_detected'));

const leakageBlocked = getEmbeddingV0TrainingBlockers(summary({
  approvedTrainingPixelSourceCount: 10,
  realPhoneCaptureSourceCount: 3,
  duplicateAnalysis: { sourceLeakageExists: true },
}));
assert.ok(leakageBlocked.includes('source_leakage_detected'));

const run = buildEmbeddingV0TrainingRun({
  summary: summary(),
  datasetManifestSha256: 'a'.repeat(64),
  sourceCommitHash: 'b'.repeat(40),
  sourceTreeDirty: true,
  generatedAt: '2026-07-26T12:00:00.000Z',
});
assert.equal(run.status, 'blocked');
assert.equal(run.selectedBaseline, null);
assert.equal(run.baselines.length, 3);
assert.ok(run.baselines.every((baseline) => baseline.status === 'blocked'));
assert.equal(run.protectedTestSet.available, true);
assert.equal(run.protectedTestSet.hasRealPhoneCaptures, false);

const ready = buildEmbeddingV0TrainingRun({
  summary: summary({
    approvedTrainingPixelSourceCount: 52,
    realPhoneCaptureSourceCount: 12,
  }),
  datasetManifestSha256: 'c'.repeat(64),
  sourceCommitHash: 'd'.repeat(40),
  sourceTreeDirty: false,
});
assert.equal(ready.status, 'ready_to_train');
assert.equal(ready.blockers.length, 0);
assert.ok(ready.baselines.every((baseline) => baseline.status === 'not_started'));

console.log('Embedding V0 training guard tests passed.');
