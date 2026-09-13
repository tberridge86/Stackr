import assert from 'node:assert/strict';
import { getCanonicalMasterSetSlotCount, getCanonicalMasterSetVariants } from '../lib/masterSetProgress';

const canonicalCard = {
  raw_data: {
    stackr: {
      canonical: true,
      variants: [
        { variantId: 'normal', variantCode: 'normal' },
        { variantId: 'holo', variantCode: 'holo' },
        { variantId: 'reverse', variantCode: 'reverse_holo' },
      ],
    },
  },
  tcgplayer: { prices: { normal: {}, holofoil: {}, reverseHolofoil: {}, firstEditionHolofoil: {} } },
};
const providerOnlyCard = {
  raw_data: { tcgplayer: { prices: { normal: {}, holofoil: {}, reverseHolofoil: {}, firstEditionHolofoil: {} } } },
  tcgplayer: { prices: { normal: {}, holofoil: {}, reverseHolofoil: {}, firstEditionHolofoil: {} } },
};

assert.deepEqual(getCanonicalMasterSetVariants(canonicalCard), ['normal', 'holofoil', 'reverseHolofoil']);
assert.equal(getCanonicalMasterSetSlotCount(canonicalCard), 3, 'canonical finish identities expand master-set slots');
assert.equal(getCanonicalMasterSetVariants(providerOnlyCard), null, 'provider price keys do not create master-set finishes');
assert.equal(getCanonicalMasterSetSlotCount(providerOnlyCard), 1, 'a printing without canonical finishes remains one verified slot');
assert.equal(getCanonicalMasterSetSlotCount({ raw_data: { stackr: { canonical: true, variants: [] } } }), 1);
assert.equal(
  Array.from({ length: 237 }, () => providerOnlyCard).reduce((total, card) => total + getCanonicalMasterSetSlotCount(card), 0),
  237,
  'a 237-printing set cannot become a 1,350-slot master set from price-key fan-out',
);

console.log('Master-set totals expand only with canonical finish identities.');
