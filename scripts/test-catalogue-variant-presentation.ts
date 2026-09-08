import assert from 'node:assert/strict';
import { getCatalogueVariantKeys, catalogueVariantLabel } from '../lib/catalogueVariantPresentation';

const codes = ['normal', 'holo', 'reverse_holo', 'poke_ball', 'master_ball', 'pikachu_stamp', 'reverse_pikachu_stamp'];
const variants = codes.map((variantCode, i) => ({ variantId: `variant-${i}`, variantCode }));
const card = { raw_data: { stackr: { canonical: true, variants } }, tcgplayer: { prices: { normal: {} } } };
assert.deepEqual(getCatalogueVariantKeys(card), ['normal', 'holofoil', 'reverseHolofoil', 'reverseHoloPokeball', 'masterBallPatternHolofoil', 'pikachu_stamp', 'reverse_pikachu_stamp']);
assert.equal(getCatalogueVariantKeys(card)?.length, variants.length, 'stamp derivatives must not collapse into a generic finish');
assert.deepEqual(card.raw_data.stackr.variants, variants, 'presentation must not rewrite canonical identities');
assert.equal(getCatalogueVariantKeys({ raw_data: {} }), null, 'legacy rows retain their existing compatibility path');
assert.deepEqual(getCatalogueVariantKeys({ raw_data: { stackr: { canonical: true, variants: [] } } }), [], 'missing catalogue finishes are not fabricated');
assert.equal(catalogueVariantLabel('reverse_pikachu_stamp'), 'Reverse Pikachu Stamp');
assert.equal(catalogueVariantLabel('master_ball'), 'Master Ball');
assert.equal(catalogueVariantLabel('未翻訳'), 'Finish translation pending');
console.log('Catalogue finishes preserve every canonical derivative and existing collection keys.');
