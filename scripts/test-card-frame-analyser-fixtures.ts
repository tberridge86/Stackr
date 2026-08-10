import assert from 'node:assert/strict';
import {
  CARD_FRAME_ANALYSER_FAILURE_REASON_ORDER,
  analyzeLuminanceFrame,
} from '../lib/cardVisionFrameAnalyser';
import { createCardFrameAnalyserFixtures } from './card-frame-analyser-fixtures';

const fixtures = createCardFrameAnalyserFixtures();

const hasForbiddenImagePayload = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Uint8Array) return true;
  if (Array.isArray(value)) return value.some(hasForbiddenImagePayload);
  return Object.entries(value).some(([key, entry]) => (
    ['base64', 'image', 'luminance', 'frame', 'pixels'].includes(key) || hasForbiddenImagePayload(entry)
  ));
};

for (const fixture of fixtures) {
  const result = analyzeLuminanceFrame(fixture);

  if (fixture.expected.cardDetected !== undefined) {
    assert.equal(
      result.cardDetected,
      fixture.expected.cardDetected,
      `${fixture.name} cardDetected expected ${fixture.expected.cardDetected}, got ${result.cardDetected}`
    );
  }

  if (fixture.expected.qualityAccepted !== undefined) {
    assert.equal(
      result.qualityAccepted,
      fixture.expected.qualityAccepted,
      `${fixture.name} qualityAccepted expected ${fixture.expected.qualityAccepted}, got ${result.qualityAccepted}; reasons=${result.failureReasons.join(',')}`
    );
  }

  for (const reason of fixture.expected.failureReasonsInclude ?? []) {
    assert.ok(
      result.failureReasons.includes(reason),
      `${fixture.name} expected failure reason ${reason}, got ${result.failureReasons.join(',') || 'none'}`
    );
  }

  const orderedReasons = [...result.failureReasons].sort((left, right) => (
    CARD_FRAME_ANALYSER_FAILURE_REASON_ORDER.indexOf(left) -
    CARD_FRAME_ANALYSER_FAILURE_REASON_ORDER.indexOf(right)
  ));
  assert.deepEqual(result.failureReasons, orderedReasons, `${fixture.name} failure reasons are not deterministic`);
  assert.equal(hasForbiddenImagePayload(result), false, `${fixture.name} returned an image-like payload`);

  if (result.corners) {
    for (const [cornerName, corner] of Object.entries(result.corners)) {
      assert.ok(corner.x >= 0 && corner.x <= 1, `${fixture.name} ${cornerName}.x is not normalized`);
      assert.ok(corner.y >= 0 && corner.y <= 1, `${fixture.name} ${cornerName}.y is not normalized`);
    }
  }

  assert.ok(result.processingMs >= 0, `${fixture.name} processingMs should be non-negative`);
}

console.log(`Card frame analyser fixture tests passed (${fixtures.length} fixtures).`);
