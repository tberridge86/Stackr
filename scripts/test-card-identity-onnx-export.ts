import assert from 'node:assert/strict';
import {
  buildCardIdentityOnnxManifest,
  createCardIdentityPreprocessingSpec,
  getCardIdentityOnnxExportBlockers,
} from '../lib/cardIdentityOnnxExport';

const preprocessing = createCardIdentityPreprocessingSpec();
assert.deepEqual(preprocessing.inputDimensions, {
  batch: 1,
  channels: 3,
  height: 320,
  width: 224,
  dynamicDimensions: false,
});
assert.equal(preprocessing.colourOrder, 'RGB');
assert.equal(preprocessing.tensorLayout, 'NCHW');
assert.equal(preprocessing.output.dimensions, 128);
assert.equal(preprocessing.output.l2Normalised, true);

const blockers = getCardIdentityOnnxExportBlockers({
  sourceRun: {
    status: 'blocked',
    blockers: ['no_approved_training_pixels'],
    selectedBaseline: null,
  },
  checkpoint: {
    status: 'blocked',
    containsWeights: false,
  },
  testImageCount: 336,
  calibrationImageCount: 0,
});
assert.ok(blockers.includes('no_approved_embedding_model'));
assert.ok(blockers.includes('source_checkpoint_has_no_weights'));
assert.ok(blockers.includes('no_selected_source_baseline'));
assert.ok(blockers.includes('test_image_count_below_1000'));
assert.ok(blockers.includes('quantization_calibration_dataset_missing'));
assert.ok(blockers.includes('quantized_accuracy_unmeasured'));

const manifest = buildCardIdentityOnnxManifest({
  generatedAt: '2026-07-26T14:00:00.000Z',
  sourceRun: {
    status: 'blocked',
    blockers: ['no_approved_training_pixels', 'no_real_phone_test_captures'],
    selectedBaseline: null,
    datasetManifestSha256: 'a'.repeat(64),
    datasetVersion: 'stackr-pilot-recognition-dataset-v1.0.0',
    sourceCommitHash: 'b'.repeat(40),
    config: {
      modelVersion: 'stackr-embedding-v0.0.0-blocked',
    },
  },
  checkpoint: {
    modelVersion: 'stackr-embedding-v0.0.0-blocked',
    status: 'blocked',
    containsWeights: false,
    datasetManifestSha256: 'a'.repeat(64),
  },
  testImageCount: 336,
  calibrationImageCount: 0,
});

assert.equal(manifest.status, 'blocked');
assert.equal(manifest.approvedForMobileInference, false);
assert.equal(manifest.files.fullPrecisionModel.exists, false);
assert.equal(manifest.files.fullPrecisionModel.sha256, null);
assert.equal(manifest.validation.maximumEmbeddingDifference, null);
assert.equal(manifest.validation.nearestNeighbourParity, null);
assert.equal(manifest.quantization.int8.status, 'blocked');
assert.equal(manifest.benchmark.modelLoadTimeMs, null);

console.log('Card identity ONNX export guard tests passed.');
