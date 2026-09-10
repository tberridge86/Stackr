import assert from 'node:assert/strict';
import { boundedCardTilt, relativeCardTilt, isFoilPreview } from '../lib/cardPreviewMotion';

assert.equal(boundedCardTilt(Infinity), 0);
assert.equal(boundedCardTilt(NaN), 0);
assert.equal(boundedCardTilt(20), 1);
assert.equal(boundedCardTilt(-20), -1);
assert.equal(relativeCardTilt(1, 1), 0, 'opening position is neutral');
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
