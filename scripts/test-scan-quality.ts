import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { encode as encodeJpeg } from 'jpeg-js';
import { localiseCardFromJpegBase64 } from '../lib/cardLocalisation';
import { createScanQualityThresholds, evaluateScanQuality } from '../lib/scanQuality';

function makeCanvas(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgba[0];
    data[index + 1] = rgba[1];
    data[index + 2] = rgba[2];
    data[index + 3] = rgba[3];
  }
  return { width, height, data };
}

function putPixel(canvas: ReturnType<typeof makeCanvas>, x: number, y: number, rgba: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const index = (Math.round(y) * canvas.width + Math.round(x)) * 4;
  canvas.data[index] = rgba[0];
  canvas.data[index + 1] = rgba[1];
  canvas.data[index + 2] = rgba[2];
  canvas.data[index + 3] = rgba[3];
}

function fillRect(
  canvas: ReturnType<typeof makeCanvas>,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: [number, number, number, number]
) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      putPixel(canvas, px, py, rgba);
    }
  }
}

function strokeRect(
  canvas: ReturnType<typeof makeCanvas>,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  rgba: [number, number, number, number]
) {
  fillRect(canvas, x, y, width, thickness, rgba);
  fillRect(canvas, x, y + height - thickness, width, thickness, rgba);
  fillRect(canvas, x, y, thickness, height, rgba);
  fillRect(canvas, x + width - thickness, y, thickness, height, rgba);
}

function drawSyntheticCard(
  canvas: ReturnType<typeof makeCanvas>,
  rect = { x: 96, y: 100, width: 214, height: 299 }
) {
  fillRect(canvas, rect.x, rect.y, rect.width, rect.height, [246, 246, 238, 255]);
  strokeRect(canvas, rect.x, rect.y, rect.width, rect.height, 6, [28, 28, 28, 255]);
  strokeRect(canvas, rect.x + 14, rect.y + 18, rect.width - 28, Math.round(rect.height * 0.36), 4, [92, 82, 180, 255]);
  fillRect(canvas, rect.x + 24, rect.y + 30, 42, 42, [240, 120, 60, 255]);
  fillRect(canvas, rect.x + 72, rect.y + 54, 52, 52, [80, 160, 230, 255]);
  fillRect(canvas, rect.x + 24, rect.y + Math.round(rect.height * 0.52), rect.width - 48, 8, [26, 26, 26, 255]);
  fillRect(canvas, rect.x + 24, rect.y + Math.round(rect.height * 0.64), rect.width - 70, 6, [26, 26, 26, 255]);
  fillRect(canvas, rect.x + 32, rect.y + rect.height - 42, 32, 24, [245, 197, 54, 255]);
  fillRect(canvas, rect.x + rect.width - 64, rect.y + rect.height - 42, 34, 24, [27, 111, 210, 255]);
}

function toJpegBase64(canvas: ReturnType<typeof makeCanvas>) {
  const encoded = encodeJpeg(canvas, 90);
  return Buffer.from(encoded.data).toString('base64');
}

function darken(canvas: ReturnType<typeof makeCanvas>, ratio: number) {
  for (let index = 0; index < canvas.data.length; index += 4) {
    canvas.data[index] = Math.round(canvas.data[index] * ratio);
    canvas.data[index + 1] = Math.round(canvas.data[index + 1] * ratio);
    canvas.data[index + 2] = Math.round(canvas.data[index + 2] * ratio);
  }
}

function blurHorizontally(canvas: ReturnType<typeof makeCanvas>, radius = 8) {
  const copy = new Uint8Array(canvas.data);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const sums = [0, 0, 0];
      let count = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sourceX = Math.max(0, Math.min(canvas.width - 1, x + dx));
        const index = (y * canvas.width + sourceX) * 4;
        sums[0] += copy[index];
        sums[1] += copy[index + 1];
        sums[2] += copy[index + 2];
        count += 1;
      }
      const targetIndex = (y * canvas.width + x) * 4;
      canvas.data[targetIndex] = Math.round(sums[0] / count);
      canvas.data[targetIndex + 1] = Math.round(sums[1] / count);
      canvas.data[targetIndex + 2] = Math.round(sums[2] / count);
    }
  }
}

function evaluate(canvas: ReturnType<typeof makeCanvas>, previous?: ReturnType<typeof localiseCardFromJpegBase64> | null) {
  const base64 = toJpegBase64(canvas);
  const localisation = localiseCardFromJpegBase64(base64, {
    expectedAspectRatio: 0.716,
    minFrameCoverage: 0.08,
    maxFrameCoverage: 0.84,
    analysisStep: 2,
  });
  const quality = evaluateScanQuality(base64, {
    localisation,
    previousLocalisation: previous ?? null,
    calibration: { deviceProfile: 'balanced' },
  });
  return { base64, localisation, quality };
}

function testGoodFramePasses() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas);
  const { quality } = evaluate(canvas);

  assert.equal(quality.passed, true);
  assert.equal(quality.instruction, null);
  assert.ok(quality.focusScore >= quality.thresholds.minFocusScore);
}

function testDimRoomFailsLighting() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas);
  darken(canvas, 0.18);
  const { quality } = evaluate(canvas);

  assert.equal(quality.passed, false);
  assert.equal(quality.instruction, 'improve-lighting');
}

function testGlareFailsBeforeRecognition() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas);
  fillRect(canvas, 118, 132, 168, 148, [255, 255, 255, 255]);
  const { quality } = evaluate(canvas);

  assert.equal(quality.passed, false);
  assert.equal(quality.instruction, 'reduce-glare');
}

function testBlurAsksForFocus() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas);
  blurHorizontally(canvas, 18);
  const { quality } = evaluate(canvas);

  assert.equal(quality.passed, false);
  assert.equal(quality.instruction, 'tap-to-focus');
}

function testPartialCardAsksWholeCard() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas, { x: -26, y: 92, width: 214, height: 299 });
  const { quality } = evaluate(canvas);

  assert.equal(quality.passed, false);
  assert.equal(quality.instruction, 'show-whole-card');
}

function testMovementAsksHoldSteady() {
  const firstCanvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  const secondCanvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(firstCanvas, { x: 82, y: 100, width: 214, height: 299 });
  drawSyntheticCard(secondCanvas, { x: 134, y: 100, width: 214, height: 299 });
  const first = evaluate(firstCanvas);
  const second = evaluate(secondCanvas, first.localisation);

  assert.equal(second.quality.passed, false);
  assert.equal(second.quality.instruction, 'hold-steady');
}

function testDeviceProfilesAndOverridesAreConfigurable() {
  const lowEnd = createScanQualityThresholds({ deviceProfile: 'low-end' });
  const highEnd = createScanQualityThresholds({ deviceProfile: 'high-end' });
  const custom = createScanQualityThresholds({
    deviceProfile: 'high-end',
    minFocusScore: 0.21,
    maxGlareRatio: 0.31,
  });

  assert.ok(lowEnd.minFocusScore < highEnd.minFocusScore);
  assert.ok(lowEnd.maxCenterShiftRatio > highEnd.maxCenterShiftRatio);
  assert.equal(custom.minFocusScore, 0.21);
  assert.equal(custom.maxGlareRatio, 0.31);
}

testGoodFramePasses();
testDimRoomFailsLighting();
testGlareFailsBeforeRecognition();
testBlurAsksForFocus();
testPartialCardAsksWholeCard();
testMovementAsksHoldSteady();
testDeviceProfilesAndOverridesAreConfigurable();

console.log('scan quality tests passed');
