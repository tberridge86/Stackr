import type { RecognitionCandidate, RecognitionResult } from './recognition/types';
import type { RecognitionFeatureFlags } from './recognition/featureFlags';
import type { ScannerCaptureState } from './scanAutoCaptureState';

export const LOCAL_QUICK_SCAN_EXPERIENCE_VERSION = 'stackr-local-quick-scan-experience-v1';

export type LocalQuickScanState =
  | 'opening_camera'
  | 'searching_for_card'
  | 'improve_capture'
  | 'stable'
  | 'capturing'
  | 'rectifying'
  | 'recognising'
  | 'accepted'
  | 'review_required'
  | 'rescan_required'
  | 'adding_to_collection'
  | 'complete'
  | 'recoverable_error';

export const LOCAL_QUICK_SCAN_STATES: LocalQuickScanState[] = [
  'opening_camera',
  'searching_for_card',
  'improve_capture',
  'stable',
  'capturing',
  'rectifying',
  'recognising',
  'accepted',
  'review_required',
  'rescan_required',
  'adding_to_collection',
  'complete',
  'recoverable_error',
];

export type LocalQuickScanDestination =
  | 'collection'
  | 'binder'
  | 'binder_page'
  | 'listing'
  | 'inventory'
  | 'unknown';

export type LocalQuickScanReasonCode =
  | 'move_closer'
  | 'move_further_away'
  | 'hold_steady'
  | 'reduce_glare'
  | 'improve_lighting'
  | 'show_all_four_corners'
  | 'flatten_angle'
  | 'tap_to_focus'
  | 'one_card_only'
  | 'no_card'
  | 'model_not_ready'
  | 'catalogue_not_ready'
  | 'uncertain_identity'
  | 'unknown_card'
  | 'unsupported_variant'
  | 'camera_error'
  | 'recognition_error';

export type LocalQuickScanSnapshot = {
  version: typeof LOCAL_QUICK_SCAN_EXPERIENCE_VERSION;
  state: LocalQuickScanState;
  scanId: string;
  destination: LocalQuickScanDestination;
  modelWarm: boolean;
  modelWarmupRequested: boolean;
  captureToken: string | null;
  acceptedCandidateId: string | null;
  reviewCandidateIds: string[];
  rescanReasonCode: LocalQuickScanReasonCode | null;
  userMessage: string | null;
  manualSearchOpen: boolean;
  pendingAddKey: string | null;
  lastAddedKey: string | null;
  duplicateAddPrevented: boolean;
};

export type LocalQuickScanEvent =
  | { type: 'OPEN_CAMERA' }
  | { type: 'CAMERA_READY' }
  | { type: 'MODEL_WARMUP_REQUESTED' }
  | { type: 'MODEL_WARMED' }
  | { type: 'CARD_SEARCHING' }
  | { type: 'CAPTURE_NEEDS_IMPROVEMENT'; reasonCode: LocalQuickScanReasonCode; message?: string | null }
  | { type: 'CARD_STABLE' }
  | { type: 'CAPTURE_STARTED'; captureToken: string }
  | { type: 'RECTIFICATION_STARTED' }
  | { type: 'RECOGNITION_STARTED' }
  | { type: 'RECOGNITION_ACCEPTED'; candidateId: string }
  | { type: 'RECOGNITION_REVIEW_REQUIRED'; candidateIds: string[] }
  | { type: 'RECOGNITION_RESCAN_REQUIRED'; reasonCode: LocalQuickScanReasonCode; message?: string | null }
  | { type: 'MANUAL_SEARCH_OPENED' }
  | { type: 'ADD_STARTED'; addKey: string }
  | { type: 'ADD_COMPLETE' }
  | { type: 'RECOVERABLE_ERROR'; reasonCode: LocalQuickScanReasonCode; message: string }
  | { type: 'RESET'; scanId?: string };

export type LocalQuickScanGuidance = {
  state: LocalQuickScanState;
  title: string;
  message: string;
  tone: 'idle' | 'ready' | 'attention' | 'busy' | 'success' | 'error';
  icon:
    | 'scan-outline'
    | 'checkmark-circle-outline'
    | 'hand-left-outline'
    | 'sunny-outline'
    | 'moon-outline'
    | 'expand-outline'
    | 'contract-outline'
    | 'radio-button-on-outline'
    | 'sync-outline'
    | 'search-outline'
    | 'alert-circle-outline'
    | 'cloud-offline-outline';
  accessibilityLabel: string;
  showOfflineIndicator: boolean;
};

export type LocalQuickScanCandidateLike = {
  id?: string | null;
  name?: string | null;
  setId?: string | null;
  set_id?: string | null;
  setName?: string | null;
  set_name?: string | null;
  collectorNumber?: string | null;
  number?: string | null;
  language?: string | null;
  variant?: string | null;
  editionHint?: string | null;
  rarity?: string | null;
  imageUri?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  confidence?: number | null;
  scan_confidence?: number | null;
};

export type LocalQuickScanCandidateSummary = {
  id: string;
  name: string;
  setName: string;
  collectorNumber: string;
  language: string;
  variant: string;
  imageUri: string | null;
  confidenceStatus: 'ready' | 'review' | 'try_again';
  confidenceLabel: string;
  differenceLabels: string[];
  accessibilityLabel: string;
};

export type LocalQuickScanResultViewModel = {
  outcome: RecognitionResult['outcome'];
  title: string;
  message: string;
  acceptedCandidate: LocalQuickScanCandidateSummary | null;
  reviewCandidates: LocalQuickScanCandidateSummary[];
  rescanReason: string | null;
  confirmLabel: string | null;
  manualSearchLabel: string;
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function clean(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function getCandidateId(candidate: LocalQuickScanCandidateLike, index: number) {
  return clean(candidate.id, `candidate-${index + 1}`);
}

function getCandidateSetName(candidate: LocalQuickScanCandidateLike) {
  return clean(candidate.setName ?? candidate.set_name ?? candidate.setId ?? candidate.set_id, 'Unknown set');
}

function getCandidateNumber(candidate: LocalQuickScanCandidateLike) {
  return clean(candidate.collectorNumber ?? candidate.number, 'No number');
}

function getCandidateVariant(candidate: LocalQuickScanCandidateLike) {
  return clean(candidate.variant ?? candidate.editionHint ?? candidate.rarity, 'Standard');
}

function getCandidateImageUri(candidate: LocalQuickScanCandidateLike) {
  return candidate.imageUri ?? candidate.image_large ?? candidate.image_small ?? null;
}

function getCandidateConfidence(candidate: LocalQuickScanCandidateLike) {
  const value = candidate.confidence ?? candidate.scan_confidence ?? null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

export function createLocalQuickScanSnapshot(options: {
  scanId: string;
  destination?: LocalQuickScanDestination;
  modelWarm?: boolean;
}): LocalQuickScanSnapshot {
  return {
    version: LOCAL_QUICK_SCAN_EXPERIENCE_VERSION,
    state: 'opening_camera',
    scanId: options.scanId,
    destination: options.destination ?? 'unknown',
    modelWarm: options.modelWarm ?? false,
    modelWarmupRequested: false,
    captureToken: null,
    acceptedCandidateId: null,
    reviewCandidateIds: [],
    rescanReasonCode: null,
    userMessage: null,
    manualSearchOpen: false,
    pendingAddKey: null,
    lastAddedKey: null,
    duplicateAddPrevented: false,
  };
}

export function transitionLocalQuickScan(
  current: LocalQuickScanSnapshot,
  event: LocalQuickScanEvent
): LocalQuickScanSnapshot {
  const next = (state: LocalQuickScanState, patch: Partial<LocalQuickScanSnapshot> = {}) => ({
    ...current,
    state,
    duplicateAddPrevented: false,
    ...patch,
  });

  switch (event.type) {
    case 'OPEN_CAMERA':
      return next('opening_camera', {
        captureToken: null,
        acceptedCandidateId: null,
        reviewCandidateIds: [],
        pendingAddKey: null,
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'CAMERA_READY':
    case 'CARD_SEARCHING':
      return next('searching_for_card', {
        captureToken: null,
        acceptedCandidateId: null,
        reviewCandidateIds: [],
        pendingAddKey: null,
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'MODEL_WARMUP_REQUESTED':
      return {
        ...current,
        modelWarmupRequested: true,
        duplicateAddPrevented: false,
      };
    case 'MODEL_WARMED':
      return {
        ...current,
        modelWarm: true,
        modelWarmupRequested: true,
        duplicateAddPrevented: false,
      };
    case 'CAPTURE_NEEDS_IMPROVEMENT':
      return next('improve_capture', {
        rescanReasonCode: event.reasonCode,
        userMessage: event.message ?? null,
      });
    case 'CARD_STABLE':
      return next('stable', {
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'CAPTURE_STARTED':
      return next('capturing', {
        captureToken: event.captureToken,
        acceptedCandidateId: null,
        reviewCandidateIds: [],
        pendingAddKey: null,
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'RECTIFICATION_STARTED':
      return next('rectifying');
    case 'RECOGNITION_STARTED':
      return next('recognising');
    case 'RECOGNITION_ACCEPTED':
      return next('accepted', {
        acceptedCandidateId: event.candidateId,
        reviewCandidateIds: [],
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'RECOGNITION_REVIEW_REQUIRED':
      return next('review_required', {
        acceptedCandidateId: null,
        reviewCandidateIds: event.candidateIds.slice(0, 3),
        rescanReasonCode: null,
        userMessage: null,
      });
    case 'RECOGNITION_RESCAN_REQUIRED':
      return next('rescan_required', {
        acceptedCandidateId: null,
        reviewCandidateIds: [],
        rescanReasonCode: event.reasonCode,
        userMessage: event.message ?? null,
      });
    case 'MANUAL_SEARCH_OPENED':
      return {
        ...current,
        manualSearchOpen: true,
        duplicateAddPrevented: false,
      };
    case 'ADD_STARTED':
      if (current.pendingAddKey === event.addKey || current.lastAddedKey === event.addKey) {
        return {
          ...current,
          duplicateAddPrevented: true,
        };
      }
      return next('adding_to_collection', {
        pendingAddKey: event.addKey,
      });
    case 'ADD_COMPLETE':
      return next('complete', {
        lastAddedKey: current.pendingAddKey,
        pendingAddKey: null,
      });
    case 'RECOVERABLE_ERROR':
      return next('recoverable_error', {
        rescanReasonCode: event.reasonCode,
        userMessage: event.message,
      });
    case 'RESET':
      return createLocalQuickScanSnapshot({
        scanId: event.scanId ?? current.scanId,
        destination: current.destination,
        modelWarm: current.modelWarm,
      });
    default:
      return current;
  }
}

export function mapScannerCaptureStateToLocalQuickScanState(options: {
  scannerState: ScannerCaptureState;
  cameraReady: boolean;
  guidanceReady: boolean;
  guidanceReason?: string | null;
}): LocalQuickScanState {
  if (!options.cameraReady || options.scannerState === 'INITIALISING') return 'opening_camera';

  switch (options.scannerState) {
    case 'SEARCHING':
    case 'CARD_FOUND':
      return options.guidanceReason && !options.guidanceReady ? 'improve_capture' : 'searching_for_card';
    case 'QUALITY_CHECK':
      return options.guidanceReady ? 'stable' : 'improve_capture';
    case 'HOLD_STEADY':
      return 'stable';
    case 'CAPTURING':
      return 'capturing';
    case 'CAPTURED':
      return 'rectifying';
    case 'IDENTIFYING':
      return 'recognising';
    case 'CONFIRMING':
      return 'accepted';
    case 'ERROR':
      return 'recoverable_error';
    default:
      return 'searching_for_card';
  }
}

export function normaliseLocalQuickScanReason(reason?: string | null): LocalQuickScanReasonCode | null {
  const value = String(reason ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!value) return null;
  if (value === 'too_dark' || value === 'underexposed') return 'improve_lighting';
  if (value === 'glare' || value === 'reduce_glare' || value === 'overexposed' || value === 'sleeve_reflection') return 'reduce_glare';
  if (value === 'too_close' || value === 'edge_clipped') return 'move_further_away';
  if (value === 'too_far' || value === 'move_closer' || value === 'low_fill') return 'move_closer';
  if (value === 'hold_steady' || value === 'unstable') return 'hold_steady';
  if (value === 'tap_to_focus' || value === 'blur') return 'tap_to_focus';
  if (value === 'corner_occluded' || value === 'show_all_four_corners') return 'show_all_four_corners';
  if (value === 'perspective' || value === 'aspect_ratio' || value === 'flatten_angle') return 'flatten_angle';
  if (value === 'multiple_cards' || value === 'one_card_only') return 'one_card_only';
  if (value === 'no_card' || value === 'no_trading_card') return 'no_card';
  if (value === 'engine_not_ready' || value === 'model_not_ready') return 'model_not_ready';
  if (value === 'catalogue_not_ready') return 'catalogue_not_ready';
  if (value === 'unknown_card') return 'unknown_card';
  if (value === 'unsupported_variant') return 'unsupported_variant';
  if (value === 'camera_error') return 'camera_error';
  if (value === 'recognition_error') return 'recognition_error';
  return 'uncertain_identity';
}

export function shouldShowLocalQuickScanOfflineIndicator(options: {
  featureFlags: RecognitionFeatureFlags;
  networkAvailable?: boolean | null;
}) {
  if (!options.featureFlags.localRecognitionEnabled) return false;
  if (options.networkAvailable === false) return true;
  return !options.featureFlags.legacyCloudFallbackEnabled;
}

export function getLocalQuickScanGuidance(options: {
  state: LocalQuickScanState;
  reasonCode?: LocalQuickScanReasonCode | null;
  userMessage?: string | null;
  showOfflineIndicator?: boolean;
}): LocalQuickScanGuidance {
  const reasonCode = options.reasonCode ?? null;
  const message = options.userMessage?.trim() || null;
  const offline = options.showOfflineIndicator ?? false;

  const guidanceByReason: Partial<Record<LocalQuickScanReasonCode, Pick<LocalQuickScanGuidance, 'title' | 'message' | 'icon'>>> = {
    move_closer: { title: 'Move closer', message: 'Fill more of the guide with one card.', icon: 'expand-outline' },
    move_further_away: { title: 'Move back', message: 'Keep the full card inside the guide.', icon: 'contract-outline' },
    hold_steady: { title: 'Hold steady', message: 'Keep the card still for a moment.', icon: 'hand-left-outline' },
    reduce_glare: { title: 'Reduce glare', message: 'Tilt slightly away from reflections.', icon: 'sunny-outline' },
    improve_lighting: { title: 'Improve lighting', message: 'Move into brighter, even light.', icon: 'moon-outline' },
    show_all_four_corners: { title: 'Show corners', message: 'Make all four card corners visible.', icon: 'scan-outline' },
    flatten_angle: { title: 'Flatten angle', message: 'Hold the card flatter to the camera.', icon: 'scan-outline' },
    tap_to_focus: { title: 'Tap to focus', message: 'Tap the card, then hold steady.', icon: 'radio-button-on-outline' },
    one_card_only: { title: 'One card only', message: 'Keep other cards outside the guide.', icon: 'alert-circle-outline' },
    no_card: { title: 'Find the card', message: 'Place one card inside the guide.', icon: 'search-outline' },
    model_not_ready: { title: 'Local scan unavailable', message: 'Use manual search or try again shortly.', icon: 'cloud-offline-outline' },
    catalogue_not_ready: { title: 'Catalogue unavailable', message: 'Use manual search until the local pack is ready.', icon: 'cloud-offline-outline' },
    uncertain_identity: { title: 'Needs review', message: 'Choose from the closest matches.', icon: 'alert-circle-outline' },
    unknown_card: { title: 'Could not confirm', message: 'Try another scan or search manually.', icon: 'alert-circle-outline' },
    unsupported_variant: { title: 'Variant needs review', message: 'Check the exact finish before saving.', icon: 'alert-circle-outline' },
    camera_error: { title: 'Camera issue', message: 'Try reopening the scanner.', icon: 'alert-circle-outline' },
    recognition_error: { title: 'Scan issue', message: 'Try again or search manually.', icon: 'alert-circle-outline' },
  };

  const base: Pick<LocalQuickScanGuidance, 'title' | 'message' | 'tone' | 'icon'> = (() => {
    switch (options.state) {
      case 'opening_camera':
        return { title: 'Opening camera', message: 'Getting the scanner ready.', tone: 'busy', icon: 'sync-outline' };
      case 'searching_for_card':
        return { title: 'Find the card', message: 'Centre one card inside the guide.', tone: 'idle', icon: 'scan-outline' };
      case 'improve_capture': {
        const reason = reasonCode ? guidanceByReason[reasonCode] : null;
        return {
          title: reason?.title ?? 'Improve capture',
          message: message ?? reason?.message ?? 'Adjust the card so Stackr can read it clearly.',
          tone: 'attention',
          icon: reason?.icon ?? 'scan-outline',
        };
      }
      case 'stable':
        return { title: 'Ready to capture', message: 'Hold steady.', tone: 'ready', icon: 'checkmark-circle-outline' };
      case 'capturing':
        return { title: 'Capturing', message: 'Keep the card in frame.', tone: 'busy', icon: 'sync-outline' };
      case 'rectifying':
        return { title: 'Preparing image', message: 'Straightening the card crop.', tone: 'busy', icon: 'sync-outline' };
      case 'recognising':
        return { title: 'Recognising', message: 'Matching the card on device when available.', tone: 'busy', icon: 'sync-outline' };
      case 'accepted':
        return { title: 'Ready to add', message: 'Confirm the card details before saving.', tone: 'success', icon: 'checkmark-circle-outline' };
      case 'review_required':
        return { title: 'Review match', message: 'Pick the exact printing before saving.', tone: 'attention', icon: 'alert-circle-outline' };
      case 'rescan_required': {
        const reason = reasonCode ? guidanceByReason[reasonCode] : null;
        return {
          title: reason?.title ?? 'Try again',
          message: message ?? reason?.message ?? 'Stackr could not confirm this card.',
          tone: 'error',
          icon: reason?.icon ?? 'alert-circle-outline',
        };
      }
      case 'adding_to_collection':
        return { title: 'Adding', message: 'Saving this card to your collection.', tone: 'busy', icon: 'sync-outline' };
      case 'complete':
        return { title: 'Saved', message: 'Ready for the next card.', tone: 'success', icon: 'checkmark-circle-outline' };
      case 'recoverable_error': {
        const reason = reasonCode ? guidanceByReason[reasonCode] : null;
        return {
          title: reason?.title ?? 'Try again',
          message: message ?? reason?.message ?? 'The scan hit a recoverable issue.',
          tone: 'error',
          icon: reason?.icon ?? 'alert-circle-outline',
        };
      }
      default:
        return { title: 'Find the card', message: 'Centre one card inside the guide.', tone: 'idle', icon: 'scan-outline' };
    }
  })();

  const offlineSuffix = offline ? ' Offline local scan mode.' : '';
  return {
    ...base,
    state: options.state,
    message: `${base.message}${offlineSuffix}`,
    accessibilityLabel: `${base.title}. ${base.message}${offlineSuffix}`,
    showOfflineIndicator: offline,
  };
}

export function getDiscreetConfidenceStatus(options: {
  outcome: RecognitionResult['outcome'] | 'none';
  confidence?: number | null;
  candidateCount?: number | null;
}): Pick<LocalQuickScanCandidateSummary, 'confidenceStatus' | 'confidenceLabel'> {
  if (options.outcome === 'accepted') {
    return {
      confidenceStatus: 'ready',
      confidenceLabel: 'High confidence',
    };
  }
  if (options.outcome === 'review_required' || (options.candidateCount ?? 0) > 1) {
    return {
      confidenceStatus: 'review',
      confidenceLabel: 'Needs review',
    };
  }
  if ((options.confidence ?? 0) > 0.85) {
    return {
      confidenceStatus: 'ready',
      confidenceLabel: 'High confidence',
    };
  }
  return {
    confidenceStatus: 'review',
    confidenceLabel: 'Review match',
  };
}

export function getLocalQuickScanCandidateDifferenceLabels(
  candidates: LocalQuickScanCandidateLike[]
): Record<string, string[]> {
  const setNames = unique(candidates.map(getCandidateSetName));
  const numbers = unique(candidates.map(getCandidateNumber));
  const languages = unique(candidates.map((candidate) => candidate.language));
  const variants = unique(candidates.map(getCandidateVariant));

  return Object.fromEntries(candidates.map((candidate, index) => {
    const labels = [
      setNames.length > 1 ? getCandidateSetName(candidate) : null,
      numbers.length > 1 ? `No. ${getCandidateNumber(candidate)}` : null,
      languages.length > 1 ? clean(candidate.language, 'Language unknown') : null,
      variants.length > 1 ? getCandidateVariant(candidate) : null,
    ].filter(Boolean) as string[];

    return [
      getCandidateId(candidate, index),
      labels.length ? labels.slice(0, 4) : [`Choice ${index + 1}`],
    ];
  }));
}

export function buildLocalQuickScanCandidateSummaries(options: {
  candidates: LocalQuickScanCandidateLike[];
  outcome: RecognitionResult['outcome'] | 'none';
  limit?: number;
}): LocalQuickScanCandidateSummary[] {
  const limited = options.candidates.slice(0, options.limit ?? 3);
  const differences = getLocalQuickScanCandidateDifferenceLabels(limited);

  return limited.map((candidate, index) => {
    const id = getCandidateId(candidate, index);
    const confidence = getCandidateConfidence(candidate);
    const status = getDiscreetConfidenceStatus({
      outcome: options.outcome,
      confidence,
      candidateCount: limited.length,
    });
    const name = clean(candidate.name, 'Unknown card');
    const setName = getCandidateSetName(candidate);
    const collectorNumber = getCandidateNumber(candidate);
    const language = clean(candidate.language, 'Language unknown');
    const variant = getCandidateVariant(candidate);
    const differenceLabels = differences[id] ?? [`Choice ${index + 1}`];

    return {
      id,
      name,
      setName,
      collectorNumber,
      language,
      variant,
      imageUri: getCandidateImageUri(candidate),
      ...status,
      differenceLabels,
      accessibilityLabel: [
        name,
        setName,
        `number ${collectorNumber}`,
        language,
        variant,
        status.confidenceLabel,
      ].join(', '),
    };
  });
}

function recognitionCandidateToCandidateLike(candidate: RecognitionCandidate): LocalQuickScanCandidateLike {
  return {
    id: candidate.identity.id ?? null,
    name: candidate.identity.name,
    setId: candidate.identity.setId ?? null,
    setName: candidate.identity.setName ?? null,
    collectorNumber: candidate.identity.number ?? null,
    language: candidate.identity.language ?? null,
    variant: candidate.identity.rarity ?? null,
    imageUri: candidate.identity.imageLarge ?? candidate.identity.imageSmall ?? null,
    confidence: candidate.confidence,
  };
}

export function buildLocalQuickScanResultViewModel(result: RecognitionResult): LocalQuickScanResultViewModel {
  const candidates = result.candidates.map(recognitionCandidateToCandidateLike);

  if (result.outcome === 'accepted') {
    const acceptedCandidate = buildLocalQuickScanCandidateSummaries({
      candidates: candidates.slice(0, 1),
      outcome: 'accepted',
      limit: 1,
    })[0] ?? null;
    return {
      outcome: result.outcome,
      title: acceptedCandidate ? acceptedCandidate.name : 'Ready to add',
      message: acceptedCandidate
        ? `${acceptedCandidate.setName} - No. ${acceptedCandidate.collectorNumber}`
        : 'Confirm the card details before saving.',
      acceptedCandidate,
      reviewCandidates: [],
      rescanReason: null,
      confirmLabel: 'Add card',
      manualSearchLabel: 'Search manually',
    };
  }

  if (result.outcome === 'review_required') {
    return {
      outcome: result.outcome,
      title: 'Review match',
      message: 'Choose the exact printing before saving.',
      acceptedCandidate: null,
      reviewCandidates: buildLocalQuickScanCandidateSummaries({
        candidates,
        outcome: 'review_required',
        limit: 3,
      }),
      rescanReason: null,
      confirmLabel: null,
      manualSearchLabel: 'Search manually',
    };
  }

  const reasonCode = normaliseLocalQuickScanReason(result.error?.code);
  const guidance = getLocalQuickScanGuidance({
    state: 'rescan_required',
    reasonCode,
    userMessage: result.error?.message ?? null,
  });

  return {
    outcome: result.outcome,
    title: guidance.title,
    message: guidance.message,
    acceptedCandidate: null,
    reviewCandidates: [],
    rescanReason: guidance.message,
    confirmLabel: null,
    manualSearchLabel: 'Search manually',
  };
}
