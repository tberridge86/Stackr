import assert from 'node:assert/strict';
import { createScannerDiagnostics } from '../lib/recognition/events';
import { recognizeCard, createRecognitionRequest } from '../lib/recognition/orchestratorCore';
import type { RecognitionFeatureFlags } from '../lib/recognition/featureFlags';
import type {
  CatalogueManifest,
  ModelManifest,
  RecognitionCandidate,
  RecognitionEngine,
  RecognitionResult,
} from '../lib/recognition/types';

const baseFlags: RecognitionFeatureFlags = {
  localRecognitionEnabled: true,
  localRecognitionShadowMode: false,
  legacyCloudFallbackEnabled: false,
  scannerDiagnosticsEnabled: true,
  recognitionFeedbackEnabled: true,
  stackrApiEnabled: false,
  onDeviceEmbeddingEnabled: true,
  stackrRecognitionPrimary: false,
  imageFallbackEnabled: false,
  ximilarEmergencyFallback: false,
  scanFeedbackEnabled: true,
};

const manifest: ModelManifest = {
  id: 'test-model',
  engineId: 'local_on_device_v1',
  name: 'Test model',
  version: 'model-test',
  createdAt: '2026-07-28',
  runtime: 'on_device',
  input: 'rectified_card_jpeg',
  weightsSource: null,
  license: null,
};

const catalogue: CatalogueManifest = {
  id: 'catalogue-test',
  name: 'Catalogue test',
  version: 'catalogue-test',
  createdAt: '2026-07-28',
  languages: ['en'],
  sources: ['test'],
  schemaVersion: 'test',
  cardCount: 1,
};

const candidate: RecognitionCandidate = {
  identity: {
    id: 'pokemon:en:sv1:001:normal',
    name: 'Sprigatito',
    number: '001',
    setId: 'sv1',
    setName: 'Scarlet & Violet',
    language: 'en',
  },
  confidence: 0.94,
  evidence: {
    visual: {
      similarity: 0.92,
      finalScore: 0.94,
      marginToSecond: 0.18,
      modelVersion: 'model-test',
    },
    reasons: ['fixture'],
  },
  engineId: 'local_on_device_v1',
};

function request() {
  return createRecognitionRequest({
    anonymousScanId: 'stage8-routing-test',
    requestedAt: '2026-07-28T00:00:00.000Z',
    cards: [{
      id: 'card-1',
      uri: 'file:///rectified-card.jpg',
      width: 224,
      height: 320,
    }],
    ocrEvidence: {
      rawText: '001/198',
      language: 'en',
      setCode: 'SV1',
      printedNumber: {
        number: 1,
        total: 198,
        raw: '001/198',
      },
      probableScript: 'latin',
    },
    quality: {
      passed: true,
      score: 0.9,
      failureReasons: [],
      focusScore: 0.9,
      glareScore: 0.1,
      exposureScore: 0.8,
      framingScore: 0.9,
      stabilityScore: 0.9,
      cardCoverage: 0.4,
    },
  });
}

function result(engineId: RecognitionEngine['id'], outcome: RecognitionResult['outcome'], candidates: RecognitionCandidate[] = []): RecognitionResult {
  return {
    outcome,
    engineId,
    candidates: candidates.map((item) => ({ ...item, engineId })),
    acceptedCandidate: outcome === 'accepted' ? candidates[0] ?? null : null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: 'stage8-routing-test',
      startedAt: '2026-07-28T00:00:00.000Z',
      totalDurationMs: 1,
      engineId,
      modelManifest: { ...manifest, engineId },
      catalogueManifest: catalogue,
    }),
    error: outcome === 'rescan_required'
      ? { code: 'NO_MATCH', message: 'No match.', retriable: true }
      : null,
  };
}

function engine(id: RecognitionEngine['id'], recognize: RecognitionEngine['recognize']): RecognitionEngine {
  return {
    id,
    modelManifest: {
      ...manifest,
      id,
      engineId: id,
      runtime: id === 'stackr_api_v1' ? 'stackr_api' : id === 'existing_legacy_engine' ? 'legacy_backend' : 'on_device',
      input: id === 'stackr_api_v1' ? 'embedding_and_ocr' : id === 'existing_legacy_engine' ? 'resized_scan_images' : 'rectified_card_jpeg',
    },
    catalogueManifest: catalogue,
    recognize,
  };
}

async function acceptedLocalDoesNotCallStackrOrLegacy() {
  let stackrCalls = 0;
  let legacyCalls = 0;
  const actual = await recognizeCard(request(), {
    featureFlags: {
      ...baseFlags,
      stackrApiEnabled: true,
      stackrRecognitionPrimary: true,
      legacyCloudFallbackEnabled: true,
      ximilarEmergencyFallback: true,
    },
    engines: {
      local: engine('local_on_device_v1', async () => result('local_on_device_v1', 'accepted', [candidate])),
      stackrApi: engine('stackr_api_v1', async () => {
        stackrCalls += 1;
        return result('stackr_api_v1', 'review_required', [candidate]);
      }),
      legacy: engine('existing_legacy_engine', async () => {
        legacyCalls += 1;
        return result('existing_legacy_engine', 'review_required', [candidate]);
      }),
    },
  });

  assert.equal(actual.outcome, 'accepted');
  assert.equal(stackrCalls, 0);
  assert.equal(legacyCalls, 0);
}

async function stackrApiRunsBeforeEmergencyFallback() {
  let stackrCalls = 0;
  let legacyCalls = 0;
  const stackrCandidate: RecognitionCandidate = { ...candidate, engineId: 'stackr_api_v1', confidence: 0.89 };
  const actual = await recognizeCard(request(), {
    featureFlags: {
      ...baseFlags,
      stackrApiEnabled: true,
      stackrRecognitionPrimary: true,
      legacyCloudFallbackEnabled: true,
      ximilarEmergencyFallback: true,
    },
    engines: {
      local: engine('local_on_device_v1', async () => result('local_on_device_v1', 'rescan_required')),
      stackrApi: engine('stackr_api_v1', async () => {
        stackrCalls += 1;
        return result('stackr_api_v1', 'review_required', [stackrCandidate]);
      }),
      legacy: engine('existing_legacy_engine', async () => {
        legacyCalls += 1;
        return result('existing_legacy_engine', 'review_required', [candidate]);
      }),
    },
  });

  assert.equal(actual.engineId, 'stackr_api_v1');
  assert.equal(actual.outcome, 'review_required');
  assert.equal(stackrCalls, 1);
  assert.equal(legacyCalls, 0);
}

async function emergencyFallbackRequiresExplicitFlag() {
  let legacyCalls = 0;
  const disabled = await recognizeCard(request(), {
    featureFlags: {
      ...baseFlags,
      localRecognitionEnabled: true,
      stackrApiEnabled: true,
      stackrRecognitionPrimary: true,
      legacyCloudFallbackEnabled: true,
      ximilarEmergencyFallback: false,
    },
    engines: {
      local: engine('local_on_device_v1', async () => result('local_on_device_v1', 'rescan_required')),
      stackrApi: engine('stackr_api_v1', async () => result('stackr_api_v1', 'rescan_required')),
      legacy: engine('existing_legacy_engine', async () => {
        legacyCalls += 1;
        return result('existing_legacy_engine', 'review_required', [candidate]);
      }),
    },
  });
  assert.equal(disabled.outcome, 'rescan_required');
  assert.equal(legacyCalls, 0);

  const enabled = await recognizeCard(request(), {
    featureFlags: {
      ...baseFlags,
      localRecognitionEnabled: true,
      stackrApiEnabled: true,
      stackrRecognitionPrimary: true,
      legacyCloudFallbackEnabled: true,
      ximilarEmergencyFallback: true,
    },
    engines: {
      local: engine('local_on_device_v1', async () => result('local_on_device_v1', 'rescan_required')),
      stackrApi: engine('stackr_api_v1', async () => result('stackr_api_v1', 'rescan_required')),
      legacy: engine('existing_legacy_engine', async () => {
        legacyCalls += 1;
        return result('existing_legacy_engine', 'review_required', [candidate]);
      }),
    },
  });
  assert.equal(enabled.engineId, 'existing_legacy_engine');
  assert.equal(legacyCalls, 1);
}

async function run() {
  await acceptedLocalDoesNotCallStackrOrLegacy();
  await stackrApiRunsBeforeEmergencyFallback();
  await emergencyFallbackRequiresExplicitFlag();
  console.log('stackr mobile scanner routing checks passed');
}

void run();
