import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CARD_IDENTITY_ONNX_MODEL_VERSION,
  buildCardIdentityOnnxManifest,
  type CardIdentityOnnxManifest,
  type EmbeddingCheckpointManifest,
  type EmbeddingSourceRun,
} from '../lib/cardIdentityOnnxExport';

const OUTPUT_DIR = 'assets/models/card_identity';
const MODEL_PATH = path.join(OUTPUT_DIR, 'model.onnx');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'model-manifest.json');
const MODEL_CARD_PATH = path.join(OUTPUT_DIR, 'MODEL_CARD.md');
const SOURCE_RUN_PATH = 'ml/models/stackr-embedding-v0/metrics.json';
const SOURCE_CHECKPOINT_PATH = 'ml/models/stackr-embedding-v0/checkpoints/checkpoint-blocked.json';

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, payload: unknown) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function assertNoApprovedModelOverwrite() {
  if (!existsSync(MANIFEST_PATH)) return;
  const existing = readJson<Record<string, unknown>>(MANIFEST_PATH);
  if (existing?.status === 'exported' || existing?.approvedForMobileInference === true || existsSync(MODEL_PATH)) {
    throw new Error('Refusing to overwrite an existing card identity ONNX model artifact.');
  }
}

function writeModelCard(manifest: CardIdentityOnnxManifest) {
  const blockers = manifest.blockers.map((blocker) => `- ${blocker}`).join('\n');
  const markdown = `# Stackr Card Identity ONNX Model

## Model Version

${CARD_IDENTITY_ONNX_MODEL_VERSION}

## Status

${manifest.status}

## Intended Use

Mobile inference for Stackr card-identity visual embeddings after an approved source model has been trained, evaluated and exported.

## Unsupported Use

This blocked artifact must not be used for production recognition, grading, pricing, identity forcing, or matching unknown cards to the nearest known card.

## Source Model

- Source model version: \`${manifest.sourceModel.modelVersion ?? 'none'}\`
- Source status: \`${manifest.sourceModel.status ?? 'missing'}\`
- Source checkpoint contains weights: \`${manifest.sourceModel.checkpointContainsWeights}\`
- Selected source baseline: \`${manifest.sourceModel.selectedBaseline ?? 'none'}\`
- Dataset manifest SHA-256: \`${manifest.sourceModel.datasetManifestSha256 ?? 'none'}\`

## Preprocessing Contract

- Fixed dimensions: \`1x3x320x224\`
- Colour order: \`${manifest.preprocessing.colourOrder}\`
- Pixel range: \`${manifest.preprocessing.pixelRange}\`
- Mean: \`${manifest.preprocessing.mean.join(', ')}\`
- Std: \`${manifest.preprocessing.std.join(', ')}\`
- Resize algorithm: \`${manifest.preprocessing.resizeAlgorithm}\`
- Crop behaviour: \`${manifest.preprocessing.cropBehaviour}\`
- Tensor layout: \`${manifest.preprocessing.tensorLayout}\`
- Output: 128-dimensional L2-normalised embedding

## ONNX Parity

- Required test images: \`${manifest.validation.requiredTestImages}\`
- Tested images: \`${manifest.validation.testedImages}\`
- Maximum embedding difference: \`${manifest.validation.maximumEmbeddingDifference ?? 'not measured'}\`
- Mean embedding difference: \`${manifest.validation.meanEmbeddingDifference ?? 'not measured'}\`
- Nearest-neighbour parity: \`${manifest.validation.nearestNeighbourParity ?? 'not measured'}\`

## Quantisation

- Full precision: \`${manifest.quantization.fullPrecision.status}\`
- FP16: \`${manifest.quantization.fp16.status}\`
- INT8: \`${manifest.quantization.int8.status}\`
- INT8 decision: ${manifest.quantization.int8.rejectionReason}

## Benchmarks

No mobile inference benchmark was recorded because no ONNX model binary was exported.

## Licence

${manifest.license.notes}

## Blockers

${blockers || '- None'}
`;

  writeFileSync(MODEL_CARD_PATH, markdown, 'utf8');
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  assertNoApprovedModelOverwrite();

  const sourceRun = readJson<EmbeddingSourceRun>(SOURCE_RUN_PATH);
  const checkpoint = readJson<EmbeddingCheckpointManifest>(SOURCE_CHECKPOINT_PATH);
  const manifest = buildCardIdentityOnnxManifest({
    sourceRun,
    checkpoint,
    testImageCount: 0,
    calibrationImageCount: 0,
  });

  if (manifest.status === 'exported') {
    throw new Error('Actual ONNX export is not implemented in this JavaScript guard. Use the PyTorch export path after source-model approval.');
  }

  writeJson(MANIFEST_PATH, manifest);
  writeModelCard(manifest);

  console.log(JSON.stringify({
    status: manifest.status,
    modelVersion: manifest.modelVersion,
    blockers: manifest.blockers,
    modelOnnxCreated: existsSync(MODEL_PATH),
    files: [MANIFEST_PATH, MODEL_CARD_PATH],
  }, null, 2));
}

main();
