import assert from 'node:assert/strict';
import type {
  CardFrameAnalyserCorners,
  CardFrameAnalyserFailureReason,
  CardFrameAnalysisResult,
} from '../lib/cardVisionFrameAnalyser';
import {
  LIVE_CARD_STABILITY_REQUIRED_FRAMES,
  calculateCornerMovement,
  getLiveCardGuidance,
  getNextStableFrameCount,
} from '../lib/liveCardGuidance';

const corners: CardFrameAnalyserCorners = {
  topLeft: { x: 0.2, y: 0.1 },
  topRight: { x: 0.8, y: 0.1 },
  bottomRight: { x: 0.8, y: 0.9 },
  bottomLeft: { x: 0.2, y: 0.9 },
};

function result(
  failureReasons: CardFrameAnalyserFailureReason[],
  qualityAccepted = false
): CardFrameAnalysisResult {
  return {
    cardDetected: failureReasons.length === 0 || !failureReasons.includes('NO_CARD'),
    corners: failureReasons.includes('NO_CARD') ? null : corners,
    fillRatio: failureReasons.includes('LOW_FILL') ? 0.2 : 0.78,
    aspectRatioScore: failureReasons.includes('ASPECT_RATIO') ? 0.2 : 0.94,
    blurScore: failureReasons.includes('BLUR') ? 0.12 : 0.82,
    glareRatio: failureReasons.includes('GLARE') ? 0.2 : 0.01,
    underexposureRatio: failureReasons.includes('UNDEREXPOSED') ? 0.6 : 0.02,
    overexposureRatio: failureReasons.includes('OVEREXPOSED') ? 0.5 : 0.01,
    perspectiveScore: failureReasons.includes('PERSPECTIVE') ? 0.2 : 0.9,
    allCornersVisible: !failureReasons.includes('CORNER_OCCLUDED'),
    edgeClipped: failureReasons.includes('EDGE_CLIPPED'),
    qualityAccepted,
    failureReasons,
    processingMs: 4,
  };
}

function guidanceCode(
  frameResult: CardFrameAnalysisResult | null,
  stableFrameCount = 0
) {
  return getLiveCardGuidance({
    analyserAvailable: true,
    result: frameResult,
    stableFrameCount,
    requiredStableFrames: LIVE_CARD_STABILITY_REQUIRED_FRAMES,
  }).code;
}

assert.equal(
  getLiveCardGuidance({
    analyserAvailable: false,
    result: null,
    stableFrameCount: 0,
    requiredStableFrames: LIVE_CARD_STABILITY_REQUIRED_FRAMES,
  }).code,
  'manual-ready'
);
assert.equal(guidanceCode(null), 'move-closer');
assert.equal(guidanceCode(result(['LOW_FILL'])), 'move-closer');
assert.equal(guidanceCode(result(['EDGE_CLIPPED'])), 'move-further-away');
assert.equal(guidanceCode(result(['GLARE'])), 'reduce-glare');
assert.equal(guidanceCode(result(['OVEREXPOSED'])), 'reduce-glare');
assert.equal(guidanceCode(result(['UNDEREXPOSED'])), 'improve-lighting');
assert.equal(guidanceCode(result(['CORNER_OCCLUDED'])), 'show-all-four-corners');
assert.equal(guidanceCode(result(['PERSPECTIVE'])), 'flatten-angle');
assert.equal(guidanceCode(result(['ASPECT_RATIO'])), 'flatten-angle');
assert.equal(guidanceCode(result(['BLUR'])), 'tap-to-focus');
assert.equal(guidanceCode(result(['MULTIPLE_CARDS'])), 'one-card-only');
assert.equal(guidanceCode(result([], true), 2), 'hold-steady');
assert.equal(guidanceCode(result([], true), 3), 'ready');

const shiftedCorners: CardFrameAnalyserCorners = {
  topLeft: { x: 0.28, y: 0.1 },
  topRight: { x: 0.88, y: 0.1 },
  bottomRight: { x: 0.88, y: 0.9 },
  bottomLeft: { x: 0.28, y: 0.9 },
};
assert.equal(calculateCornerMovement(corners, corners), 0);
assert.ok((calculateCornerMovement(corners, shiftedCorners) ?? 0) > 0.018);
assert.equal(
  getNextStableFrameCount({
    currentStableFrameCount: 2,
    result: result([], true),
    cornerMovement: 0.004,
  }),
  3
);
assert.equal(
  getNextStableFrameCount({
    currentStableFrameCount: 2,
    result: result([], true),
    cornerMovement: 0.08,
  }),
  0
);
assert.equal(
  getNextStableFrameCount({
    currentStableFrameCount: 2,
    result: result(['GLARE']),
    cornerMovement: 0,
  }),
  0
);

console.log('live card guidance tests passed');
