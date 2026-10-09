import assert from 'node:assert/strict';
import {
  PROVISIONAL_CATALOGUE_PRICE_MODEL,
  provisionalCataloguePriceBaseline,
  provisionalCataloguePriceDisplay,
} from '../lib/cataloguePriceBaseline';

const common = provisionalCataloguePriceBaseline({ variantId: 'printing-1', rarity: 'Common', releaseDate: '2024-01-01' });
assert.deepEqual(common, {
  currency: 'GBP', low: 0.02, central: 0.09, high: 0.23, rarity: 'common', eraMultiplier: 0.85,
  modelVersion: PROVISIONAL_CATALOGUE_PRICE_MODEL,
});

for (const rarity of ['Rare', 'Rare Holo', 'Special Illustration Rare', 'Promo', 'Unknown', 'Special Common', '__proto__']) {
  for (const releaseDate of ['1999-01-09', '2001-10-01', '2024-01-01']) {
    assert.equal(provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity, releaseDate }), null,
      `${rarity} needs card evidence; a category must not invent a cheap value.`);
  }
}
for (const releaseDate of [undefined, '', '1999-01-09', '2009', '2024-02-30', '2024-13-01', '2024junk', '2099']) {
  assert.equal(provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity: 'Common', releaseDate }), null);
}
assert.equal(provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity: 'Uncommon', releaseDate: '2010' })?.central, 0.17);
for (const special of [{ finish: 'reverse_holo' }, { variant: 'stamped' }, { edition: 'first_edition' }, { variant: 'unresolved' }]) {
  assert.equal(provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity: 'Common', releaseDate: '2024', ...special }), null);
}
assert.equal(provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity: 'Common', releaseDate: '2024',
  finish: 'Non Holo', variant: 'normal', edition: 'unlimited' })?.central, 0.09);
assert.equal(provisionalCataloguePriceBaseline({ variantId: '', rarity: 'Rare' }), null);

const display = provisionalCataloguePriceDisplay({ variantId: 'printing-1', rarity: 'Common', releaseDate: '2024', productType: 'raw_card' });
assert.equal(display?.sourceLabel, 'Estimated price (provisional baseline)');
assert.equal(display?.confidence, 'low');
assert.equal(display?.updatedAt, null);
assert.equal(display?.sourceBreakdown[0].evidenceType, 'provisional_category_baseline');
assert.equal(provisionalCataloguePriceDisplay({ variantId: 'printing-1', productType: 'graded_card' }), null);
assert.equal(provisionalCataloguePriceDisplay({ variantId: 'printing-1', productType: 'sealed_product' }), null);

console.log('Catalogue provisional baseline passed: rounded modern bulk estimates; no invented vintage, rare, unknown or special-variant prices.');
