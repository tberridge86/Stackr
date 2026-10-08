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

const legacy = provisionalCataloguePriceBaseline({ variantId: 'printing-2', rarity: 'Special Illustration Rare', releaseDate: '2001-10-01' });
assert.equal(legacy?.central, 27);
assert.equal(provisionalCataloguePriceBaseline({ variantId: '', rarity: 'Rare' }), null);

const display = provisionalCataloguePriceDisplay({ variantId: 'printing-1', rarity: 'Common', productType: 'raw_card' });
assert.equal(display?.sourceLabel, 'Estimated price (provisional baseline)');
assert.equal(display?.confidence, 'low');
assert.equal(display?.updatedAt, null);
assert.equal(display?.sourceBreakdown[0].evidenceType, 'provisional_category_baseline');
assert.equal(provisionalCataloguePriceDisplay({ variantId: 'printing-1', productType: 'graded_card' }), null);
assert.equal(provisionalCataloguePriceDisplay({ variantId: 'printing-1', productType: 'sealed_product' }), null);

console.log('Catalogue provisional baseline passed: deterministic pennies, raw-only, and no sale evidence.');
