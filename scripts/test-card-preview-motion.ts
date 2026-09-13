import assert from 'node:assert/strict';
import { boundedCardTilt, cardFloatOffset, cardMotionIntensity, relativeCardTilt, isFoilPreview } from '../lib/cardPreviewMotion';

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
const raw = { rarity: 'Rare Holo', stackr: { defaultVariantId: 'normal', variants: [
  { variantId: 'normal', finishCode: 'normal' },
  { variantId: 'reverse', finishCode: 'reverse_holo' },
  { variantId: 'nonfoil', finishCode: 'non_foil' },
] } };
assert.equal(isFoilPreview(raw), false, 'explicit normal finish overrides broad rarity');
assert.equal(isFoilPreview(raw, 'reverse'), true);
assert.equal(isFoilPreview(raw, 'nonfoil'), false);
assert.equal(isFoilPreview({ rarity: 'Rare' }), false);
assert.equal(isFoilPreview({}), false, 'unknown finish must not receive invented foil');
console.log('Card preview respects finish identity and bounds calibrated tilt without angle jumps.');
