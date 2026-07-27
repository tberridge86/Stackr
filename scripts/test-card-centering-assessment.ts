import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { encode as encodeJpeg } from 'jpeg-js';
import { assessCardCenteringFromJpeg } from '../lib/cardCenteringAssessment';

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function paintPixel(data: Buffer, width: number, x: number, y: number, r: number, g: number, b: number) {
  const index = (y * width + x) * 4;
  data[index] = r;
  data[index + 1] = g;
  data[index + 2] = b;
  data[index + 3] = 255;
}

function fillRect(data: Buffer, imageWidth: number, rect: Rect, r: number, g: number, b: number) {
  for (let y = rect.top; y < rect.top + rect.height; y += 1) {
    for (let x = rect.left; x < rect.left + rect.width; x += 1) {
      paintPixel(data, imageWidth, x, y, r, g, b);
    }
  }
}

function createSyntheticCardImage(cardRect: Rect) {
  const width = 600;
  const height = 825;
  const data = Buffer.alloc(width * height * 4);
  fillRect(data, width, { left: 0, top: 0, width, height }, 246, 243, 252);
  fillRect(data, width, cardRect, 35, 35, 45);
  fillRect(
    data,
    width,
    {
      left: cardRect.left + 10,
      top: cardRect.top + 10,
      width: cardRect.width - 20,
      height: cardRect.height - 20,
    },
    235,
    238,
    245
  );

  return Buffer.from(encodeJpeg({ data, width, height }, 92).data).toString('base64');
}

function assertAvailable(caseName: string, base64: string) {
  const assessment = assessCardCenteringFromJpeg(base64);
  assert.equal(assessment.available, true, `${caseName} should produce a centering assessment`);
  assert.equal(assessment.method, 'local-border-balance-v1');
  assert.ok(assessment.disclaimer.includes('not a professional grade'), `${caseName} should include a non-grade disclaimer`);
  return assessment;
}

const centered = assertAvailable('centered card', createSyntheticCardImage({
  left: 60,
  top: 80,
  width: 480,
  height: 665,
}));
assert.equal(centered.label, 'Well centred');
assert.ok((centered.ratios.left ?? 0) >= 47 && (centered.ratios.left ?? 0) <= 53);
assert.ok((centered.ratios.top ?? 0) >= 47 && (centered.ratios.top ?? 0) <= 53);

const shifted = assertAvailable('shifted card', createSyntheticCardImage({
  left: 30,
  top: 45,
  width: 420,
  height: 650,
}));
assert.notEqual(shifted.label, 'Well centred');
assert.ok((shifted.ratios.right ?? 0) > 70, 'shifted card should show a heavier right margin');
assert.ok((shifted.ratios.bottom ?? 0) > 60, 'shifted card should show a heavier bottom margin');

const missing = assessCardCenteringFromJpeg(null);
assert.equal(missing.available, false);
assert.equal(missing.label, 'Unable to assess');

console.log('Card centering assessment tests passed.');
