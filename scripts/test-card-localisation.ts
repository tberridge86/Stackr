import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { encode as encodeJpeg } from 'jpeg-js';
import {
  getCardLocalisationGuidance,
  localiseCardFromJpegBase64,
  perspectiveCorrectCardJpegBase64,
  smoothCardLocalisation,
} from '../lib/cardLocalisation';

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

function drawLine(
  canvas: ReturnType<typeof makeCanvas>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  rgba: [number, number, number, number]
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const radius = Math.max(1, Math.floor(thickness / 2));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillRect(canvas, Math.round(x) - radius, Math.round(y) - radius, radius * 2 + 1, radius * 2 + 1, rgba);
  }
}

function drawSyntheticCard(
  canvas: ReturnType<typeof makeCanvas>,
  rect: { x: number; y: number; width: number; height: number }
) {
  fillRect(canvas, rect.x, rect.y, rect.width, rect.height, [246, 246, 238, 255]);
  strokeRect(canvas, rect.x, rect.y, rect.width, rect.height, 6, [32, 32, 32, 255]);
  strokeRect(canvas, rect.x + 14, rect.y + 18, rect.width - 28, Math.round(rect.height * 0.36), 4, [92, 82, 180, 255]);
  fillRect(canvas, rect.x + 30, rect.y + Math.round(rect.height * 0.54), rect.width - 60, 8, [26, 26, 26, 255]);
  fillRect(canvas, rect.x + 30, rect.y + Math.round(rect.height * 0.66), rect.width - 84, 6, [26, 26, 26, 255]);
  fillRect(canvas, rect.x + 32, rect.y + rect.height - 42, 32, 24, [245, 197, 54, 255]);
  fillRect(canvas, rect.x + rect.width - 64, rect.y + rect.height - 42, 34, 24, [27, 111, 210, 255]);
}

function drawSyntheticAngledCard(canvas: ReturnType<typeof makeCanvas>) {
  const topLeft = { x: 108, y: 92 };
  const topRight = { x: 328, y: 118 };
  const bottomRight = { x: 300, y: 434 };
  const bottomLeft = { x: 78, y: 398 };
  drawLine(canvas, topLeft.x, topLeft.y, topRight.x, topRight.y, 7, [28, 28, 28, 255]);
  drawLine(canvas, topRight.x, topRight.y, bottomRight.x, bottomRight.y, 7, [28, 28, 28, 255]);
  drawLine(canvas, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y, 7, [28, 28, 28, 255]);
  drawLine(canvas, bottomLeft.x, bottomLeft.y, topLeft.x, topLeft.y, 7, [28, 28, 28, 255]);
  drawLine(canvas, 128, 150, 304, 170, 4, [92, 82, 180, 255]);
  drawLine(canvas, 116, 282, 290, 306, 5, [26, 26, 26, 255]);
}

function toJpegBase64(canvas: ReturnType<typeof makeCanvas>) {
  const encoded = encodeJpeg(canvas, 90);
  return Buffer.from(encoded.data).toString('base64');
}

function close(actual: number, expected: number, tolerance: number) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function testConfidentPortraitCard() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas, { x: 96, y: 100, width: 214, height: 299 });
  const result = localiseCardFromJpegBase64(toJpegBase64(canvas), {
    expectedAspectRatio: 0.716,
    minFrameCoverage: 0.08,
    maxFrameCoverage: 0.74,
    analysisStep: 2,
  });

  assert.equal(result.status, 'confident');
  assert.equal(result.confidence.cornersDetected, true);
  assert.ok(result.quadrilateral);
  assert.ok(result.crop);
  close(result.confidence.aspectRatio, 0.716, 0.09);
  close(result.crop!.x, 96, 18);
  close(result.crop!.y, 100, 18);
}

function testTooSmallCardIsUncertain() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas, { x: 140, y: 180, width: 140, height: 196 });
  const result = localiseCardFromJpegBase64(toJpegBase64(canvas), {
    expectedAspectRatio: 0.716,
    minFrameCoverage: 0.14,
    analysisStep: 2,
  });

  assert.equal(result.status, 'uncertain');
  assert.equal(result.requiresManualAdjustment, true);
  assert.match(getCardLocalisationGuidance(result), /Move closer|Show all four edges/);
}

function testBlankFrameFails() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  const result = localiseCardFromJpegBase64(toJpegBase64(canvas), {
    expectedAspectRatio: 0.716,
    analysisStep: 2,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.confidence.cornersDetected, false);
}

function testAngledCardReturnsEdgeIntersections() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticAngledCard(canvas);
  const result = localiseCardFromJpegBase64(toJpegBase64(canvas), {
    expectedAspectRatio: 0.716,
    minFrameCoverage: 0.08,
    analysisStep: 2,
  });

  assert.equal(result.status, 'confident');
  assert.equal(result.confidence.cornerSource, 'edge-intersections');
  assert.ok(result.quadrilateral);
  assert.ok(Math.abs(result.quadrilateral!.topLeft.y - result.quadrilateral!.topRight.y) > 3);
  assert.ok(Math.abs(result.quadrilateral!.bottomLeft.y - result.quadrilateral!.bottomRight.y) > 3);
}

function testSmoothingReducesJumps() {
  const canvasA = makeCanvas(420, 580, [222, 221, 215, 255]);
  const canvasB = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvasA, { x: 96, y: 100, width: 214, height: 299 });
  drawSyntheticCard(canvasB, { x: 112, y: 112, width: 214, height: 299 });
  const first = localiseCardFromJpegBase64(toJpegBase64(canvasA), { analysisStep: 2 });
  const second = localiseCardFromJpegBase64(toJpegBase64(canvasB), { analysisStep: 2 });
  const smoothed = smoothCardLocalisation(first, second, { alpha: 0.35 });

  assert.ok(first.quadrilateral);
  assert.ok(second.quadrilateral);
  assert.ok(smoothed.quadrilateral);
  assert.ok(smoothed.quadrilateral!.topLeft.x > first.quadrilateral!.topLeft.x);
  assert.ok(smoothed.quadrilateral!.topLeft.x < second.quadrilateral!.topLeft.x);
}

function testPerspectiveCorrectionShape() {
  const canvas = makeCanvas(420, 580, [222, 221, 215, 255]);
  drawSyntheticCard(canvas, { x: 96, y: 100, width: 214, height: 299 });
  const base64 = toJpegBase64(canvas);
  const result = localiseCardFromJpegBase64(base64, { analysisStep: 2 });
  assert.ok(result.quadrilateral);
  const corrected = perspectiveCorrectCardJpegBase64(base64, result.quadrilateral!, {
    expectedAspectRatio: 0.716,
    outputWidth: 320,
    quality: 80,
  });

  assert.equal(corrected.width, 320);
  close(corrected.height, 447, 2);
  assert.ok(corrected.base64.length > 1000);
  assert.equal(corrected.transformMatrix.length, 9);
}

testConfidentPortraitCard();
testTooSmallCardIsUncertain();
testBlankFrameFails();
testAngledCardReturnsEdgeIntersections();
testSmoothingReducesJumps();
testPerspectiveCorrectionShape();

console.log('card localisation tests passed');
