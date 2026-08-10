import assert from 'node:assert/strict';
import {
  evaluateStableAutoCapture,
  isScannerCaptureBusy,
  transitionScannerCaptureState,
  type ScannerCaptureState,
} from '../lib/scanAutoCaptureState';

function testStateTransitions() {
  let state: ScannerCaptureState = 'INITIALISING';
  state = transitionScannerCaptureState(state, { type: 'camera_ready' });
  assert.equal(state, 'SEARCHING');

  state = transitionScannerCaptureState(state, { type: 'card_found' });
  assert.equal(state, 'CARD_FOUND');

  state = transitionScannerCaptureState(state, { type: 'hold_steady' });
  assert.equal(state, 'HOLD_STEADY');

  state = transitionScannerCaptureState(state, { type: 'capture_start' });
  assert.equal(state, 'CAPTURING');

  state = transitionScannerCaptureState(state, { type: 'quality_check' });
  assert.equal(state, 'QUALITY_CHECK');

  state = transitionScannerCaptureState(state, { type: 'captured' });
  assert.equal(state, 'CAPTURED');

  state = transitionScannerCaptureState(state, { type: 'identify_start' });
  assert.equal(state, 'IDENTIFYING');

  state = transitionScannerCaptureState(state, { type: 'confirm' });
  assert.equal(state, 'CONFIRMING');
  assert.equal(isScannerCaptureBusy(state), true);

  state = transitionScannerCaptureState(state, { type: 'reset' });
  assert.equal(state, 'SEARCHING');
}

function testStableFramesGateCapture() {
  const first = evaluateStableAutoCapture({
    mode: 'auto',
    state: 'SEARCHING',
    hasValidQuadrilateral: true,
    qualityPassed: true,
    currentStableFrames: 0,
    requiredStableFrames: 2,
    captureInProgress: false,
    nowMs: 10_000,
    lastCaptureAtMs: 0,
    cooldownMs: 2_500,
  });

  assert.equal(first.nextState, 'HOLD_STEADY');
  assert.equal(first.stableFrames, 1);
  assert.equal(first.shouldCapture, false);

  const second = evaluateStableAutoCapture({
    ...first,
    mode: 'auto',
    state: first.nextState,
    hasValidQuadrilateral: true,
    qualityPassed: true,
    currentStableFrames: first.stableFrames,
    requiredStableFrames: 2,
    captureInProgress: false,
    nowMs: 10_220,
    lastCaptureAtMs: 0,
    cooldownMs: 2_500,
  });

  assert.equal(second.nextState, 'CAPTURING');
  assert.equal(second.stableFrames, 0);
  assert.equal(second.shouldCapture, true);
}

function testBusyAndCooldownPreventDuplicateCaptures() {
  const busy = evaluateStableAutoCapture({
    mode: 'auto',
    state: 'CAPTURING',
    hasValidQuadrilateral: true,
    qualityPassed: true,
    currentStableFrames: 2,
    requiredStableFrames: 2,
    captureInProgress: true,
    nowMs: 11_000,
    lastCaptureAtMs: 0,
    cooldownMs: 2_500,
  });
  assert.equal(busy.shouldCapture, false);
  assert.equal(busy.reason, 'busy');

  const cooldown = evaluateStableAutoCapture({
    mode: 'auto',
    state: 'SEARCHING',
    hasValidQuadrilateral: true,
    qualityPassed: true,
    currentStableFrames: 2,
    requiredStableFrames: 2,
    captureInProgress: false,
    nowMs: 11_000,
    lastCaptureAtMs: 10_000,
    cooldownMs: 2_500,
  });
  assert.equal(cooldown.shouldCapture, false);
  assert.equal(cooldown.reason, 'cooldown');
}

function testManualAndQualityFailuresDoNotCapture() {
  const manual = evaluateStableAutoCapture({
    mode: 'manual',
    state: 'SEARCHING',
    hasValidQuadrilateral: true,
    qualityPassed: true,
    currentStableFrames: 5,
    requiredStableFrames: 2,
    captureInProgress: false,
    nowMs: 10_000,
    lastCaptureAtMs: 0,
    cooldownMs: 2_500,
  });
  assert.equal(manual.shouldCapture, false);
  assert.equal(manual.reason, 'manual-mode');

  const quality = evaluateStableAutoCapture({
    mode: 'auto',
    state: 'CARD_FOUND',
    hasValidQuadrilateral: true,
    qualityPassed: false,
    currentStableFrames: 1,
    requiredStableFrames: 2,
    captureInProgress: false,
    nowMs: 10_000,
    lastCaptureAtMs: 0,
    cooldownMs: 2_500,
  });
  assert.equal(quality.shouldCapture, false);
  assert.equal(quality.stableFrames, 0);
  assert.equal(quality.nextState, 'QUALITY_CHECK');
}

testStateTransitions();
testStableFramesGateCapture();
testBusyAndCooldownPreventDuplicateCaptures();
testManualAndQualityFailuresDoNotCapture();

console.log('scan auto-capture state tests passed');
