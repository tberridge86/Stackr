import assert from 'node:assert/strict';
import {
  buildRecognitionShadowModeSnapshot,
  cardLikeToShadowIdentity,
  classifyShadowModeDisagreement,
  createShadowModePilotRecord,
} from '../lib/recognitionShadowModePilotCore';
import { recognizeCard, createRecognitionRequest } from '../lib/recognition/orchestratorCore';
import { createScannerDiagnostics } from '../lib/recognition/events';
import type { RecognitionFeatureFlags } from '../lib/recognition/featureFlags';
import type {
  CatalogueManifest,
  ModelManifest,
  RecognitionCandidate,
  RecognitionEngine,
  RecognitionResult,
} from '../lib/recognition/types';

const manifest: ModelManifest = {
  id: 'test-model',
  engineId: 'local_on_device_v1',
  name: 'Test model',
  version: 'test-model-v1',
  createdAt: '2026-07-27',
  runtime: 'on_device',
  input: 'rectified_card_jpeg',
  weightsSource: null,
  license: null,
};

const catalogue: CatalogueManifest = {
  id: 'test-catalogue',
  name: 'Test catalogue',
  version: 'test-catalogue-v1',
  createdAt: '2026-07-27',
  languages: ['en', 'ja'],
  sources: ['test'],
  schemaVersion: 'test-schema-v1',
  cardCount: 3,
};

const shadowFlags: RecognitionFeatureFlags = {
  localRecognitionEnabled: false,
  localRecognitionShadowMode: true,
  legacyCloudFallbackEnabled: true,
  scannerDiagnosticsEnabled: true,
  recognitionFeedbackEnabled: true,
  stackrApiEnabled: false,
  onDeviceEmbeddingEnabled: false,
  stackrRecognitionPrimary: false,
  imageFallbackEnabled: false,
  ximilarEmergencyFallback: true,
  scanFeedbackEnabled: true,
};

type CandidatePatch = Omit<Partial<RecognitionCandidate>, 'identity' | 'evidence'> & {
  identity?: Partial<RecognitionCandidate['identity']>;
  evidence?: Partial<RecognitionCandidate['evidence']>;
};

function candidate(patch: CandidatePatch = {}): RecognitionCandidate {
  return {
    identity: {
      id: 'sv1-025',
      name: 'Pikachu',
      number: '025',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      language: 'en',
      ...(patch.identity ?? {}),
    },
    confidence: patch.confidence ?? 0.91,
    evidence: {
      visual: {
        similarity: 0.9,
        marginToSecond: 0.18,
      },
      reasons: ['test'],
      ...(patch.evidence ?? {}),
    },
    engineId: patch.engineId ?? 'local_on_device_v1',
    raw: patch.raw ?? { variantResolution: { variantId: 'normal' } },
  };
}

function result(
  engineId: RecognitionResult['engineId'],
  candidates: RecognitionCandidate[],
  errorCode?: string
): RecognitionResult {
  return {
    outcome: candidates.length ? 'review_required' : 'rescan_required',
    engineId,
    candidates,
    acceptedCandidate: null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: 'shadow-scan-1',
      startedAt: '2026-07-27T09:00:00.000Z',
      totalDurationMs: engineId === 'local_on_device_v1' ? 24 : 710,
      engineId,
      modelManifest: { ...manifest, engineId },
      catalogueManifest: catalogue,
    }),
    error: errorCode
      ? { code: errorCode, message: errorCode, retriable: false }
      : null,
  };
}

function exactIdentity() {
  return cardLikeToShadowIdentity({
    id: 'sv1-025',
    name: 'Pikachu',
    set_id: 'sv1',
    number: '025',
    language: 'en',
    variant: 'normal',
  })!;
}

function classificationUsesConfirmedIdentity() {
  const visible = result('existing_legacy_engine', [
    candidate({ engineId: 'existing_legacy_engine' }),
  ]);
  const localWrong = result('local_on_device_v1', [
    candidate({
      identity: { id: 'sv1-026', name: 'Raichu', number: '026', setId: 'sv1' },
    }),
  ]);
  const snapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: visible,
    localResult: localWrong,
    localRunDurationMs: 22,
  });
  const classified = classifyShadowModeDisagreement({
    snapshot,
    confirmedIdentity: exactIdentity(),
  });
  assert.equal(classified.category, 'current_provider_correct_local_wrong');
}

function localCanBeatVisible() {
  const visibleWrong = result('existing_legacy_engine', [
    candidate({
      engineId: 'existing_legacy_engine',
      identity: { id: 'sv1-026', name: 'Raichu', number: '026', setId: 'sv1' },
    }),
  ]);
  const local = result('local_on_device_v1', [candidate()]);
  const snapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: visibleWrong,
    localResult: local,
  });
  const classified = classifyShadowModeDisagreement({
    snapshot,
    confirmedIdentity: exactIdentity(),
  });
  assert.equal(classified.category, 'local_correct_current_provider_wrong');
}

function variantAndLanguageDisagreementsAreSeparate() {
  const visible = result('existing_legacy_engine', [
    candidate({ engineId: 'existing_legacy_engine', raw: { variantResolution: { variantId: 'normal' } } }),
  ]);
  const reverse = result('local_on_device_v1', [
    candidate({ raw: { variantResolution: { variantId: 'reverse_holo' } } }),
  ]);
  const variantSnapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: visible,
    localResult: reverse,
  });
  assert.equal(variantSnapshot.agreement.disagreementCategory, 'exact_identity_agreement_variant_disagreement');

  const japanese = result('local_on_device_v1', [
    candidate({ identity: { language: 'ja' } }),
  ]);
  const languageSnapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: visible,
    localResult: japanese,
  });
  assert.equal(languageSnapshot.agreement.disagreementCategory, 'language_disagreement');
}

function unavailableLocalIsNotAFakeDisagreement() {
  const visible = result('existing_legacy_engine', [
    candidate({ engineId: 'existing_legacy_engine' }),
  ]);
  const localBlocked = result('local_on_device_v1', [], 'LOCAL_MODEL_BLOCKED');
  const snapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: visible,
    localResult: localBlocked,
  });
  assert.equal(snapshot.agreement.disagreementCategory, 'local_unavailable');
}

function recordNeverIncludesRawImages() {
  const snapshot = buildRecognitionShadowModeSnapshot({
    anonymousScanId: 'shadow-scan-1',
    visibleResult: result('existing_legacy_engine', [candidate({ engineId: 'existing_legacy_engine' })]),
    localResult: result('local_on_device_v1', [candidate()]),
  });
  const record = createShadowModePilotRecord({
    shadowSnapshot: snapshot,
    userOutcome: {
      action: 'confirm_result',
      confirmedIdentity: exactIdentity(),
      confirmedAt: '2026-07-27T09:01:00.000Z',
      source: 'feedback_panel',
    },
    captureQuality: {},
    ocrEvidenceSummary: { printedNumber: '025' },
    appContext: { mode: 'market' },
    createdAt: '2026-07-27T09:01:00.000Z',
  });
  assert.equal(record.rawImageRecorded, false);
  assert.equal(record.shadowSnapshot.rawImageRecorded, false);
  assert.equal(record.disagreementCategory, 'both_correct');
}

async function orchestratorPreservesVisibleResult() {
  let localCalls = 0;
  let legacyCalls = 0;
  const localEngine: RecognitionEngine = {
    id: 'local_on_device_v1',
    modelManifest: manifest,
    catalogueManifest: catalogue,
    async recognize() {
      localCalls += 1;
      return result('local_on_device_v1', [candidate()]);
    },
  };
  const legacyEngine: RecognitionEngine = {
    id: 'existing_legacy_engine',
    modelManifest: { ...manifest, engineId: 'existing_legacy_engine' },
    catalogueManifest: catalogue,
    async recognize() {
      legacyCalls += 1;
      return result('existing_legacy_engine', [
        candidate({ engineId: 'existing_legacy_engine' }),
      ]);
    },
  };
  const actual = await recognizeCard(createRecognitionRequest({
    anonymousScanId: 'shadow-scan-1',
    requestedAt: '2026-07-27T09:00:00.000Z',
    cards: [{ id: 'card-1', base64: 'resized-image' }],
  }), {
    featureFlags: shadowFlags,
    engines: {
      local: localEngine,
      legacy: legacyEngine,
    },
  });
  assert.equal(localCalls, 1);
  assert.equal(legacyCalls, 1);
  assert.equal(actual.engineId, 'existing_legacy_engine');
  assert.equal(actual.diagnostics.shadowMode?.local.topCandidates[0]?.canonicalCardId, 'sv1-025');
}

async function run() {
  classificationUsesConfirmedIdentity();
  localCanBeatVisible();
  variantAndLanguageDisagreementsAreSeparate();
  unavailableLocalIsNotAFakeDisagreement();
  recordNeverIncludesRawImages();
  await orchestratorPreservesVisibleResult();
  console.log('shadow-mode pilot tests passed');
}

void run();
