import assert from 'node:assert/strict';
import {
  LOCAL_QUICK_SCAN_STATES,
  buildLocalQuickScanCandidateSummaries,
  buildLocalQuickScanResultViewModel,
  createLocalQuickScanSnapshot,
  getDiscreetConfidenceStatus,
  getLocalQuickScanCandidateDifferenceLabels,
  getLocalQuickScanGuidance,
  mapScannerCaptureStateToLocalQuickScanState,
  normaliseLocalQuickScanReason,
  shouldShowLocalQuickScanOfflineIndicator,
  transitionLocalQuickScan,
  type LocalQuickScanState,
} from '../lib/localQuickScanExperience';
import { createScannerDiagnostics } from '../lib/recognition/events';
import type { RecognitionCandidate, RecognitionResult } from '../lib/recognition/types';

const baseFlags = {
  localRecognitionEnabled: true,
  localRecognitionShadowMode: false,
  legacyCloudFallbackEnabled: false,
  scannerDiagnosticsEnabled: true,
  recognitionFeedbackEnabled: true,
};

function candidate(id: string, patch: Partial<RecognitionCandidate['identity']> = {}): RecognitionCandidate {
  return {
    identity: {
      id,
      name: patch.name ?? 'Pikachu',
      number: patch.number ?? '025',
      setId: patch.setId ?? 'base1',
      setName: patch.setName ?? 'Base Set',
      language: patch.language ?? 'en',
      imageSmall: patch.imageSmall ?? 'file:///pikachu-small.jpg',
      imageLarge: patch.imageLarge ?? 'file:///pikachu-large.jpg',
      rarity: patch.rarity ?? 'Holo',
    },
    confidence: 0.96,
    evidence: {
      visual: {
        similarity: 0.94,
        marginToSecond: 0.19,
        modelVersion: 'test-model',
      },
      reasons: ['fixture'],
    },
    engineId: 'local_on_device_v1',
  };
}

function result(outcome: RecognitionResult['outcome'], candidates: RecognitionCandidate[] = []): RecognitionResult {
  return {
    outcome,
    engineId: 'local_on_device_v1',
    candidates,
    acceptedCandidate: outcome === 'accepted' ? candidates[0] ?? null : null,
    diagnostics: createScannerDiagnostics({
      anonymousScanId: 'quick-scan-test',
      startedAt: '2026-07-26T00:00:00.000Z',
      totalDurationMs: 5,
    }),
    error: outcome === 'rescan_required'
      ? { code: 'model_not_ready', message: 'Local model is not approved yet.', retriable: true }
      : null,
  };
}

function assertStateSequence() {
  let snapshot = createLocalQuickScanSnapshot({
    scanId: 'quick-scan-test',
    destination: 'binder',
  });
  const seen = new Set<LocalQuickScanState>([snapshot.state]);

  const events = [
    { type: 'CAMERA_READY' as const },
    { type: 'CAPTURE_NEEDS_IMPROVEMENT' as const, reasonCode: 'move_closer' as const },
    { type: 'CARD_STABLE' as const },
    { type: 'CAPTURE_STARTED' as const, captureToken: 'capture-1' },
    { type: 'RECTIFICATION_STARTED' as const },
    { type: 'RECOGNITION_STARTED' as const },
    { type: 'RECOGNITION_ACCEPTED' as const, candidateId: 'base1-025' },
    { type: 'ADD_STARTED' as const, addKey: 'binder:base1-025' },
    { type: 'ADD_COMPLETE' as const },
    { type: 'RESET' as const },
    { type: 'CAMERA_READY' as const },
    { type: 'RECOVERABLE_ERROR' as const, reasonCode: 'camera_error' as const, message: 'Camera paused.' },
    { type: 'RESET' as const },
    { type: 'CAMERA_READY' as const },
    { type: 'CAPTURE_STARTED' as const, captureToken: 'capture-2' },
    { type: 'RECTIFICATION_STARTED' as const },
    { type: 'RECOGNITION_STARTED' as const },
    { type: 'RECOGNITION_REVIEW_REQUIRED' as const, candidateIds: ['a', 'b', 'c', 'd'] },
    { type: 'RESET' as const },
    { type: 'CAMERA_READY' as const },
    { type: 'CAPTURE_STARTED' as const, captureToken: 'capture-3' },
    { type: 'RECTIFICATION_STARTED' as const },
    { type: 'RECOGNITION_STARTED' as const },
    { type: 'RECOGNITION_RESCAN_REQUIRED' as const, reasonCode: 'unknown_card' as const },
  ];

  for (const event of events) {
    snapshot = transitionLocalQuickScan(snapshot, event);
    seen.add(snapshot.state);
  }

  assert.deepEqual([...seen].sort(), [...LOCAL_QUICK_SCAN_STATES].sort());
  assert.equal(snapshot.destination, 'binder');
}

function assertDuplicateAddBlocked() {
  let snapshot = createLocalQuickScanSnapshot({ scanId: 'duplicate-test' });
  snapshot = transitionLocalQuickScan(snapshot, { type: 'CAMERA_READY' });
  snapshot = transitionLocalQuickScan(snapshot, { type: 'RECOGNITION_ACCEPTED', candidateId: 'card-1' });
  snapshot = transitionLocalQuickScan(snapshot, { type: 'ADD_STARTED', addKey: 'collection:card-1' });
  const duplicateWhilePending = transitionLocalQuickScan(snapshot, { type: 'ADD_STARTED', addKey: 'collection:card-1' });
  assert.equal(duplicateWhilePending.state, 'adding_to_collection');
  assert.equal(duplicateWhilePending.duplicateAddPrevented, true);
  snapshot = transitionLocalQuickScan(snapshot, { type: 'ADD_COMPLETE' });
  const duplicateAfterComplete = transitionLocalQuickScan(snapshot, { type: 'ADD_STARTED', addKey: 'collection:card-1' });
  assert.equal(duplicateAfterComplete.state, 'complete');
  assert.equal(duplicateAfterComplete.duplicateAddPrevented, true);
}

function assertReviewTopThreeAndDifferences() {
  const cards = [
    { id: 'a', name: 'Charizard', set_name: 'Base Set', number: '4', language: 'en', editionHint: 'unlimited' },
    { id: 'b', name: 'Charizard', set_name: 'Base Set 2', number: '4', language: 'en', editionHint: 'unlimited' },
    { id: 'c', name: 'Charizard', set_name: 'Base Set', number: '4', language: 'ja', editionHint: '1st_edition' },
    { id: 'd', name: 'Charizard', set_name: 'Celebrations', number: '4', language: 'en', editionHint: 'classic' },
  ];
  const labels = getLocalQuickScanCandidateDifferenceLabels(cards);
  assert.ok(labels.a.includes('Base Set'));
  assert.ok(labels.b.includes('Base Set 2'));
  assert.ok(labels.c.includes('ja'));
  assert.ok(labels.c.includes('1st_edition'));

  const summaries = buildLocalQuickScanCandidateSummaries({
    candidates: cards,
    outcome: 'review_required',
    limit: 3,
  });
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].confidenceLabel, 'Needs review');
  assert.ok(summaries.every((summary) => summary.accessibilityLabel.length > 0));
}

function assertResultViewModelsDoNotGuess() {
  const accepted = buildLocalQuickScanResultViewModel(result('accepted', [candidate('base1-025')]));
  assert.equal(accepted.outcome, 'accepted');
  assert.equal(accepted.acceptedCandidate?.name, 'Pikachu');
  assert.equal(accepted.acceptedCandidate?.confidenceLabel, 'High confidence');

  const review = buildLocalQuickScanResultViewModel(result('review_required', [
    candidate('one', { setName: 'Base Set' }),
    candidate('two', { setName: 'Base Set 2' }),
    candidate('three', { language: 'ja' }),
    candidate('four', { setName: 'Promo' }),
  ]));
  assert.equal(review.outcome, 'review_required');
  assert.equal(review.reviewCandidates.length, 3);
  assert.equal(review.acceptedCandidate, null);

  const rescan = buildLocalQuickScanResultViewModel(result('rescan_required', []));
  assert.equal(rescan.outcome, 'rescan_required');
  assert.equal(rescan.acceptedCandidate, null);
  assert.equal(rescan.reviewCandidates.length, 0);
  assert.match(rescan.message, /model|local/i);
}

function assertGuidanceAndAccessibility() {
  const guidance = getLocalQuickScanGuidance({
    state: 'improve_capture',
    reasonCode: 'reduce_glare',
    showOfflineIndicator: true,
  });
  assert.equal(guidance.title, 'Reduce glare');
  assert.match(guidance.message, /Offline local scan mode/);
  assert.ok(guidance.accessibilityLabel.includes('Reduce glare'));
  assert.equal(normaliseLocalQuickScanReason('too-dark'), 'improve_lighting');
  assert.equal(normaliseLocalQuickScanReason('multiple_cards'), 'one_card_only');
  assert.equal(
    shouldShowLocalQuickScanOfflineIndicator({ featureFlags: baseFlags, networkAvailable: true }),
    true
  );
  assert.equal(
    shouldShowLocalQuickScanOfflineIndicator({
      featureFlags: { ...baseFlags, localRecognitionEnabled: false },
      networkAvailable: false,
    }),
    false
  );
}

function assertNoTechnicalConfidenceOrGradeCopy() {
  const labels = [
    getDiscreetConfidenceStatus({ outcome: 'accepted', confidence: 0.99 }).confidenceLabel,
    getDiscreetConfidenceStatus({ outcome: 'review_required', confidence: 0.64 }).confidenceLabel,
    buildLocalQuickScanResultViewModel(result('accepted', [candidate('base1-025')])).acceptedCandidate?.confidenceLabel ?? '',
  ];
  for (const label of labels) {
    assert.doesNotMatch(label, /\d+%/);
    assert.doesNotMatch(label, /\bgrade\b/i);
  }
}

function assertScannerStateMapping() {
  assert.equal(mapScannerCaptureStateToLocalQuickScanState({
    scannerState: 'INITIALISING',
    cameraReady: false,
    guidanceReady: false,
  }), 'opening_camera');
  assert.equal(mapScannerCaptureStateToLocalQuickScanState({
    scannerState: 'SEARCHING',
    cameraReady: true,
    guidanceReady: false,
  }), 'searching_for_card');
  assert.equal(mapScannerCaptureStateToLocalQuickScanState({
    scannerState: 'QUALITY_CHECK',
    cameraReady: true,
    guidanceReady: false,
    guidanceReason: 'glare',
  }), 'improve_capture');
  assert.equal(mapScannerCaptureStateToLocalQuickScanState({
    scannerState: 'IDENTIFYING',
    cameraReady: true,
    guidanceReady: true,
  }), 'recognising');
}

function assertManualSearchDoesNotResetState() {
  const snapshot = transitionLocalQuickScan(
    createLocalQuickScanSnapshot({ scanId: 'manual-search-test', modelWarm: true }),
    { type: 'CAMERA_READY' }
  );
  const manual = transitionLocalQuickScan(snapshot, { type: 'MANUAL_SEARCH_OPENED' });
  assert.equal(manual.state, 'searching_for_card');
  assert.equal(manual.manualSearchOpen, true);
  assert.equal(manual.modelWarm, true);
}

function assertModelWarmupNotRepeated() {
  let snapshot = createLocalQuickScanSnapshot({ scanId: 'warmup-test' });
  snapshot = transitionLocalQuickScan(snapshot, { type: 'MODEL_WARMUP_REQUESTED' });
  snapshot = transitionLocalQuickScan(snapshot, { type: 'MODEL_WARMED' });
  const warmedAgain = transitionLocalQuickScan(snapshot, { type: 'MODEL_WARMUP_REQUESTED' });
  assert.equal(warmedAgain.modelWarm, true);
  assert.equal(warmedAgain.modelWarmupRequested, true);
}

assertStateSequence();
assertDuplicateAddBlocked();
assertReviewTopThreeAndDifferences();
assertResultViewModelsDoNotGuess();
assertGuidanceAndAccessibility();
assertNoTechnicalConfidenceOrGradeCopy();
assertScannerStateMapping();
assertManualSearchDoesNotResetState();
assertModelWarmupNotRepeated();

console.log('local quick scan experience tests passed');
