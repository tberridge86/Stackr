import assert from 'node:assert/strict';
import {
  getEditionAwareImageUrl,
  getPublicScrydexCardImageUrl,
  shouldFetchEditionImage,
  verifiedRemoteEditionImage,
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

const canonicalId = '91be8fc7-b2ed-4169-b41e-0d374e4d466a';
assert.equal(getPublicScrydexCardImageUrl(canonicalId, 'unlimited'), null);
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: 'unlimited' }), false);
assert.equal(shouldFetchEditionImage({ cardId: 'base2-4', editionHint: 'unlimited', suppliedUri: storedStackrUri }), false,
  'each thumbnail with a stored unlimited image must not start another backend lookup');
assert.equal(shouldFetchEditionImage({ cardId: 'base2-4', editionHint: '1st_edition', suppliedUri: storedStackrUri }), true,
  'a supported provider printing may still resolve its specific first-edition artwork');
assert.equal(verifiedRemoteEditionImage({ ok: true, imageUri: manufacturedUnlimitedUri, source: 'scrydex_public_image' }), null,
  'a constructed address returned by the edition endpoint must not replace a working supplied image');
assert.equal(verifiedRemoteEditionImage({ ok: true, imageUri: storedStackrUri, source: 'catalogue' }), storedStackrUri);

console.log('Edition-aware image selection checks passed.');
