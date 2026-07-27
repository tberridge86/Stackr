import type { CardLocalisationResult } from './cardLocalisation';
import type { LocalOcrSignals } from './localOcrCardMatcher';
import type { RecognitionThresholds } from './scannerCalibration';
import type { ScanQualityResult } from './scanQuality';

export const SCANNER_RECOGNITION_PIPELINE_VERSION = 'stackr-scanner-recognition-v1';

export const NO_TRADING_CARD_DETECTED_MESSAGE =
  'No trading card was detected. Position one card inside the frame and try again.';

export type ScannerRecognitionStage =
  | 'quality_validation'
  | 'image_correction'
  | 'candidate_retrieval'
  | 'candidate_ranking'
  | 'confirmation';

export type ScannerFrameRejectionReason =
  | 'no_trading_card'
  | 'multiple_cards'
  | 'too_distant'
  | 'framing'
  | 'obstruction'
  | 'blur'
  | 'glare'
  | 'low_light'
  | 'perspective_distortion'
  | 'unreadable_image';

export type ScannerFrameValidation = {
  stage: 'quality_validation';
  tradingCardPresent: boolean;
  singleCardPresent: boolean;
  canContinue: boolean;
  rejectionReason: ScannerFrameRejectionReason | null;
  message: string | null;
  evidence: string[];
};

export type ScannerCandidateEvidence = {
  providerScore?: number | null;
  setSymbol?: number | null;
  collectorNumber?: number | null;
  cardNameOcr?: number | null;
  hp?: number | null;
  pokemonName?: number | null;
  language?: number | null;
  artworkEmbedding?: number | null;
  borderLayout?: number | null;
  raritySymbol?: number | null;
  regulationMark?: number | null;
  slabLabel?: number | null;
};

type ScannerCandidateEvidenceKey = keyof ScannerCandidateEvidence;
type NormalizedScannerCandidateEvidence = Record<ScannerCandidateEvidenceKey, number>;

export type ScannerCandidateInput = {
  id?: string | null;
  name?: string | null;
  setId?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  provider?: string | null;
  confidence?: number | null;
  reasons?: string[] | null;
  evidence?: ScannerCandidateEvidence | null;
};

export type RankedScannerCandidate = ScannerCandidateInput & {
  stage: 'candidate_ranking';
  score: number;
  confidence: number;
  evidenceBreakdown: NormalizedScannerCandidateEvidence;
  rankReasons: string[];
};

export type ScannerConfirmationDecision = {
  stage: 'confirmation';
  decision: 'auto_confirm' | 'show_candidates' | 'reject_no_card' | 'no_match';
  autoConfirmedCandidateId: string | null;
  candidates: RankedScannerCandidate[];
  confidence: number;
  message: string | null;
};

export type ScannerPipelineTimings = {
  time_to_camera_readiness_ms: number | null;
  time_to_capture_ms: number | null;
  time_to_crop_ms: number | null;
  time_to_first_candidate_ms: number | null;
  time_to_final_result_ms: number | null;
};

const EMPTY_EVIDENCE: NormalizedScannerCandidateEvidence = {
  providerScore: 0,
  setSymbol: 0,
  collectorNumber: 0,
  cardNameOcr: 0,
  hp: 0,
  pokemonName: 0,
  language: 0,
  artworkEmbedding: 0,
  borderLayout: 0,
  raritySymbol: 0,
  regulationMark: 0,
  slabLabel: 0,
};

const EVIDENCE_WEIGHTS: NormalizedScannerCandidateEvidence = {
  providerScore: 0.12,
  setSymbol: 0.12,
  collectorNumber: 0.2,
  cardNameOcr: 0.15,
  hp: 0.04,
  pokemonName: 0.09,
  language: 0.1,
  artworkEmbedding: 0.24,
  borderLayout: 0.05,
  raritySymbol: 0.04,
  regulationMark: 0.03,
  slabLabel: 0.16,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cleanScore(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp01(numeric > 1 ? numeric / 100 : numeric);
}

function hasFailure(quality: ScanQualityResult | null | undefined, code: string) {
  return Boolean(quality?.failures?.some((failure) => failure.code === code || failure.instruction === code));
}

function languageMatches(candidateLanguage: string | null | undefined, detectedLanguage: LocalOcrSignals['language']) {
  const language = String(candidateLanguage ?? '').toLowerCase();
  if (detectedLanguage === 'unknown') return true;
  if (detectedLanguage === 'zh') return language === 'zh' || language === 'zh-hans' || language === 'zh-hant';
  return language === detectedLanguage;
}

function getCardCoverage(quality: ScanQualityResult | null | undefined, localisation: CardLocalisationResult | null | undefined) {
  return Number(quality?.metrics.cardCoverage ?? localisation?.confidence.frameCoverage ?? 0) || 0;
}

export function validateScannerFrame(input: {
  quality?: ScanQualityResult | null;
  localisation?: CardLocalisationResult | null;
  possibleCardCount?: number | null;
}): ScannerFrameValidation {
  const quality = input.quality ?? null;
  const localisation = input.localisation ?? null;
  const possibleCardCount = Math.max(0, Math.round(Number(input.possibleCardCount ?? 1) || 1));
  const cardCoverage = getCardCoverage(quality, localisation);
  const confidentLocalisation = localisation?.status === 'confident';
  const evidence: string[] = [];

  if (possibleCardCount > 1) {
    return {
      stage: 'quality_validation',
      tradingCardPresent: true,
      singleCardPresent: false,
      canContinue: false,
      rejectionReason: 'multiple_cards',
      message: 'Position one card inside the frame and try again.',
      evidence: [`possible-card-count:${possibleCardCount}`],
    };
  }

  if (quality && hasFailure(quality, 'unreadable-image')) {
    return {
      stage: 'quality_validation',
      tradingCardPresent: false,
      singleCardPresent: false,
      canContinue: false,
      rejectionReason: 'unreadable_image',
      message: NO_TRADING_CARD_DETECTED_MESSAGE,
      evidence: ['unreadable-image'],
    };
  }

  if (!confidentLocalisation && cardCoverage < 0.035 && quality && quality.focusScore >= 0.35 && quality.exposureScore >= 0.35) {
    return {
      stage: 'quality_validation',
      tradingCardPresent: false,
      singleCardPresent: false,
      canContinue: false,
      rejectionReason: 'no_trading_card',
      message: NO_TRADING_CARD_DETECTED_MESSAGE,
      evidence: [
        `localisation:${localisation?.status ?? 'missing'}`,
        `card-coverage:${cardCoverage.toFixed(3)}`,
      ],
    };
  }

  if (quality && hasFailure(quality, 'move-closer')) {
    return {
      stage: 'quality_validation',
      tradingCardPresent: true,
      singleCardPresent: true,
      canContinue: false,
      rejectionReason: 'too_distant',
      message: quality.instructionText,
      evidence: ['move-closer', `card-coverage:${cardCoverage.toFixed(3)}`],
    };
  }

  if (quality && hasFailure(quality, 'hand-obstruction')) evidence.push('obstruction');
  if (quality && hasFailure(quality, 'tap-to-focus')) evidence.push('blur');
  if (quality && (hasFailure(quality, 'reduce-glare') || hasFailure(quality, 'sleeve-reflection'))) evidence.push('glare');
  if (quality && hasFailure(quality, 'improve-lighting')) evidence.push('low-light');
  if (quality && hasFailure(quality, 'perspective-distortion')) evidence.push('perspective-distortion');

  const mandatoryFailure = quality?.failures?.find((failure) => failure.mandatory);
  if (mandatoryFailure) {
    const reason: ScannerFrameRejectionReason =
      mandatoryFailure.code === 'hand-obstruction'
        ? 'obstruction'
        : mandatoryFailure.code === 'tap-to-focus'
          ? 'blur'
          : mandatoryFailure.code === 'improve-lighting'
            ? 'low_light'
      : mandatoryFailure.code === 'perspective-distortion'
        ? 'perspective_distortion'
        : mandatoryFailure.code === 'reduce-glare' || mandatoryFailure.code === 'sleeve-reflection'
          ? 'glare'
          : mandatoryFailure.code === 'corners-hidden' || mandatoryFailure.code === 'show-whole-card'
            ? 'framing'
          : 'no_trading_card';

    return {
      stage: 'quality_validation',
      tradingCardPresent: reason !== 'no_trading_card',
      singleCardPresent: reason !== 'no_trading_card',
      canContinue: false,
      rejectionReason: reason,
      message: reason === 'no_trading_card' ? NO_TRADING_CARD_DETECTED_MESSAGE : quality?.instructionText ?? null,
      evidence: evidence.length ? evidence : [mandatoryFailure.code],
    };
  }

  return {
    stage: 'quality_validation',
    tradingCardPresent: confidentLocalisation || cardCoverage >= 0.035,
    singleCardPresent: true,
    canContinue: true,
    rejectionReason: null,
    message: null,
    evidence: [
      `localisation:${localisation?.status ?? 'missing'}`,
      `card-coverage:${cardCoverage.toFixed(3)}`,
      ...(quality?.passed ? ['quality:passed'] : []),
    ],
  };
}

function inferEvidenceFromOcr(candidate: ScannerCandidateInput, ocr?: LocalOcrSignals | null): ScannerCandidateEvidence {
  if (!ocr) return {};
  const detectedLanguageMatches = ocr.language !== 'unknown'
    && languageMatches(candidate.language, ocr.language);
  const collector = ocr.printedNumber?.normalisedNumber;
  const cardNumber = String(candidate.collectorNumber ?? '').replace(/^0+(?=\d)/, '');

  return {
    language: detectedLanguageMatches ? 1 : ocr.language === 'unknown' ? 0 : -1,
    collectorNumber: collector && cardNumber && cardNumber.replace(/[^\d]/g, '') === collector ? 1 : 0,
    hp: ocr.hp ? 0.25 : 0,
    setSymbol: ocr.setCode && candidate.setId
      ? String(candidate.setId).toLowerCase().includes(String(ocr.setCode).toLowerCase())
        ? 0.8
        : 0
      : 0,
    cardNameOcr: ocr.nameText && candidate.name
      ? ocr.nameText.toLowerCase().includes(String(candidate.name).toLowerCase()) ? 1 : 0
      : 0,
  };
}

function mergeEvidence(
  candidate: ScannerCandidateInput,
  ocr?: LocalOcrSignals | null
): NormalizedScannerCandidateEvidence {
  const inferred = inferEvidenceFromOcr(candidate, ocr);
  const source = {
    ...inferred,
    ...(candidate.evidence ?? {}),
    providerScore: candidate.evidence?.providerScore ?? candidate.confidence ?? inferred.providerScore,
  };

  return Object.fromEntries(
    Object.keys(EMPTY_EVIDENCE).map((key) => [
      key,
      cleanScore(source[key as ScannerCandidateEvidenceKey]),
    ])
  ) as NormalizedScannerCandidateEvidence;
}

export function rankScannerCandidates(input: {
  candidates: ScannerCandidateInput[];
  ocrSignals?: LocalOcrSignals | null;
}): RankedScannerCandidate[] {
  return input.candidates
    .map((candidate): RankedScannerCandidate => {
      const evidence = mergeEvidence(candidate, input.ocrSignals);
      const weighted = Object.entries(EVIDENCE_WEIGHTS).reduce((sum, [key, weight]) => (
        sum + evidence[key as ScannerCandidateEvidenceKey] * weight
      ), 0);
      const maxWeight = Object.values(EVIDENCE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
      const confidence = clamp01(weighted / maxWeight);
      const rankReasons = Object.entries(evidence)
        .filter(([, score]) => score >= 0.55)
        .map(([key, score]) => `${key}:${score.toFixed(2)}`);

      return {
        ...candidate,
        stage: 'candidate_ranking',
        score: Number((confidence * 100).toFixed(2)),
        confidence: Number(confidence.toFixed(4)),
        evidenceBreakdown: evidence,
        rankReasons: [
          ...(candidate.reasons ?? []),
          ...rankReasons,
        ].slice(0, 12),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function decideScannerConfirmation(input: {
  frameValidation: ScannerFrameValidation;
  candidates: RankedScannerCandidate[];
  thresholds: RecognitionThresholds;
  topCandidateLimit?: number;
}): ScannerConfirmationDecision {
  if (!input.frameValidation.canContinue && input.frameValidation.rejectionReason === 'no_trading_card') {
    return {
      stage: 'confirmation',
      decision: 'reject_no_card',
      autoConfirmedCandidateId: null,
      candidates: [],
      confidence: 0,
      message: NO_TRADING_CARD_DETECTED_MESSAGE,
    };
  }

  const candidates = input.candidates.slice(0, input.topCandidateLimit ?? 3);
  const best = candidates[0] ?? null;
  if (!best) {
    return {
      stage: 'confirmation',
      decision: 'no_match',
      autoConfirmedCandidateId: null,
      candidates,
      confidence: 0,
      message: 'No confident card match was found.',
    };
  }

  const second = candidates[1] ?? null;
  const margin = second ? best.confidence - second.confidence : 1;
  const autoConfirm = best.confidence >= input.thresholds.localAutoConfirmConfidence
    && margin >= input.thresholds.ambiguousVariantMaxGap;

  return {
    stage: 'confirmation',
    decision: autoConfirm ? 'auto_confirm' : 'show_candidates',
    autoConfirmedCandidateId: autoConfirm ? best.id ?? null : null,
    candidates,
    confidence: best.confidence,
    message: autoConfirm ? null : 'Choose the closest match.',
  };
}

export function buildScannerTimingLadder(input: {
  cameraInitialisationMs?: number | null;
  captureMs?: number | null;
  cropMs?: number | null;
  firstCandidateMs?: number | null;
  finalResultMs?: number | null;
}): ScannerPipelineTimings {
  return {
    time_to_camera_readiness_ms: input.cameraInitialisationMs ?? null,
    time_to_capture_ms: input.captureMs ?? null,
    time_to_crop_ms: input.cropMs ?? null,
    time_to_first_candidate_ms: input.firstCandidateMs ?? null,
    time_to_final_result_ms: input.finalResultMs ?? null,
  };
}
