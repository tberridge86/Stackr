export const RECOGNITION_ARCHITECTURE_VERSION = 'stackr-recognition-architecture-v1';

export type RecognitionEngineId = 'existing_legacy_engine' | 'local_on_device_v1';

export type RecognitionOutcome = 'accepted' | 'review_required' | 'rescan_required';

export type RecognitionProcessingStage =
  | 'orchestrator_start'
  | 'engine_start'
  | 'engine_completed'
  | 'engine_timeout'
  | 'engine_malformed'
  | 'engine_error'
  | 'engine_skipped'
  | 'orchestrator_completed';

export type RecognitionPoint = {
  x: number;
  y: number;
};

export type CardCorners = {
  topLeft: RecognitionPoint;
  topRight: RecognitionPoint;
  bottomRight: RecognitionPoint;
  bottomLeft: RecognitionPoint;
  coordinateSpace: 'preview' | 'photo' | 'rectified';
};

export type CaptureQualityFailureReason =
  | 'no_trading_card'
  | 'multiple_cards'
  | 'too_distant'
  | 'too_close'
  | 'blur'
  | 'glare'
  | 'underexposed'
  | 'overexposed'
  | 'obstructed'
  | 'perspective'
  | 'unstable'
  | 'engine_not_ready'
  | 'engine_timeout'
  | 'engine_error'
  | 'malformed_engine_response'
  | 'recognition_unavailable';

export type CaptureQuality = {
  passed: boolean;
  score?: number | null;
  failureReasons: CaptureQualityFailureReason[];
  focusScore?: number | null;
  glareScore?: number | null;
  exposureScore?: number | null;
  framingScore?: number | null;
  stabilityScore?: number | null;
  cardCoverage?: number | null;
};

export type RectifiedCard = {
  id: string;
  uri?: string | null;
  base64?: string | null;
  width?: number | null;
  height?: number | null;
  sourceRole?: string | null;
  corners?: CardCorners | null;
  quality?: CaptureQuality | null;
};

export type OcrScript =
  | 'latin'
  | 'japanese'
  | 'korean'
  | 'chinese_simplified'
  | 'chinese_traditional'
  | 'unknown';

export type OcrSourceRegion =
  | 'collectorNumber'
  | 'setRarity'
  | 'cardTitle'
  | 'regulationCopyright'
  | 'artwork'
  | 'fullFront'
  | 'fullBack'
  | 'ocrSource'
  | 'leftEdge'
  | 'unknown';

export type OcrBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: 'region_pixels' | 'rectified_card_normalized';
};

export type OcrEvidenceItem = {
  rawText: string;
  normalisedText: string;
  sourceRegion: OcrSourceRegion;
  boundingBox?: OcrBoundingBox | null;
  confidence?: number | null;
  probableScript: OcrScript;
  recognizerScript: OcrScript;
  alternatives: string[];
};

export type OcrEvidence = {
  language?: string | null;
  nameHint?: string | null;
  printedNumber?: {
    number: number;
    total?: number | null;
    raw?: string | null;
  } | null;
  setId?: string | null;
  setCode?: string | null;
  hp?: number | null;
  releaseYear?: number | null;
  rawText?: string | null;
  items?: OcrEvidenceItem[];
  probableScript?: OcrScript | null;
  scriptsAttempted?: OcrScript[];
  strategyVersion?: string;
  regionVersion?: string | null;
  soleExactMatchAllowed?: false;
  warnings?: string[];
};

export type VisualEvidence = {
  modelVersion?: string | null;
  similarity?: number | null;
  finalScore?: number | null;
  marginToSecond?: number | null;
  embeddingVersion?: string | null;
  matchedArtworkId?: string | null;
};

export type CandidateEvidence = {
  ocr?: OcrEvidence | null;
  visual?: VisualEvidence | null;
  providerScore?: number | null;
  rankingScore?: number | null;
  reasons?: string[];
};

export type CardIdentity = {
  id?: string | null;
  name: string;
  number?: string | null;
  setId?: string | null;
  setName?: string | null;
  language?: string | null;
  imageSmall?: string | null;
  imageLarge?: string | null;
  rarity?: string | null;
};

export type RecognitionCandidate = {
  identity: CardIdentity;
  confidence: number;
  evidence: CandidateEvidence;
  engineId: RecognitionEngineId;
  requiresReview?: boolean;
  raw?: unknown;
};

export type ModelManifest = {
  id: string;
  engineId: RecognitionEngineId;
  name: string;
  version: string;
  createdAt: string;
  runtime: 'legacy_backend' | 'on_device' | 'not_ready';
  input: 'rectified_card_jpeg' | 'resized_scan_images' | 'none';
  weightsSource?: string | null;
  license?: string | null;
};

export type CatalogueManifest = {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  languages: string[];
  sources: string[];
  schemaVersion?: string | null;
  cardCount?: number | null;
};

export type RecognitionEvent = {
  anonymousScanId: string;
  stage: RecognitionProcessingStage;
  durationMs: number;
  resultState: RecognitionOutcome | 'not_started' | 'failed';
  engineId?: RecognitionEngineId | null;
  modelVersion?: string | null;
  catalogueVersion?: string | null;
  confidence?: number | null;
  topOneTopTwoMargin?: number | null;
  qualityFailureReasons: CaptureQualityFailureReason[];
  candidateCount?: number | null;
  errorCode?: string | null;
};

export type RecognitionShadowModeDisagreementCategory =
  | 'pending_manual_review'
  | 'current_provider_correct_local_wrong'
  | 'local_correct_current_provider_wrong'
  | 'both_wrong'
  | 'both_correct'
  | 'exact_identity_agreement_variant_disagreement'
  | 'language_disagreement'
  | 'catalogue_missing'
  | 'capture_quality_failure'
  | 'local_unavailable'
  | 'visible_unavailable';

export type RecognitionShadowModeCandidate = {
  rank: number;
  canonicalCardId: string | null;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  variant: string | null;
  confidence: number | null;
  visualSimilarity: number | null;
  marginToSecond: number | null;
};

export type RecognitionShadowModeEngineResult = {
  engineId: RecognitionEngineId;
  outcome: RecognitionOutcome;
  topCandidates: RecognitionShadowModeCandidate[];
  confidence: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  modelVersion: string | null;
  catalogueVersion: string | null;
  timings: {
    totalMs: number | null;
    inferenceMs?: number | null;
    searchMs?: number | null;
    providerMs?: number | null;
  };
};

export type RecognitionShadowModeAgreement = {
  topOneIdentityAgreement: boolean | null;
  topThreeLocalContainsVisible: boolean | null;
  variantAgreement: boolean | null;
  languageAgreement: boolean | null;
  disagreementCategory: RecognitionShadowModeDisagreementCategory;
  reasons: string[];
};

export type RecognitionShadowModeSnapshot = {
  schemaVersion: 'stackr-shadow-mode-pilot-v1.0.0';
  enabled: true;
  anonymousScanId: string;
  createdAt: string;
  rawImageRecorded: false;
  visible: RecognitionShadowModeEngineResult;
  local: RecognitionShadowModeEngineResult;
  agreement: RecognitionShadowModeAgreement;
};

export type ScannerDiagnostics = {
  architectureVersion: typeof RECOGNITION_ARCHITECTURE_VERSION;
  anonymousScanId: string;
  startedAt: string;
  finishedAt?: string | null;
  totalDurationMs: number;
  events: RecognitionEvent[];
  engineId?: RecognitionEngineId | null;
  modelVersion?: string | null;
  catalogueVersion?: string | null;
  notes?: string[];
  legacyDiagnostics?: unknown;
  shadowMode?: RecognitionShadowModeSnapshot | null;
};

export type RecognitionResult = {
  outcome: RecognitionOutcome;
  engineId: RecognitionEngineId;
  candidates: RecognitionCandidate[];
  acceptedCandidate?: RecognitionCandidate | null;
  diagnostics: ScannerDiagnostics;
  error?: {
    code: string;
    message: string;
    retriable: boolean;
  } | null;
};

export type RecognitionFeedback = {
  anonymousScanId: string;
  recognitionOutcome: RecognitionOutcome;
  selectedCardId?: string | null;
  rejectedCandidateId?: string | null;
  correctedCardId?: string | null;
  candidateConfidences?: Record<string, number | null>;
  visualFeatureConsent: boolean;
  rawImageTrainingConsent: false;
  source: 'scan_result' | 'inventory' | 'binder_page' | 'manual_search';
};

export type RecognitionRequest = {
  anonymousScanId: string;
  requestedAt: string;
  cards: RectifiedCard[];
  binderId?: string | null;
  scanMode?: string | null;
  itemType?: string | null;
  isSlab?: boolean | null;
  quality?: CaptureQuality | null;
  ocrEvidence?: OcrEvidence | null;
  visualEvidence?: VisualEvidence | null;
  legacyContext?: {
    images?: string[];
    hints?: unknown;
  };
};

export type RecognitionEngine = {
  id: RecognitionEngineId;
  modelManifest: ModelManifest;
  catalogueManifest: CatalogueManifest;
  recognize(request: RecognitionRequest): Promise<RecognitionResult>;
};
