import assert from 'node:assert/strict';
import type { CardIdentityCatalogueManifest } from '../lib/cardIdentityCataloguePack';
import type { CardIdentityOnnxManifest } from '../lib/cardIdentityOnnxExport';
import {
  getLocalOnDeviceReadiness,
  runLocalOnDeviceV1Inference,
  resetLocalOnDeviceV1SessionForTests,
  warmLocalOnDeviceV1,
  type LocalOnDeviceInferenceEnvironment,
} from '../lib/recognition/localOnDeviceInference';
import { localOnDeviceV1Engine } from '../lib/recognition/engines/localOnDeviceV1';
import { createRecognitionRequest } from '../lib/recognition/orchestratorCore';

const blockedReadiness = getLocalOnDeviceReadiness();
assert.equal(blockedReadiness.ready, false);
assert.ok(blockedReadiness.blockers.includes('LOCAL_MODEL_BLOCKED'));
assert.ok(blockedReadiness.blockers.includes('LOCAL_MODEL_MISSING'));
assert.ok(blockedReadiness.blockers.includes('LOCAL_CATALOGUE_BLOCKED'));
assert.ok(blockedReadiness.blockers.includes('LOCAL_CATALOGUE_MISSING'));

const readyModelManifest: CardIdentityOnnxManifest = {
  ...blockedReadiness.modelManifest,
  modelVersion: 'stackr-card-identity-onnx-v-test',
  status: 'exported',
  approvedForMobileInference: true,
  blockers: [],
  files: {
    ...blockedReadiness.modelManifest.files,
    fullPrecisionModel: {
      path: 'assets/models/card_identity/model.onnx',
      exists: true,
      sha256: 'a'.repeat(64),
    },
  },
  validation: {
    ...blockedReadiness.modelManifest.validation,
    testedImages: 1000,
    pytorchOutputAvailable: true,
    onnxOutputAvailable: true,
    maximumEmbeddingDifference: 0.0001,
    meanEmbeddingDifference: 0.00001,
    nearestNeighbourParity: 1,
  },
};

const readyCatalogueManifest: CardIdentityCatalogueManifest = {
  ...blockedReadiness.catalogueManifest,
  status: 'ready',
  modelVersion: readyModelManifest.modelVersion,
  requiredInstalledModelVersion: readyModelManifest.modelVersion,
  approvedForInstall: true,
  installRejectionReason: null,
  embeddings: {
    ...blockedReadiness.catalogueManifest.embeddings,
    count: 2,
    missingCount: 0,
  },
  files: {
    ...blockedReadiness.catalogueManifest.files,
    embeddings: {
      ...blockedReadiness.catalogueManifest.files.embeddings,
      bytes: 64 + 2 * 128 * 2,
      sha256: 'b'.repeat(64),
    },
  },
  canonicalCards: {
    ...blockedReadiness.catalogueManifest.canonicalCards,
    count: 2,
    missingReasonCounts: {},
  },
} as CardIdentityCatalogueManifest;

function readyEnv(overrides: Partial<LocalOnDeviceInferenceEnvironment> = {}): LocalOnDeviceInferenceEnvironment {
  let createSessionCalls = 0;
  const env: LocalOnDeviceInferenceEnvironment = {
    modelManifest: readyModelManifest,
    catalogueManifest: readyCatalogueManifest,
    modelUri: 'file:///approved-model.onnx',
    createTensor: ({ data, dims }) => ({ data, dims }),
    createOnnxSession: async () => {
      createSessionCalls += 1;
      return {
        inputNames: ['input'],
        outputNames: ['embedding'],
        async run() {
          const embedding = new Float32Array(128);
          embedding[0] = 3;
          embedding[1] = 4;
          return { embedding: { data: embedding } };
        },
      };
    },
    preprocessImageToTensor: async () => new Float32Array(1 * 3 * 320 * 224).fill(0.25),
    loadSearchCatalogue: async () => ({
      status: 'loaded',
      engineVersion: 'test-search',
      modelVersion: readyModelManifest.modelVersion,
      packVersion: readyCatalogueManifest.packVersion,
      dimensions: 128,
      embeddingCount: 2,
      loadMs: 1,
      memoryBytes: 1024,
      message: null,
      details: null,
    }),
    runEmbeddingSearch: ({ queryEmbedding }) => {
      const norm = Math.sqrt(queryEmbedding.reduce((sum, value) => sum + value * value, 0));
      assert.ok(Math.abs(norm - 1) < 1e-6);
      return {
        status: 'success',
        engineVersion: 'test-search',
        modelVersion: readyModelManifest.modelVersion,
        packVersion: readyCatalogueManifest.packVersion,
        dimensions: 128,
        embeddingCount: 2,
        searchedCount: 2,
        candidateCount: 2,
        processingMs: 2,
        message: null,
        details: null,
        candidates: [
          { canonicalCardId: 'sv1-001', similarity: 0.98, rank: 1, language: 'en', setId: 'sv1', collectorNumber: '001' },
          { canonicalCardId: 'sv1-002', similarity: 0.91, rank: 2, language: 'en', setId: 'sv1', collectorNumber: '002' },
        ],
      };
    },
    ...overrides,
  };
  return Object.defineProperty(env, 'createSessionCalls', {
    get: () => createSessionCalls,
  }) as LocalOnDeviceInferenceEnvironment & { createSessionCalls: number };
}

function requestWithUri() {
  return createRecognitionRequest({
    anonymousScanId: 'local-test',
    requestedAt: '2026-07-26T00:00:00.000Z',
    cards: [{ id: 'card-1', uri: 'file:///recognition.png', width: 224, height: 320 }],
  });
}

async function blockedCurrentManifests() {
  const result = await runLocalOnDeviceV1Inference(requestWithUri());
  assert.equal(result.status, 'blocked');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.error.code, 'LOCAL_MODEL_BLOCKED');

  const engineResult = await localOnDeviceV1Engine.recognize(requestWithUri());
  assert.equal(engineResult.outcome, 'rescan_required');
  assert.equal(engineResult.candidates.length, 0);
  assert.equal(engineResult.error?.code, 'LOCAL_MODEL_BLOCKED');
}

async function incompatibleVersions() {
  const result = getLocalOnDeviceReadiness({
    modelManifest: readyModelManifest,
    catalogueManifest: {
      ...readyCatalogueManifest,
      requiredInstalledModelVersion: 'different-model',
    } as CardIdentityCatalogueManifest,
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes('LOCAL_MODEL_CATALOGUE_INCOMPATIBLE'));
}

async function uriRequiredNoBase64() {
  const env = readyEnv();
  const result = await runLocalOnDeviceV1Inference(
    createRecognitionRequest({
      anonymousScanId: 'base64-only',
      cards: [{ id: 'card-1', base64: 'not-accepted' }],
    }),
    env
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'LOCAL_IMAGE_URI_REQUIRED');
}

async function sessionCachedAndCandidatesReturned() {
  await resetLocalOnDeviceV1SessionForTests();
  const env = readyEnv() as LocalOnDeviceInferenceEnvironment & { createSessionCalls: number };
  const first = await runLocalOnDeviceV1Inference(requestWithUri(), env);
  const second = await runLocalOnDeviceV1Inference(requestWithUri(), env);
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  assert.equal(first.candidates[0]?.canonicalCardId, 'sv1-001');
  assert.equal(env.createSessionCalls, 1);
  await resetLocalOnDeviceV1SessionForTests();
}

async function warmUsesCachedSession() {
  await resetLocalOnDeviceV1SessionForTests();
  const env = readyEnv() as LocalOnDeviceInferenceEnvironment & { createSessionCalls: number };
  const warm = await warmLocalOnDeviceV1(env);
  const scan = await runLocalOnDeviceV1Inference(requestWithUri(), env);
  assert.equal(warm.status, 'ready');
  assert.equal(scan.status, 'success');
  assert.equal(env.createSessionCalls, 1);
  await resetLocalOnDeviceV1SessionForTests();
}

async function invalidTensorFails() {
  await resetLocalOnDeviceV1SessionForTests();
  const result = await runLocalOnDeviceV1Inference(requestWithUri(), readyEnv({
    preprocessImageToTensor: async () => new Float32Array(12),
  }));
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'LOCAL_INVALID_TENSOR');
  await resetLocalOnDeviceV1SessionForTests();
}

async function inferenceTimeoutFails() {
  await resetLocalOnDeviceV1SessionForTests();
  const result = await runLocalOnDeviceV1Inference(requestWithUri(), readyEnv({
    inferenceTimeoutMs: 5,
    createOnnxSession: async () => ({
      inputNames: ['input'],
      outputNames: ['embedding'],
      run: () => new Promise(() => undefined),
    }),
  }));
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'LOCAL_INFERENCE_TIMEOUT');
  await resetLocalOnDeviceV1SessionForTests();
}

async function run() {
  await blockedCurrentManifests();
  await incompatibleVersions();
  await uriRequiredNoBase64();
  await sessionCachedAndCandidatesReturned();
  await warmUsesCachedSession();
  await invalidTensorFails();
  await inferenceTimeoutFails();
  console.log('local on-device inference tests passed');
}

void run();
