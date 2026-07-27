import type {
  CardFrameAnalyserCorners,
  CardFrameAnalyserFailureReason,
  CardFrameAnalysisResult,
} from './cardVisionFrameAnalyser';

export type LiveCardGuidanceCode =
  | 'move-closer'
  | 'move-further-away'
  | 'hold-steady'
  | 'reduce-glare'
  | 'improve-lighting'
  | 'show-all-four-corners'
  | 'flatten-angle'
  | 'tap-to-focus'
  | 'ready'
  | 'manual-ready'
  | 'one-card-only';

export type LiveCardGuidanceTone = 'neutral' | 'warning' | 'ready';

export type LiveCardGuidance = {
  code: LiveCardGuidanceCode;
  message: string;
  tone: LiveCardGuidanceTone;
};

export type LiveCardGuidanceInput = {
  analyserAvailable: boolean;
  result?: CardFrameAnalysisResult | null;
  stableFrameCount: number;
  requiredStableFrames: number;
  cornerMovement?: number | null;
  captureInProgress?: boolean;
};

export const LIVE_CARD_STABILITY_REQUIRED_FRAMES = 3;
export const LIVE_CARD_STABILITY_MAX_CORNER_MOVEMENT = 0.018;

const hasReason = (
  reasons: readonly CardFrameAnalyserFailureReason[],
  reason: CardFrameAnalyserFailureReason
) => reasons.includes(reason);

const guidance = (
  code: LiveCardGuidanceCode,
  message: string,
  tone: LiveCardGuidanceTone = 'neutral'
): LiveCardGuidance => ({ code, message, tone });

export function calculateCornerMovement(
  previousCorners?: CardFrameAnalyserCorners | null,
  nextCorners?: CardFrameAnalyserCorners | null
): number | null {
  if (!previousCorners || !nextCorners) return null;

  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
  const total = keys.reduce((sum, key) => {
    const previous = previousCorners[key];
    const next = nextCorners[key];
    return sum + Math.hypot(previous.x - next.x, previous.y - next.y);
  }, 0);

  return total / keys.length;
}

export function isStableCornerMovement(
  movement: number | null | undefined,
  maxMovement = LIVE_CARD_STABILITY_MAX_CORNER_MOVEMENT
): boolean {
  return movement == null || movement <= maxMovement;
}

export function getNextStableFrameCount(params: {
  currentStableFrameCount: number;
  result?: CardFrameAnalysisResult | null;
  cornerMovement?: number | null;
  maxCornerMovement?: number;
}): number {
  if (!params.result?.qualityAccepted) return 0;
  if (!isStableCornerMovement(params.cornerMovement, params.maxCornerMovement)) return 0;
  return params.currentStableFrameCount + 1;
}

export function getLiveCardGuidance(input: LiveCardGuidanceInput): LiveCardGuidance {
  if (!input.analyserAvailable) {
    return guidance('manual-ready', 'Manual capture is ready.');
  }

  if (input.captureInProgress) {
    return guidance('hold-steady', 'Hold steady.', 'ready');
  }

  const result = input.result;
  if (!result) {
    return guidance('move-closer', 'Move closer.');
  }

  if (
    result.qualityAccepted &&
    isStableCornerMovement(input.cornerMovement) &&
    input.stableFrameCount >= input.requiredStableFrames
  ) {
    return guidance('ready', 'Ready to capture.', 'ready');
  }

  if (result.qualityAccepted) {
    return guidance('hold-steady', 'Hold steady.', 'ready');
  }

  const reasons = result.failureReasons;
  if (hasReason(reasons, 'MULTIPLE_CARDS')) {
    return guidance('one-card-only', 'Keep one card in the window.', 'warning');
  }

  if (hasReason(reasons, 'EDGE_CLIPPED')) {
    return guidance('move-further-away', 'Move further away.', 'warning');
  }

  if (hasReason(reasons, 'LOW_FILL') || hasReason(reasons, 'NO_CARD')) {
    return guidance('move-closer', 'Move closer.');
  }

  if (hasReason(reasons, 'CORNER_OCCLUDED')) {
    return guidance('show-all-four-corners', 'Show all four corners.', 'warning');
  }

  if (hasReason(reasons, 'GLARE') || hasReason(reasons, 'OVEREXPOSED')) {
    return guidance('reduce-glare', 'Reduce glare.', 'warning');
  }

  if (hasReason(reasons, 'UNDEREXPOSED')) {
    return guidance('improve-lighting', 'Improve lighting.', 'warning');
  }

  if (hasReason(reasons, 'BLUR')) {
    return guidance('tap-to-focus', 'Tap to focus.');
  }

  if (hasReason(reasons, 'PERSPECTIVE') || hasReason(reasons, 'ASPECT_RATIO')) {
    return guidance('flatten-angle', 'Flatten the angle.');
  }

  return guidance('hold-steady', 'Hold steady.');
}
