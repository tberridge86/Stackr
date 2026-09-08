import assert from 'node:assert/strict';
import {
  getEditionAwareImageUrl,
  getPublicScrydexCardImageUrl,
} from '../lib/editionImages';

const storedStackrUri = 'https://cdn.stackr.example/cards/base-2/4.webp';
const manufacturedUnlimitedUri = getPublicScrydexCardImageUrl('base2-4', 'unlimited', 'large');

assert.equal(
  getEditionAwareImageUrl({
    suppliedUri: storedStackrUri,
    scrydexUnlimitedUri: manufacturedUnlimitedUri,
  }),
  storedStackrUri,
  'a supplied historic Stackr image must win over a manufactured Unlimited fallback URL'
);

assert.equal(
  getEditionAwareImageUrl({
    rawVariantUri: 'https://catalogue.stackr.example/first-edition/4.webp',
    remoteVariantUri: 'https://api.stackr.example/edition/4.webp',
    suppliedUri: storedStackrUri,
    scrydexUnlimitedUri: manufacturedUnlimitedUri,
  }),
  'https://catalogue.stackr.example/first-edition/4.webp',
  'a verified raw printing variant remains the strongest edition-specific evidence'
);

assert.equal(
  getEditionAwareImageUrl({
    remoteVariantUri: 'https://api.stackr.example/edition/4.webp',
    suppliedUri: storedStackrUri,
    scrydexUnlimitedUri: manufacturedUnlimitedUri,
  }),
  'https://api.stackr.example/edition/4.webp',
  'a fetched edition-specific image remains ahead of the generic stored image'
);

assert.equal(
  getEditionAwareImageUrl({ scrydexUnlimitedUri: manufacturedUnlimitedUri }),
  manufacturedUnlimitedUri,
  'the Unlimited fallback remains available when no supplied or verified image exists'
);

assert.equal(getEditionAwareImageUrl({}), null, 'missing image inputs remain empty');

console.log('Edition-aware image selection checks passed.');
