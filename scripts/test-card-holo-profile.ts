import assert from 'node:assert/strict';
import { resolveCardHoloProfile, type CardHoloMaskDescriptor } from '../lib/cardHoloProfile';

const raw = {
  language: 'english', condition: 'Near Mint', rarity: 'Rare Holo', stackr: {
    canonical: true, cardId: 'card-42', defaultVariantId: 'normal', printingId: 'printing-42', templateId: 'template-42',
    variants: [
      { variantId: 'normal', variantCode: 'normal', finishCode: 'normal' },
      { variantId: 'cosmos', variantCode: 'holo', finishCode: 'holo' },
      { variantId: 'cosmos-exact', variantCode: 'cosmos', finishCode: 'cosmos_holo' },
      { variantId: 'reverse', variantCode: 'reverse_holo', finishCode: 'reverse_holo' },
      { variantId: 'diagonal', variantCode: 'line_holo', finishCode: 'line_holo' },
      { variantId: 'textured', variantCode: 'textured', finishCode: 'textured' },
      { variantId: 'radiant', variantCode: 'radiant', finishCode: 'radiant' },
    ],
  },
};
const region = [{ x: 0.14, y: 0.2, width: 0.72, height: 0.5 }];
const templateMask: CardHoloMaskDescriptor = { kind: 'template', cardId: 'card-42', languageCode: 'en', variantId: 'cosmos', regions: region };
const printingMask: CardHoloMaskDescriptor = { kind: 'printing', cardId: 'card-42', languageCode: 'en', variantId: 'cosmos', regions: [{ x: 0.2, y: 0.25, width: 0.6, height: 0.4 }] };
const reverseMask: CardHoloMaskDescriptor = { kind: 'template', cardId: 'card-42', languageCode: 'en', variantId: 'reverse', coverage: 'exclude', regions: region };

assert.equal(resolveCardHoloProfile(raw).profile, 'plain', 'the canonical default is authoritative');
assert.equal(resolveCardHoloProfile(raw, { cardId: 'card-42' }).profile, 'plain', 'the displayed canonical card identity may confirm raw data');
assert.equal(resolveCardHoloProfile(raw, { cardId: 'stale-card' }).confidence, 'invalid_identity', 'raw data attached to a different displayed card is rejected');
assert.equal(resolveCardHoloProfile({ ...raw, language: 99 }).confidence, 'invalid_identity', 'numeric declared language cannot create an identity');
assert.equal(resolveCardHoloProfile(raw, { languageCode: 99 as any }).confidence, 'invalid_identity', 'numeric viewer language cannot retag a card');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos-exact' }).profile, 'cosmos', 'an explicit cosmos finish selects cosmos');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos' }).profile, 'diagonal', 'generic holo uses neutral generic geometry');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'reverse' }).profile, 'reverse', 'an existing selected variant wins');
assert.equal(resolveCardHoloProfile({ ...raw, language: undefined }, { selectedVariantId: 'reverse', languageCode: 'en' }).profile, 'reverse', 'viewer language can complete a legacy payload');
assert.equal(resolveCardHoloProfile(raw, { languageCode: 'ja' }).confidence, 'invalid_identity', 'a conflicting viewer language cannot retag a card');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'deleted-variant' }).confidence, 'invalid_identity', 'a stale selection cannot inherit the default finish');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos' }).material.foilStrength, 0, 'an unverified art window suppresses colour');
const masked = resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos', masks: [templateMask, printingMask] });
assert.equal(masked.mask.provenance, 'printing-specific', 'an exact printing mask overrides an exact template');
assert.equal(masked.mask.kind, 'regions');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'reverse', masks: [reverseMask] }).mask.kind, 'outside-artwork', 'reverse metadata may apply foil outside the art window');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'textured' }).mask.kind, 'full', 'explicit textured material may use restrained generic coverage');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'radiant' }).mask.kind, 'full', 'explicit radiant material may use restrained generic coverage');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'diagonal' }).profile, 'diagonal');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos' }).material.specularStrength, 0.06, 'missing masks keep neutral reflection only');
const malformed: CardHoloMaskDescriptor = { ...printingMask, regions: [{ x: 0.5, y: 0.5, width: 0.7, height: 0.2 }] };
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos', masks: [malformed] }).mask.kind, 'none', 'out-of-bounds geometry is rejected');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos', masks: [malformed, printingMask, templateMask] }).mask.provenance, 'printing-specific', 'an invalid printing record cannot hide a later valid printing record');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos', masks: {} as any }).mask.kind, 'none', 'non-array mask metadata cannot crash inspection');
assert.equal(resolveCardHoloProfile(raw, { selectedVariantId: 'cosmos', masks: [{ languageCode: 99 }] as any }).mask.kind, 'none', 'malformed language metadata is ignored');
assert.equal(resolveCardHoloProfile({ ...raw, rarity: 'Radiant Rare', condition: 'Damaged' }).profile, 'plain', 'condition and rarity are not finish evidence');
assert.equal(resolveCardHoloProfile({ ...raw, stackr: { ...raw.stackr, variants: [{ variantId: 'x', variantCode: 'mystery', finishCode: 'mystery' }], defaultVariantId: 'x' } }).confidence, 'unknown_finish');
assert.equal(resolveCardHoloProfile({ ...raw, stackr: { ...raw.stackr, variants: [{ variantId: 'x', variantCode: 'holo', finishCode: 99 }], defaultVariantId: 'x' } }).confidence, 'invalid_identity', 'non-string finish code cannot inherit a variant finish');
assert.equal(resolveCardHoloProfile({ ...raw, stackr: { ...raw.stackr, variants: [{ variantId: 'x', variantCode: 'prism', finishCode: 'prism' }], defaultVariantId: 'x' } }).confidence, 'unknown_finish', 'prism is not guessed as diagonal');
console.log('Card holo profiles: 7 primary material cases and 27 identity/mask safety assertions passed.');
