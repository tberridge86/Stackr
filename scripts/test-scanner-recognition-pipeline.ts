import assert from 'node:assert/strict';
import {
  buildScannerTimingLadder,
  decideScannerConfirmation,
  NO_TRADING_CARD_DETECTED_MESSAGE,
  rankScannerCandidates,
  validateScannerFrame,
  type ScannerCandidateInput,
} from '../lib/scannerRecognitionPipeline';
import { getDefaultScannerThresholdSet } from '../lib/scannerCalibration';
import type { ScanQualityResult } from '../lib/scanQuality';

function quality(overrides: Partial<ScanQualityResult> = {}): ScanQualityResult {
  return {
    passed: true,
    focusScore: 0.8,
    glareScore: 0.8,
    exposureScore: 0.8,
    framingScore: 0.8,
    stabilityScore: 0.8,
    obstructionScore: 0.8,
    perspectiveScore: 0.8,
    sleeveReflectionScore: 0.8,
    failures: [],
    instruction: null,
    instructionText: 'Card found. Hold steady...',
    thresholds: {
      minFocusScore: 0.42,
      minExposureScore: 0.42,
      minGlareScore: 0.3,
      minFramingScore: 0.6,
      minStabilityScore: 0.58,
      minObstructionScore: 0.72,
      minPerspectiveScore: 0.46,
      minCardCoverage: 0.08,
      maxCardCoverage: 0.84,
      maxBrightRatio: 0.22,
      maxGlareRatio: 0.24,
      maxSkinRatio: 0.13,
      maxCenterShiftRatio: 0.085,
      maxAreaChangeRatio: 0.18,
      maxPerspectiveDistortion: 0.34,
    },
    metrics: {
      brightness: 120,
      contrast: 50,
      darkRatio: 0.01,
      brightRatio: 0.01,
      glareRatio: 0.01,
      edgeDensity: 0.08,
      focusGradientP90: 70,
      skinRatio: 0.01,
      cardCoverage: 0.2,
      guideOverlap: 0.9,
      cornersVisible: true,
      centerShiftRatio: null,
      areaChangeRatio: null,
      perspectiveDistortion: 0.04,
      sleeveReflectionRatio: 0.01,
    },
    ...overrides,
  };
}

const noCard = validateScannerFrame({
  quality: quality({
    metrics: {
      ...quality().metrics,
      cardCoverage: 0.01,
    },
  }),
  localisation: { status: 'failed' } as any,
});

assert.equal(noCard.canContinue, false);
assert.equal(noCard.rejectionReason, 'no_trading_card');
assert.equal(noCard.message, NO_TRADING_CARD_DETECTED_MESSAGE);

const validFrame = validateScannerFrame({
  quality: quality(),
  localisation: {
    status: 'confident',
    confidence: { frameCoverage: 0.22 },
  } as any,
});
assert.equal(validFrame.canContinue, true);

const candidates: ScannerCandidateInput[] = [
  {
    id: 'weak-visual',
    name: 'Pikachu',
    setId: 'sv1',
    collectorNumber: '025',
    language: 'en',
    confidence: 0.92,
    evidence: { providerScore: 0.92 },
  },
  {
    id: 'complete-evidence',
    name: 'Pikachu',
    setId: 'sv1',
    collectorNumber: '025',
    language: 'en',
    confidence: 0.75,
    evidence: {
      providerScore: 0.75,
      artworkEmbedding: 0.94,
      collectorNumber: 1,
      cardNameOcr: 1,
      setSymbol: 1,
      language: 1,
    },
  },
];

const ranked = rankScannerCandidates({ candidates });
assert.equal(ranked[0].id, 'complete-evidence');
assert.ok(ranked[0].score > ranked[1].score);

const thresholds = getDefaultScannerThresholdSet().thresholds.recognition;
const cautiousDecision = decideScannerConfirmation({
  frameValidation: validFrame,
  candidates: ranked,
  thresholds,
});
assert.equal(cautiousDecision.decision, 'show_candidates');

const autoDecision = decideScannerConfirmation({
  frameValidation: validFrame,
  candidates: [
    { ...ranked[0], confidence: thresholds.localAutoConfirmConfidence + 0.04 },
    { ...ranked[1], confidence: thresholds.localAutoConfirmConfidence - 0.08 },
  ],
  thresholds,
});
assert.equal(autoDecision.decision, 'auto_confirm');
assert.equal(autoDecision.autoConfirmedCandidateId, 'complete-evidence');

const timings = buildScannerTimingLadder({
  cameraInitialisationMs: 400,
  captureMs: 120,
  cropMs: 80,
  firstCandidateMs: 620,
  finalResultMs: 900,
});
assert.equal(timings.time_to_first_candidate_ms, 620);
assert.equal(timings.time_to_final_result_ms, 900);

console.log('scanner recognition pipeline checks passed');
