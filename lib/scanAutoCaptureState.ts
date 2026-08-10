export type ScannerCaptureState =
  | 'INITIALISING'
  | 'SEARCHING'
  | 'CARD_FOUND'
  | 'QUALITY_CHECK'
  | 'HOLD_STEADY'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'IDENTIFYING'
  | 'CONFIRMING'
  | 'ERROR';

export type ScannerCaptureEvent =
  | { type: 'camera_ready' }
  | { type: 'camera_paused' }
  | { type: 'search' }
  | { type: 'card_found' }
  | { type: 'quality_check' }
  | { type: 'hold_steady' }
  | { type: 'capture_start' }
  | { type: 'captured' }
  | { type: 'identify_start' }
  | { type: 'confirm' }
  | { type: 'error' }
  | { type: 'reset' };

export type StableAutoCaptureInput = {
  mode: 'auto' | 'manual';
  state: ScannerCaptureState;
  hasValidQuadrilateral: boolean;
  qualityPassed: boolean;
  currentStableFrames: number;
  requiredStableFrames: number;
  captureInProgress: boolean;
  nowMs: number;
  lastCaptureAtMs: number;
  cooldownMs: number;
};

export type StableAutoCaptureDecision = {
  nextState: ScannerCaptureState;
  stableFrames: number;
  shouldCapture: boolean;
  reason:
    | 'manual-mode'
    | 'busy'
    | 'cooldown'
    | 'searching'
    | 'quality'
    | 'hold-steady'
    | 'ready';
};

const BUSY_STATES = new Set<ScannerCaptureState>([
  'CAPTURING',
  'CAPTURED',
  'IDENTIFYING',
  'CONFIRMING',
]);

export function transitionScannerCaptureState(
  current: ScannerCaptureState,
  event: ScannerCaptureEvent
): ScannerCaptureState {
  switch (event.type) {
    case 'camera_ready':
    case 'search':
    case 'reset':
      return 'SEARCHING';
    case 'camera_paused':
      return 'INITIALISING';
    case 'card_found':
      return current === 'CAPTURING' || current === 'CAPTURED' || current === 'IDENTIFYING' || current === 'CONFIRMING'
        ? current
        : 'CARD_FOUND';
    case 'quality_check':
      return current === 'CAPTURED' || current === 'IDENTIFYING' || current === 'CONFIRMING'
        ? current
        : 'QUALITY_CHECK';
    case 'hold_steady':
      return BUSY_STATES.has(current) ? current : 'HOLD_STEADY';
    case 'capture_start':
      return current === 'IDENTIFYING' || current === 'CONFIRMING' ? current : 'CAPTURING';
    case 'captured':
      return current === 'CAPTURING' || current === 'QUALITY_CHECK' ? 'CAPTURED' : current;
    case 'identify_start':
      return current === 'CAPTURING' || current === 'CAPTURED' ? 'IDENTIFYING' : current;
    case 'confirm':
      return 'CONFIRMING';
    case 'error':
      return 'ERROR';
    default:
      return current;
  }
}

export function isScannerCaptureBusy(state: ScannerCaptureState) {
  return BUSY_STATES.has(state);
}

export function evaluateStableAutoCapture(input: StableAutoCaptureInput): StableAutoCaptureDecision {
  const requiredStableFrames = Math.max(1, Math.round(input.requiredStableFrames));
  const cooldownActive = input.nowMs - input.lastCaptureAtMs < input.cooldownMs;

  if (input.mode !== 'auto') {
    return {
      nextState: 'SEARCHING',
      stableFrames: 0,
      shouldCapture: false,
      reason: 'manual-mode',
    };
  }

  if (input.captureInProgress || isScannerCaptureBusy(input.state)) {
    return {
      nextState: input.state,
      stableFrames: 0,
      shouldCapture: false,
      reason: 'busy',
    };
  }

  if (cooldownActive) {
    return {
      nextState: 'SEARCHING',
      stableFrames: 0,
      shouldCapture: false,
      reason: 'cooldown',
    };
  }

  if (!input.hasValidQuadrilateral) {
    return {
      nextState: 'SEARCHING',
      stableFrames: 0,
      shouldCapture: false,
      reason: 'searching',
    };
  }

  if (!input.qualityPassed) {
    return {
      nextState: 'QUALITY_CHECK',
      stableFrames: 0,
      shouldCapture: false,
      reason: 'quality',
    };
  }

  const stableFrames = input.currentStableFrames + 1;
  if (stableFrames < requiredStableFrames) {
    return {
      nextState: 'HOLD_STEADY',
      stableFrames,
      shouldCapture: false,
      reason: 'hold-steady',
    };
  }

  return {
    nextState: 'CAPTURING',
    stableFrames: 0,
    shouldCapture: true,
    reason: 'ready',
  };
}
