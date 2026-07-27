import assert from 'node:assert/strict';
import {
  EVIDENCE_FUSION_FEATURE_KEYS,
  fuseLocalEvidence,
  fuseThreeFrameLocalEvidence,
  type EvidenceFusionCalibrationManifest,
  type EvidenceFusionCandidate,
} from '../lib/recognition/evidenceFusion';
import type { CaptureQuality, OcrEvidence } from '../lib/recognition/types';

const readyCalibration: EvidenceFusionCalibrationManifest = {
  schemaVersion: 'stackr-evidence-fusion-calibration-v1.0.0',
  status: 'ready',
  version: 'test-calibration-v1',
  generatedAt: '2026-07-26T00:00:00.000Z',
  method: 'logistic',
  trainedOnDatasetVersion: 'test-validation',
  validationDatasetSha256: 'a'.repeat(64),
  featureKeys: [...EVIDENCE_FUSION_FEATURE_KEYS],
  logistic: {
    intercept: -8,
    weights: {
      visualSimilarity: 8,
      topOneTopTwoSimilarityMargin: 5,
      collectorNumberExactMatch: 0.7,
      setIdentityMatch: 0.7,
      languageAgreement: 0.4,
      captureQualityScore: 1.1,
      frameToFrameAgreement: 0.8,
      ocrConflictWithVisual: -6,
    },
  },
  isotonic: null,
  thresholds: {
    acceptedMinProbability: 0.97,
    reviewMinProbability: 0.25,
    maxFalseAcceptRate: 0.005,
    minVisualSimilarityForAccept: 0.9,
    minTopOneTopTwoMarginForAccept: 0.08,
    minCaptureQualityForAccept: 0.8,
  },
  metrics: {
    reliabilityDiagram: [],
    falseAcceptRate: 0.004,
    falseRejectRate: 0.03,
    acceptedCoverage: 0.62,
    precisionByConfidenceBand: [],
    byLanguage: {},
    byVariant: {},
  },
  blockers: [],
};

const quality: CaptureQuality = {
  passed: true,
  score: 0.94,
  failureReasons: [],
  focusScore: 0.92,
  glareScore: 0.95,
  exposureScore: 0.9,
  framingScore: 0.96,
  stabilityScore: 0.93,
  cardCoverage: 0.91,
};

const ocr: OcrEvidence = {
  language: 'en',
  nameHint: 'Pikachu',
  setId: 'sv1',
  printedNumber: { number: 25, raw: '025/198' },
  rawText: 'Pikachu 025/198 regulation G',
  releaseYear: 2023,
  soleExactMatchAllowed: false,
};

function candidate(overrides: Partial<EvidenceFusionCandidate> = {}): EvidenceFusionCandidate {
  return {
    canonicalCardId: 'sv1-025',
    similarity: 0.97,
    rank: 1,
    language: 'en',
    setId: 'sv1',
    collectorNumber: '025',
    era: 'sv',
    cardName: 'Pikachu',
    releaseEra: 'sv',
    regulationMark: 'G',
    variant: 'standard',
    ...overrides,
  };
}

function second(overrides: Partial<EvidenceFusionCandidate> = {}): EvidenceFusionCandidate {
  return candidate({
    canonicalCardId: 'sv1-026',
    similarity: 0.82,
    rank: 2,
    collectorNumber: '026',
    cardName: 'Raichu',
    ...overrides,
  });
}

function acceptsStrongAgreement() {
  const result = fuseLocalEvidence({
    candidates: [candidate(), second()],
    ocrEvidence: ocr,
    captureQuality: quality,
    calibration: readyCalibration,
  });
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.acceptedCandidate?.candidate.canonicalCardId, 'sv1-025');
  assert.ok((result.acceptedCandidate?.calibratedConfidence ?? 0) >= 0.97);
}

function weakNumberCannotOverridePoorVisual() {
  const result = fuseLocalEvidence({
    candidates: [candidate({ similarity: 0.62 }), second({ similarity: 0.6 })],
    ocrEvidence: ocr,
    captureQuality: quality,
    calibration: readyCalibration,
  });
  assert.notEqual(result.outcome, 'accepted');
  assert.ok(result.reasons.includes('visual_similarity_below_accept_threshold'));
}

function conflictingStrongEvidenceTriggersReview() {
  const result = fuseLocalEvidence({
    candidates: [candidate({ collectorNumber: '030' }), second()],
    ocrEvidence: ocr,
    captureQuality: quality,
    calibration: readyCalibration,
  });
  assert.equal(result.outcome, 'review_required');
  assert.ok(result.reasons.includes('ocr_conflicts_with_visual_result'));
}

function smallMarginTriggersReview() {
  const result = fuseLocalEvidence({
    candidates: [candidate({ similarity: 0.96 }), second({ similarity: 0.93 })],
    ocrEvidence: ocr,
    captureQuality: quality,
    calibration: readyCalibration,
  });
  assert.equal(result.outcome, 'review_required');
  assert.ok(result.reasons.includes('top_one_top_two_margin_too_small'));
}

function lowQualityCannotReceiveHighConfidenceAccept() {
  const result = fuseLocalEvidence({
    candidates: [candidate(), second()],
    ocrEvidence: ocr,
    captureQuality: {
      ...quality,
      passed: false,
      score: 0.42,
      failureReasons: ['blur'],
    },
    calibration: readyCalibration,
  });
  assert.equal(result.outcome, 'review_required');
  assert.ok(result.reasons.includes('capture_quality_not_accepted'));
}

function blockedCalibrationAbstains() {
  const result = fuseLocalEvidence({
    candidates: [candidate(), second()],
    ocrEvidence: ocr,
    captureQuality: quality,
  });
  assert.equal(result.outcome, 'review_required');
  assert.equal(result.acceptedCandidate, null);
  assert.ok(result.reasons.includes('calibration_model_not_ready'));
  assert.equal(result.candidates[0].calibratedConfidence, null);
}

function noCandidatesRescan() {
  const result = fuseLocalEvidence({
    candidates: [],
    ocrEvidence: ocr,
    captureQuality: quality,
    calibration: readyCalibration,
  });
  assert.equal(result.outcome, 'rescan_required');
}

function threeFrameVotingRewardsAgreement() {
  const result = fuseThreeFrameLocalEvidence([
    { candidates: [candidate({ similarity: 0.94 }), second({ similarity: 0.83 })], ocrEvidence: ocr, captureQuality: quality },
    { candidates: [candidate({ similarity: 0.95 }), second({ similarity: 0.82 })], ocrEvidence: ocr, captureQuality: quality },
    { candidates: [candidate({ similarity: 0.96 }), second({ similarity: 0.81 })], ocrEvidence: ocr, captureQuality: quality },
  ], readyCalibration);
  assert.equal(result.candidates[0].candidate.canonicalCardId, 'sv1-025');
  assert.equal(result.candidates[0].features.frameToFrameAgreement, 1);
}

acceptsStrongAgreement();
weakNumberCannotOverridePoorVisual();
conflictingStrongEvidenceTriggersReview();
smallMarginTriggersReview();
lowQualityCannotReceiveHighConfidenceAccept();
blockedCalibrationAbstains();
noCandidatesRescan();
threeFrameVotingRewardsAgreement();

console.log('evidence fusion tests passed');
