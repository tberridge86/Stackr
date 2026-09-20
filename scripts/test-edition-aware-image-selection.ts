import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: 'unlimited' }), true,
  'an exact Stackr canonical UUID may use the backend database resolver, but never a constructed provider URL');
assert.equal(shouldFetchEditionImage({ cardId: `canonical:${canonicalId}`, editionHint: 'unlimited' }), false,
  'a UUID-shaped string that is not the exact database identity must not start a resolver request');
assert.equal(shouldFetchEditionImage({ cardId: '91be8fc7-b2ed-7169-b41e-0d374e4d466a', editionHint: 'unlimited' }), false,
  'a future-version UUID-shaped identifier must not be treated as a provider address');
assert.equal(shouldFetchEditionImage({ cardId: '91be8fc7-b2ed-4169-b41e-0d374e4d466', editionHint: 'unlimited' }), false,
  'a partial UUID-shaped identifier must not be turned into a provider address');
assert.equal(getPublicScrydexCardImageUrl('91be8fc7-b2ed-7169-b41e-0d374e4d466a', 'unlimited'), null);
assert.equal(getPublicScrydexCardImageUrl('91be8fc7-b2ed-4169-b41e-0d374e4d466', 'unlimited'), null);
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: '1st_edition' }), true,
  'an exact canonical ID may ask the backend for an exact first-edition image');
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: 'shadowless' }), true,
  'an exact canonical ID may ask the backend for an exact shadowless image');
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: 'unlimited', suppliedUri: storedStackrUri }), false,
  'a supplied Unlimited image remains sufficient for canonical cards');
assert.equal(shouldFetchEditionImage({ cardId: canonicalId, editionHint: '1st_edition', rawVariantUri: storedStackrUri }), false,
  'a card-supplied exact printing variant always wins over a resolver read');
assert.equal(shouldFetchEditionImage({ cardId: 'base2-4', editionHint: 'unlimited', suppliedUri: storedStackrUri }), false,
  'each thumbnail with a stored unlimited image must not start another backend lookup');
assert.equal(shouldFetchEditionImage({ cardId: 'base2-4', editionHint: '1st_edition', suppliedUri: storedStackrUri }), true,
  'the shared resolver policy remains available to detail views with a supplied generic rendition');
assert.equal(verifiedRemoteEditionImage({ ok: true, imageUri: manufacturedUnlimitedUri, source: 'scrydex_public_image' }), null,
  'a constructed address returned by the edition endpoint must not replace a working supplied image');
assert.equal(verifiedRemoteEditionImage({ ok: true, imageUri: storedStackrUri, source: 'catalogue' }), storedStackrUri);

const editionImageComponent = readFileSync('components/EditionAwareCardImage.tsx', 'utf8');
assert.match(editionImageComponent, /resolveRemoteEdition = true/, 'detail views retain the optional exact-edition resolver by default');
assert.match(editionImageComponent, /!resolveRemoteEdition \|\| !PRICE_API_URL/, 'a caller may keep a visible supplied grid rendition without a remote resolver read');
const binderScreen = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
assert.match(binderScreen, /sourceSize="small"\s+resolveRemoteEdition=\{false\}/, 'ordinary binder grid cards do not amplify optional edition resolver reads');
assert.match(binderScreen, /sourceSize="large"\s+onReferenceImageChange/, 'binder modal detail retains its exact-edition resolver path');

console.log('Edition-aware image selection checks passed.');
