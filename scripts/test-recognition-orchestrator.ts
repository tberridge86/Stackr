import assert from 'node:assert/strict';
import { recognizeCard, createRecognitionRequest } from '../lib/recognition/orchestratorCore';
import { createScannerDiagnostics } from '../lib/recognition/events';
import type { RecognitionFeatureFlags } from '../lib/recognition/featureFlags';
import type {
  CatalogueManifest,
  ModelManifest,
  RecognitionCandidate,
  RecognitionEngine,
  RecognitionRequest,
  RecognitionResult,
} from '../lib/recognition/types';

const allDisabledFlags: RecognitionFeatureFlags = {
  localRecognitionEnabled: false,
  localRecognitionShadowMode: false,
  legacyCloudFallbackEnabled: false,
  scannerDiagnosticsEnabled: true,
  recognitionFeedbackEnabled: true,
};

const localOnlyFlags: RecognitionFeatureFlags = {
  ...allDisabledFlags,
  localRecognitionEnabled: true,
};

const localWithLegacyFallbackFlags: RecognitionFeatureFlags = {
  ...localOnlyFlags,
  legacyCloudFallbackEnabled: true,
};

const manifest: ModelManifest = {
  id: 'test-model',
  engineId: 'local_on_device_v1',
  name: 'Test model',
  version: 'test-model-v1',
  createdAt: '2026-07-26',
  runtime: 'on_device',
  input: 'rectified_card_jpeg',
  weightsSource: null,
  license: null,
};

const catalogue: CatalogueManifest = {
  id: 'test-catalogue',
  name: 'Test catalogue',
  version: 'test-catalogue-v1',
  createdAt: '2026-07-26',
  languages: ['en'],
  sources: ['test'],
  schemaVersion: 'test-schema-v1',
  cardCount: 2,
};

const candidate: RecognitionCandidate = {
  identity: {
    id: 'sv1-025',
    name: 'Pikachu',
    number: '025',
    setId: 'sv1',
    setName: 'Scarlet & Violet',
    language: 'en',
  },
  confidence: 0.94,
  evidence: {
    providerScore: 0.94,
    visual: {
      modelVersion: manifest.version,
      similarity: 0.91,
      marginToSecond: 0.18,
    },
    reasons: ['test'],
  },
  engineId: 'local_on_device_v1',
};

function request(): RecognitionRequest {
  return createRecognitionRequest({
    anonymousScanId: 'scan-test',
    requestedAt: '2026-07-26T00:00:00.000Z',
    cards: [{ id: 'scan-test:image-0', base64: 'resized-test-image' }],
  });
}

function result(outcome: RecognitionResult['outcome'], candidates: RecognitionCandidate[] = []): RecognitionResult {
  return {
    outcome,
    engineId: 'local_on_device_v1',
    candidates,
    acceptedCandidate: outcome === 'accepted' ? candidates[0] ?? null : null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: 'scan-test',
      startedAt: '2026-07-26T00:00:00.000Z',
      totalDurationMs: 3,
      engineId: 'local_on_device_v1',
      modelManifest: manifest,
      catalogueManifest: catalogue,
    }),
    error: outcome === 'rescan_required'
      ? { code: 'NO_MATCH', message: 'No match.', retriable: true }
      : null,
  };
}

function engine(
  id: RecognitionEngine['id'],
  recognize: RecognitionEngine['recognize']
): RecognitionEngine {
  return {
    id,
    modelManifest: { ...manifest, engineId: id },
    catalogueManifest: catalogue,
    recognize,
  };
}

async function acceptedResult() {
  const local = engine('local_on_device_v1', async () => result('accepted', [candidate]));
  const actual = await recognizeCard(request(), {
    featureFlags: localOnlyFlags,
    engines: { local },
  });
  assert.equal(actual.outcome, 'accepted');
  assert.equal(actual.candidates[0]?.identity.id, 'sv1-025');
}

async function reviewRequiredResult() {
  const second = {
    ...candidate,
    identity: { ...candidate.identity, id: 'sv1-026', name: 'Raichu' },
    confidence: 0.88,
  };
  const local = engine('local_on_device_v1', async () => result('review_required', [candidate, second]));
  const actual = await recognizeCard(request(), {
    featureFlags: localOnlyFlags,
    engines: { local },
  });
  assert.equal(actual.outcome, 'review_required');
  assert.equal(actual.candidates.length, 2);
}

async function rescanRequiredResult() {
  const local = engine('local_on_device_v1', async () => result('rescan_required', []));
  const actual = await recognizeCard(request(), {
    featureFlags: localOnlyFlags,
    engines: { local },
  });
  assert.equal(actual.outcome, 'rescan_required');
  assert.equal(actual.candidates.length, 0);
}

async function engineTimeout() {
  const local = engine('local_on_device_v1', () => new Promise<RecognitionResult>(() => undefined));
  const actual = await recognizeCard(request(), {
    featureFlags: localOnlyFlags,
    engines: { local },
    engineTimeoutMs: 10,
  });
  assert.equal(actual.outcome, 'rescan_required');
  assert.ok(actual.diagnostics.events.some((event) => event.stage === 'engine_timeout'));
}

async function malformedEngineResponse() {
  const malformed = { outcome: 'accepted', candidates: [] } as unknown as RecognitionResult;
  const local = engine('local_on_device_v1', async () => malformed);
  const actual = await recognizeCard(request(), {
    featureFlags: localOnlyFlags,
    engines: { local },
  });
  assert.equal(actual.outcome, 'rescan_required');
  assert.ok(actual.diagnostics.events.some((event) => event.stage === 'engine_malformed'));
}

async function disabledFeatureFlags() {
  let localCalls = 0;
  const local = engine('local_on_device_v1', async () => {
    localCalls += 1;
    return result('accepted', [candidate]);
  });
  const actual = await recognizeCard(request(), {
    featureFlags: allDisabledFlags,
    engines: { local },
  });
  assert.equal(localCalls, 0);
  assert.equal(actual.outcome, 'rescan_required');
  assert.equal(actual.error?.code, 'RECOGNITION_ENGINES_DISABLED');
}

async function legacyEngineFallback() {
  let legacyCalls = 0;
  const local = engine('local_on_device_v1', async () => result('rescan_required', []));
  const legacyCandidate: RecognitionCandidate = { ...candidate, engineId: 'existing_legacy_engine' };
  const legacy = engine('existing_legacy_engine', async () => {
    legacyCalls += 1;
    return {
      ...result('review_required', [legacyCandidate]),
      engineId: 'existing_legacy_engine',
    };
  });
  const actual = await recognizeCard(request(), {
    featureFlags: localWithLegacyFallbackFlags,
    engines: { local, legacy },
  });
  assert.equal(legacyCalls, 1);
  assert.equal(actual.outcome, 'review_required');
  assert.equal(actual.engineId, 'existing_legacy_engine');
}

async function noForcedResultWhenBothEnginesFail() {
  const local = engine('local_on_device_v1', async () => {
    throw new Error('local failed');
  });
  const legacy = engine('existing_legacy_engine', async () => {
    throw new Error('legacy failed');
  });
  const actual = await recognizeCard(request(), {
    featureFlags: localWithLegacyFallbackFlags,
    engines: { local, legacy },
  });
  assert.equal(actual.outcome, 'rescan_required');
  assert.equal(actual.candidates.length, 0);
  assert.equal(actual.error?.code, 'NO_RECOGNITION_RESULT');
}

async function run() {
  await acceptedResult();
  await reviewRequiredResult();
  await rescanRequiredResult();
  await engineTimeout();
  await malformedEngineResponse();
  await disabledFeatureFlags();
  await legacyEngineFallback();
  await noForcedResultWhenBothEnginesFail();
  console.log('recognition orchestrator tests passed');
}

void run();
