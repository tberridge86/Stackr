import assert from 'node:assert/strict';
import { showcaseVariantId } from '../lib/cardInspection';
import { resolveCardHoloProfile } from '../lib/cardHoloProfile';

const raw = { stackr: { canonical: true, cardId: 'one', language: 'en', defaultVariantId: 'normal', variants: [
  { variantId: 'normal', variantCode: 'normal', finishCode: 'non_holo' },
  { variantId: 'reverse', variantCode: 'reverse_holo', finishCode: 'reverse_holo' },
] } };
assert.equal(showcaseVariantId(raw), 'normal');
assert.equal(showcaseVariantId(raw, { variant: 'reverse_holo' }), 'reverse');
assert.equal(showcaseVariantId(raw, { variant: 'reverse' }), 'reverse');
assert.equal(showcaseVariantId(raw, { finish: 'reverse_holo' }), 'reverse');
for (const selection of [{ variant: 'missing' }, { edition: '1st_edition' }, { variant: 'normal', finish: 'reverse_holo' }]) {
  const selectedVariantId = showcaseVariantId(raw, selection);
  assert.equal(selectedVariantId, '');
  assert.equal(resolveCardHoloProfile(raw, { selectedVariantId }).confidence, 'invalid_identity');
}
assert.equal(showcaseVariantId({ stackr: { ...raw.stackr, variants: [...raw.stackr.variants, { variantId: 'other-reverse', variantCode: 'reverse_holo', finishCode: 'reverse_holo' }] } }, { finish: 'reverse_holo' }), '');
assert.equal(showcaseVariantId({ stackr: { ...raw.stackr, variants: [{ ...raw.stackr.variants[0], editionCode: '1st_edition' }] } }, { edition: '1st_edition' }), 'normal');
console.log('Showcase selections preserve explicit variant/finish/edition and reject unknown or ambiguous identity.');
