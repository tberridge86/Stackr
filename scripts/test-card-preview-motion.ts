import assert from 'node:assert/strict';
import { boundedCardTilt, calibratedCardSensor, cardDragTilt, cardInspectionMotionEnabled, cardFloatOffset, cardMotionIntensity, relativeCardTilt, isFoilPreview } from '../lib/cardPreviewMotion';

assert.equal(boundedCardTilt(Infinity), 0);
assert.equal(boundedCardTilt(NaN), 0);
assert.equal(boundedCardTilt(20), 1);
assert.equal(boundedCardTilt(-20), -1);
assert.equal(cardFloatOffset(Infinity, 7), 0, 'invalid movement cannot move the preview');
assert.equal(cardFloatOffset(2, 7), 7, 'lift stays bounded by the visual frame');
assert.equal(cardFloatOffset(-2, 7), -7, 'lift supports both card directions');
assert.equal(cardFloatOffset(0.5, -7), 0, 'an invalid maximum cannot create a reverse float');
assert.equal(cardMotionIntensity(0, 0), 0, 'resting cards have no shine or lift');
assert.equal(cardMotionIntensity(1, 1), 1, 'maximum tilt reaches the bounded visual treatment');
assert.ok(cardMotionIntensity(0.5, 0.5) > 0 && cardMotionIntensity(0.5, 0.5) < 1,
  'partial rotation gives proportional holo treatment');
assert.equal(relativeCardTilt(1, 1), 0, 'opening position is neutral');
assert.equal(relativeCardTilt(0.48, 0), 1, 'the preview reaches its bounded visual range without excessive sensor travel');
assert.ok(Math.abs(relativeCardTilt(-Math.PI + 0.01, Math.PI - 0.01)) < 0.05,
  'crossing the sensor angle boundary must not flip the card');
const raw = { language: 'en', rarity: 'Rare Holo', stackr: { canonical: true, cardId: 'test-printing', defaultVariantId: 'normal', variants: [
  { variantId: 'normal', variantCode: 'normal', finishCode: 'normal' },
  { variantId: 'reverse', variantCode: 'reverse_holo', finishCode: 'reverse_holo' },
  { variantId: 'nonfoil', variantCode: 'non_foil', finishCode: 'non_foil' },
] } };
assert.equal(isFoilPreview(raw), false, 'explicit normal finish overrides broad rarity');
assert.equal(isFoilPreview(raw, 'reverse'), true);
assert.equal(isFoilPreview(raw, 'nonfoil'), false);
assert.equal(isFoilPreview({ rarity: 'Rare' }), false);
assert.equal(isFoilPreview({}), false, 'unknown finish must not receive invented foil');
assert.equal(isFoilPreview({ rarity: 'Rare Holo' }), false, 'rarity alone cannot invent a selected physical finish');
assert.equal(isFoilPreview(raw, 'missing'), false, 'a missing explicit variant never inherits a broad finish');
const reading = { pitch: 1, roll: 0.5, interfaceOrientation: 0 };
assert.deepEqual(calibratedCardSensor(reading, null), { origin: reading, x: 0, y: 0 });
assert.deepEqual(calibratedCardSensor({ ...reading, interfaceOrientation: 90 }, reading), {
  origin: { ...reading, interfaceOrientation: 90 }, x: 0, y: 0,
}, 'interface rotations recenter instead of jolting the card');
assert.equal(calibratedCardSensor({ ...reading, pitch: NaN }, reading), null);
assert.deepEqual(cardDragTilt(140, -180), { x: 1, y: 1 });
assert.deepEqual(cardDragTilt(-999, 999), { x: -1, y: -1 });
assert.deepEqual(cardDragTilt(NaN, Infinity), { x: 0, y: 0 });
assert.equal(cardInspectionMotionEnabled(true, true, false), true);
assert.equal(cardInspectionMotionEnabled(false, true, false), false, 'closed viewer has no sensor/GPU work');
assert.equal(cardInspectionMotionEnabled(true, false, false), false, 'backgrounded viewer has no sensor/GPU work');
assert.equal(cardInspectionMotionEnabled(true, true, true), false, 'Reduce Motion removes perspective, sensors and material');
console.log('Card preview motion: 31 cases passed, 0 failed.');
