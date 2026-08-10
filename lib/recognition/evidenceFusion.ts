import type { CardIdentitySearchCandidate } from '../stackrCardVision';
import type {
  CaptureQuality,
  OcrEvidence,
  RecognitionCandidate,
  RecognitionOutcome,
} from './types';

export const EVIDENCE_FUSION_VERSION = 'stackr-evidence-fusion-v1.0.0';
export const EVIDENCE_FUSION_CALIBRATION_VERSION = 'stackr-evidence-fusion-calibration-v0.0.0-blocked';

export type EvidenceFusionFeatureKey =
  | 'visualSimilarity'
  | 'rank'
  | 'topOneTopTwoSimilarityMargin'
  | 'collectorNumberExactMatch'
  | 'collectorNumberPartialMatch'
  | 'setCodeMatch'
  | 'setIdentityMatch'
  | 'cardNameSimilarity'
  | 'languageAgreement'
  | 'regulationMarkAgreement'
  | 'releaseEraAgreement'
  | 'variantEvidence'
  | 'frameToFrameAgreement'
  | 'captureQualityScore'
  | 'focusScore'
  | 'glareScore'
  | 'exposureScore'
  | 'framingScore'
  | 'stabilityScore'
  | 'cardCoverage'
  | 'ocrConflictWithVisual';

export type EvidenceFusionCandidate = CardIdentitySearchCandidate & {
  cardName?: string | null;
  setName?: string | null;
  regulationMark?: string | null;
  releaseEra?: string | null;
  variant?: string | null;
};

export type EvidenceFusionFeatureVector = Record<EvidenceFusionFeatureKey, number>;

export type EvidenceFusionCalibrationManifest = {
  schemaVersion: 'stackr-evidence-fusion-calibration-v1.0.0';
  status: 'ready' | 'blocked';
  version: string;
  generatedAt: string;
  method: 'logistic' | 'isotonic' | 'none';
  trainedOnDatasetVersion: string | null;
  validationDatasetSha256: string | null;
  featureKeys: EvidenceFusionFeatureKey[];
  logistic?: {
    intercept: number;
    weights: Partial<Record<EvidenceFusionFeatureKey, number>>;
  } | null;
  isotonic?: {
    thresholds: number[];
    probabilities: number[];
  } | null;
  thresholds: {
    acceptedMinProbability: number | null;
    reviewMinProbability: number | null;
    maxFalseAcceptRate: number;
    minVisualSimilarityForAccept: number | null;
    minTopOneTopTwoMarginForAccept: number | null;
    minCaptureQualityForAccept: number | null;
  };
  metrics: {
    reliabilityDiagram: Array<{ confidenceMin: number; confidenceMax: number; predictedMean: number; observedAccuracy: number; count: number }>;
    falseAcceptRate: number | null;
    falseRejectRate: number | null;
    acceptedCoverage: number | null;
    precisionByConfidenceBand: Array<{ band: string; precision: number | null; count: number }>;
    byLanguage: Record<string, { precision: number | null; count: number }>;
    byVariant: Record<string, { precision: number | null; count: number }>;
  };
  blockers: string[];
};

export type EvidenceFusionInput = {
  candidates: readonly EvidenceFusionCandidate[];
  ocrEvidence?: OcrEvidence | null;
  captureQuality?: CaptureQuality | null;
  calibration?: EvidenceFusionCalibrationManifest | null;
  frameAgreement?: Record<string, number> | null;
};

export type FusedCandidate = {
  candidate: EvidenceFusionCandidate;
  features: EvidenceFusionFeatureVector;
  calibratedConfidence: number | null;
  rank: number;
  decisionBlockers: string[];
};

export type EvidenceFusionResult = {
  outcome: RecognitionOutcome;
  acceptedCandidate: FusedCandidate | null;
  candidates: FusedCandidate[];
  calibrationVersion: string;
  modelReady: boolean;
  reasons: string[];
};

export type EvidenceFusionFrameInput = Omit<EvidenceFusionInput, 'frameAgreement'>;

export const EVIDENCE_FUSION_FEATURE_KEYS: readonly EvidenceFusionFeatureKey[] = Object.freeze([
  'visualSimilarity',
  'rank',
  'topOneTopTwoSimilarityMargin',
  'collectorNumberExactMatch',
  'collectorNumberPartialMatch',
  'setCodeMatch',
  'setIdentityMatch',
  'cardNameSimilarity',
  'languageAgreement',
  'regulationMarkAgreement',
  'releaseEraAgreement',
  'variantEvidence',
  'frameToFrameAgreement',
  'captureQualityScore',
  'focusScore',
  'glareScore',
  'exposureScore',
  'framingScore',
  'stabilityScore',
  'cardCoverage',
  'ocrConflictWithVisual',
]);

export const BLOCKED_EVIDENCE_FUSION_CALIBRATION: EvidenceFusionCalibrationManifest = Object.freeze({
  schemaVersion: 'stackr-evidence-fusion-calibration-v1.0.0',
  status: 'blocked',
  version: EVIDENCE_FUSION_CALIBRATION_VERSION,
  generatedAt: '2026-07-26T00:00:00.000Z',
  method: 'none',
  trainedOnDatasetVersion: null,
  validationDatasetSha256: null,
  featureKeys: [...EVIDENCE_FUSION_FEATURE_KEYS],
  logistic: null,
  isotonic: null,
  thresholds: {
    acceptedMinProbability: null,
    reviewMinProbability: null,
    maxFalseAcceptRate: 0.005,
    minVisualSimilarityForAccept: null,
    minTopOneTopTwoMarginForAccept: null,
    minCaptureQualityForAccept: null,
  },
  metrics: {
    reliabilityDiagram: [],
    falseAcceptRate: null,
    falseRejectRate: null,
    acceptedCoverage: null,
    precisionByConfidenceBand: [],
    byLanguage: {},
    byVariant: {},
  },
  blockers: [
    'no_approved_embedding_model',
    'no_search_predictions_with_ground_truth',
    'no_protected_validation_rows_for_calibration',
  ],
});

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeNumber(value?: string | number | null) {
  const raw = String(value ?? '').normalize('NFKC');
  const digits = raw.match(/\d+/)?.[0] ?? '';
  return digits.replace(/^0+(?=\d)/, '') || digits;
}

function textSimilarity(left?: string | null, right?: string | null) {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value: string) => {
    if (value.length <= 2) return new Set([value]);
    const result = new Set<string>();
    for (let index = 0; index <= value.length - 2; index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const leftGrams = grams(a);
  const rightGrams = grams(b);
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (leftGrams.size + rightGrams.size);
}

function inferRegulationMark(ocr?: OcrEvidence | null) {
  const text = normalizeText(ocr?.rawText);
  return text.match(/\bregulation\s*mark\s*([a-z])\b/)?.[1]
    ?? text.match(/\bregulation\s*([a-z])\b/)?.[1]
    ?? text.match(/\b([defghi])\s*regulation\b/)?.[1]
    ?? null;
}

function inferVariantEvidence(ocr?: OcrEvidence | null) {
  const text = normalizeText(ocr?.rawText);
  if (/master\s*ball|masterball/.test(text)) return 'masterball';
  if (/poke\s*ball|pokeball/.test(text)) return 'pokeball';
  if (/reverse/.test(text)) return 'reverse';
  if (/promo|promotional/.test(text)) return 'promo';
  if (/first\s*edition|1st\s*edition/.test(text)) return 'first_edition';
  if (/holo/.test(text)) return 'holo';
  return null;
}

function yearToEra(year?: number | null) {
  if (!year || !Number.isFinite(year)) return null;
  if (year <= 2002) return 'wotc';
  if (year <= 2007) return 'ex';
  if (year <= 2010) return 'dp';
  if (year <= 2013) return 'bw';
  if (year <= 2016) return 'xy';
  if (year <= 2019) return 'sm';
  if (year <= 2022) return 'swsh';
  return 'sv';
}

function languageMatches(candidateLanguage?: string | null, evidenceLanguage?: string | null) {
  const candidate = String(candidateLanguage ?? '').toLowerCase();
  const evidence = String(evidenceLanguage ?? '').toLowerCase();
  if (!candidate || !evidence || evidence === 'unknown') return 0.5;
  if (candidate === evidence) return 1;
  if (evidence === 'zh' && (candidate === 'zh-hans' || candidate === 'zh-hant' || candidate === 'zh')) return 1;
  return 0;
}

function hasOcrConflict(candidate: EvidenceFusionCandidate, ocr?: OcrEvidence | null) {
  const number = normalizeNumber(ocr?.printedNumber?.number ?? ocr?.printedNumber?.raw);
  const candidateNumber = normalizeNumber(candidate.collectorNumber);
  const setHint = compact(ocr?.setId ?? ocr?.setCode);
  const candidateSet = compact(candidate.setId);
  const languageAgreement = languageMatches(candidate.language, ocr?.language);

  if (number && candidateNumber && number !== candidateNumber) return true;
  if (setHint && candidateSet && setHint !== candidateSet) return true;
  if (languageAgreement === 0) return true;
  return false;
}

function compareCandidateScore(left: FusedCandidate, right: FusedCandidate) {
  const leftConfidence = left.calibratedConfidence ?? -1;
  const rightConfidence = right.calibratedConfidence ?? -1;
  return rightConfidence - leftConfidence
    || right.features.visualSimilarity - left.features.visualSimilarity
    || left.candidate.rank - right.candidate.rank
    || left.candidate.canonicalCardId.localeCompare(right.candidate.canonicalCardId);
}

export function extractEvidenceFusionFeatures({
  candidate,
  secondCandidate,
  ocrEvidence,
  captureQuality,
  frameAgreement,
}: {
  candidate: EvidenceFusionCandidate;
  secondCandidate?: EvidenceFusionCandidate | null;
  ocrEvidence?: OcrEvidence | null;
  captureQuality?: CaptureQuality | null;
  frameAgreement?: number | null;
}): EvidenceFusionFeatureVector {
  const visualSimilarity = clamp01(candidate.similarity);
  const margin = secondCandidate ? candidate.similarity - secondCandidate.similarity : candidate.similarity;
  const ocrNumber = normalizeNumber(ocrEvidence?.printedNumber?.number ?? ocrEvidence?.printedNumber?.raw);
  const candidateNumber = normalizeNumber(candidate.collectorNumber);
  const setHint = compact(ocrEvidence?.setCode);
  const setIdentityHint = compact(ocrEvidence?.setId);
  const candidateSet = compact(candidate.setId);
  const regulationHint = inferRegulationMark(ocrEvidence);
  const variantHint = inferVariantEvidence(ocrEvidence);
  const releaseEraHint = yearToEra(ocrEvidence?.releaseYear);
  const ocrConflictWithVisual = hasOcrConflict(candidate, ocrEvidence) ? 1 : 0;

  return {
    visualSimilarity,
    rank: Math.max(0, 1 / Math.max(1, candidate.rank)),
    topOneTopTwoSimilarityMargin: clamp01(Math.max(0, margin)),
    collectorNumberExactMatch: ocrNumber && candidateNumber && ocrNumber === candidateNumber ? 1 : 0,
    collectorNumberPartialMatch: ocrNumber && candidateNumber && ocrNumber !== candidateNumber
      && (ocrNumber.includes(candidateNumber) || candidateNumber.includes(ocrNumber)) ? 1 : 0,
    setCodeMatch: setHint && candidateSet && setHint === candidateSet ? 1 : 0,
    setIdentityMatch: setIdentityHint && candidateSet && setIdentityHint === candidateSet ? 1 : 0,
    cardNameSimilarity: textSimilarity(ocrEvidence?.nameHint, candidate.cardName ?? candidate.canonicalCardId),
    languageAgreement: languageMatches(candidate.language, ocrEvidence?.language),
    regulationMarkAgreement: regulationHint && candidate.regulationMark
      ? Number(compact(regulationHint) === compact(candidate.regulationMark))
      : 0.5,
    releaseEraAgreement: releaseEraHint && candidate.releaseEra
      ? Number(releaseEraHint === candidate.releaseEra)
      : 0.5,
    variantEvidence: variantHint && candidate.variant
      ? Number(compact(variantHint) === compact(candidate.variant))
      : 0.5,
    frameToFrameAgreement: clamp01(frameAgreement ?? 1),
    captureQualityScore: clamp01(captureQuality?.score ?? (captureQuality?.passed ? 1 : 0.5)),
    focusScore: clamp01(captureQuality?.focusScore ?? 0.5),
    glareScore: clamp01(captureQuality?.glareScore ?? 0.5),
    exposureScore: clamp01(captureQuality?.exposureScore ?? 0.5),
    framingScore: clamp01(captureQuality?.framingScore ?? 0.5),
    stabilityScore: clamp01(captureQuality?.stabilityScore ?? 0.5),
    cardCoverage: clamp01(captureQuality?.cardCoverage ?? 0.5),
    ocrConflictWithVisual,
  };
}

function logisticProbability(
  features: EvidenceFusionFeatureVector,
  calibration: EvidenceFusionCalibrationManifest
) {
  if (calibration.status !== 'ready' || calibration.method !== 'logistic' || !calibration.logistic) return null;
  let logit = calibration.logistic.intercept;
  for (const key of calibration.featureKeys) {
    logit += (calibration.logistic.weights[key] ?? 0) * features[key];
  }
  return 1 / (1 + Math.exp(-logit));
}

function isotonicProbability(
  features: EvidenceFusionFeatureVector,
  calibration: EvidenceFusionCalibrationManifest
) {
  if (calibration.status !== 'ready' || calibration.method !== 'isotonic' || !calibration.isotonic) return null;
  const score = features.visualSimilarity;
  let selected = calibration.isotonic.probabilities[0] ?? null;
  for (let index = 0; index < calibration.isotonic.thresholds.length; index += 1) {
    if (score >= calibration.isotonic.thresholds[index]) {
      selected = calibration.isotonic.probabilities[index] ?? selected;
    }
  }
  return selected == null ? null : clamp01(selected);
}

function calibratedProbability(
  features: EvidenceFusionFeatureVector,
  calibration: EvidenceFusionCalibrationManifest
) {
  return calibration.method === 'isotonic'
    ? isotonicProbability(features, calibration)
    : logisticProbability(features, calibration);
}

function decisionBlockers(
  features: EvidenceFusionFeatureVector,
  calibration: EvidenceFusionCalibrationManifest,
  captureQuality?: CaptureQuality | null
) {
  const blockers: string[] = [];
  if (!captureQuality?.passed || captureQuality.failureReasons.length > 0) blockers.push('capture_quality_not_accepted');
  if (features.ocrConflictWithVisual >= 1) blockers.push('ocr_conflicts_with_visual_result');
  if (calibration.thresholds.minVisualSimilarityForAccept != null
    && features.visualSimilarity < calibration.thresholds.minVisualSimilarityForAccept) {
    blockers.push('visual_similarity_below_accept_threshold');
  }
  if (calibration.thresholds.minTopOneTopTwoMarginForAccept != null
    && features.topOneTopTwoSimilarityMargin < calibration.thresholds.minTopOneTopTwoMarginForAccept) {
    blockers.push('top_one_top_two_margin_too_small');
  }
  if (calibration.thresholds.minCaptureQualityForAccept != null
    && features.captureQualityScore < calibration.thresholds.minCaptureQualityForAccept) {
    blockers.push('capture_quality_below_accept_threshold');
  }
  return blockers;
}

export function fuseLocalEvidence(input: EvidenceFusionInput): EvidenceFusionResult {
  const calibration = input.calibration ?? BLOCKED_EVIDENCE_FUSION_CALIBRATION;
  const candidates = [...input.candidates].sort((left, right) => left.rank - right.rank);
  if (candidates.length === 0) {
    return {
      outcome: 'rescan_required',
      acceptedCandidate: null,
      candidates: [],
      calibrationVersion: calibration.version,
      modelReady: calibration.status === 'ready',
      reasons: ['no_local_candidates'],
    };
  }

  const fused = candidates.map<FusedCandidate>((candidate, index) => {
    const features = extractEvidenceFusionFeatures({
      candidate,
      secondCandidate: candidates[index + 1] ?? null,
      ocrEvidence: input.ocrEvidence,
      captureQuality: input.captureQuality,
      frameAgreement: input.frameAgreement?.[candidate.canonicalCardId] ?? null,
    });
    return {
      candidate,
      features,
      calibratedConfidence: calibratedProbability(features, calibration),
      rank: 0,
      decisionBlockers: decisionBlockers(features, calibration, input.captureQuality),
    };
  }).sort(compareCandidateScore).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));

  const best = fused[0];
  if (!best) {
    return {
      outcome: 'rescan_required',
      acceptedCandidate: null,
      candidates: [],
      calibrationVersion: calibration.version,
      modelReady: calibration.status === 'ready',
      reasons: ['no_local_candidates'],
    };
  }

  if (calibration.status !== 'ready' || best.calibratedConfidence == null) {
    return {
      outcome: 'review_required',
      acceptedCandidate: null,
      candidates: fused,
      calibrationVersion: calibration.version,
      modelReady: false,
      reasons: ['calibration_model_not_ready', ...calibration.blockers],
    };
  }

  const acceptedMin = calibration.thresholds.acceptedMinProbability;
  const reviewMin = calibration.thresholds.reviewMinProbability;
  if (acceptedMin != null && best.calibratedConfidence >= acceptedMin && best.decisionBlockers.length === 0) {
    return {
      outcome: 'accepted',
      acceptedCandidate: best,
      candidates: fused,
      calibrationVersion: calibration.version,
      modelReady: true,
      reasons: ['accepted_by_calibrated_threshold'],
    };
  }

  if (best.decisionBlockers.length > 0 || reviewMin == null || best.calibratedConfidence >= reviewMin) {
    return {
      outcome: 'review_required',
      acceptedCandidate: null,
      candidates: fused,
      calibrationVersion: calibration.version,
      modelReady: true,
      reasons: best.decisionBlockers.length > 0
        ? best.decisionBlockers
        : ['below_automatic_accept_threshold'],
    };
  }

  return {
    outcome: 'rescan_required',
    acceptedCandidate: null,
    candidates: fused,
    calibrationVersion: calibration.version,
    modelReady: true,
    reasons: ['below_review_threshold'],
  };
}

export function fuseThreeFrameLocalEvidence(
  frames: readonly EvidenceFusionFrameInput[],
  calibration: EvidenceFusionCalibrationManifest = BLOCKED_EVIDENCE_FUSION_CALIBRATION
): EvidenceFusionResult {
  if (frames.length === 0) {
    return fuseLocalEvidence({ candidates: [], calibration });
  }

  const byId = new Map<string, EvidenceFusionCandidate[]>();
  for (const frame of frames.slice(0, 3)) {
    for (const candidate of frame.candidates) {
      const list = byId.get(candidate.canonicalCardId) ?? [];
      list.push(candidate);
      byId.set(candidate.canonicalCardId, list);
    }
  }

  const frameCount = Math.min(3, frames.length);
  const frameAgreement: Record<string, number> = {};
  const merged = Array.from(byId.entries()).map<EvidenceFusionCandidate>(([canonicalCardId, entries]) => {
    frameAgreement[canonicalCardId] = entries.length / frameCount;
    const best = [...entries].sort((left, right) => right.similarity - left.similarity || left.rank - right.rank)[0];
    return {
      ...best,
      rank: Math.min(...entries.map((entry) => entry.rank)),
      similarity: entries.reduce((sum, entry) => sum + entry.similarity, 0) / entries.length,
    };
  }).sort((left, right) => right.similarity - left.similarity || left.rank - right.rank);

  return fuseLocalEvidence({
    candidates: merged,
    calibration,
    frameAgreement,
    ocrEvidence: frames[0]?.ocrEvidence ?? null,
    captureQuality: frames[0]?.captureQuality ?? null,
  });
}

export function fusedCandidateToRecognitionCandidate(
  fused: FusedCandidate,
  modelVersion: string
): RecognitionCandidate {
  return {
    identity: {
      id: fused.candidate.canonicalCardId,
      name: fused.candidate.cardName ?? fused.candidate.canonicalCardId,
      number: fused.candidate.collectorNumber ?? null,
      setId: fused.candidate.setId ?? null,
      setName: fused.candidate.setName ?? null,
      language: fused.candidate.language ?? null,
    },
    confidence: fused.calibratedConfidence ?? 0,
    evidence: {
      visual: {
        modelVersion,
        similarity: fused.features.visualSimilarity,
        marginToSecond: fused.features.topOneTopTwoSimilarityMargin,
      },
      rankingScore: fused.calibratedConfidence,
      reasons: [
        'local_evidence_fusion',
        ...fused.decisionBlockers,
      ],
    },
    engineId: 'local_on_device_v1',
    requiresReview: fused.calibratedConfidence == null || fused.decisionBlockers.length > 0,
    raw: {
      fusionVersion: EVIDENCE_FUSION_VERSION,
      calibrationVersion: EVIDENCE_FUSION_CALIBRATION_VERSION,
      features: fused.features,
      calibratedConfidence: fused.calibratedConfidence,
      candidate: fused.candidate,
    },
  };
}
