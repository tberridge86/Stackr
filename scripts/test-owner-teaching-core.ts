import assert from 'node:assert/strict';
import { ownerTeachingCollectorMatches, ownerTeachingIdentityFromCard, ownerTeachingVariantLabel, resetOwnerTeachingAfter } from '../lib/ownerTeachingCore';

const card: any = {
  cardId: 'printing-1', languageCode: 'ja', names: { native: 'テスト', englishDisplay: 'Test' },
  set: { setId: 'set-1', setCode: 'SV2a', nativeName: 'ポケモン', englishDisplayName: 'Pokemon' },
  collectorNumber: { value: '157', prefix: null, sort: 157, suffix: null, sortKey: '157' },
};
const variant: any = { variantId: 'variant-1', canonicalId: 'canonical-1', variantCode: 'reverse_holo',
  variantLabel: 'Reverse holo', finishCode: 'reverse_holo', finishLabel: 'Reverse holo' };
const identity = ownerTeachingIdentityFromCard(card, variant, 'catalogue-7');
assert.deepEqual(identity, {
  variantId: 'variant-1', printingId: 'printing-1', canonicalKey: 'canonical-1', name: 'Test', nativeName: 'テスト',
  language: 'ja', setId: 'set-1', setCode: 'SV2a', collectorNumber: '157', variantCode: 'reverse_holo',
  finishCode: 'reverse_holo', catalogueVersion: 'catalogue-7',
});
assert.equal(ownerTeachingVariantLabel(variant), 'Reverse holo · Reverse holo');
assert.deepEqual(resetOwnerTeachingAfter('language'), { setId: null, cardId: null, variantId: null });
assert.deepEqual(resetOwnerTeachingAfter('set'), { cardId: null, variantId: null });
assert.deepEqual(resetOwnerTeachingAfter('card'), { variantId: null });
assert.equal(ownerTeachingCollectorMatches('038/165', '38'), true);
assert.equal(ownerTeachingCollectorMatches('TG12', 'tg12'), true);
assert.equal(ownerTeachingCollectorMatches('38/165', '39'), false);
assert.throws(() => ownerTeachingIdentityFromCard(card, { ...variant, canonicalId: '' }, 'catalogue-7'), /canonical identity/);
console.log('Owner teaching identity and dependent-selection tests passed.');
