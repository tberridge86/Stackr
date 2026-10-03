import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';

const card: any = {
  game: 'pokemon',
  cardId: 'printing-a',
  defaultVariantId: 'variant-a',
  set: { setId: 'set-a' },
  variants: [
    { variantId: 'variant-a', variantCode: 'normal', finishCode: 'normal', artworkKey: 'face-a' },
    { variantId: 'variant-b', variantCode: 'normal', finishCode: 'normal', artworkKey: 'face-b' },
  ],
};
const wrongPrintingAsset: any = {
  assetId: 'wrong-printing', assetType: 'card_image', permissionStatus: 'approved',
  game: 'pokemon', setId: 'set-a', cardId: 'printing-b', variantId: 'variant-b',
  deliveryUrl: 'https://images.example/wrong.jpg',
};
assert.equal(resolveCardArtwork(card, [wrongPrintingAsset]).kind, 'missing',
  'another printing must never hide a missing exact card image');

const exactAsset: any = {
  assetId: 'exact', assetType: 'card_image', permissionStatus: 'approved',
  game: 'pokemon', setId: 'set-a', cardId: 'printing-a', variantId: 'variant-a',
  deliveryUrl: 'https://images.example/original.jpg',
  derivatives: [
    { role: 'card-grid', deliveryUrl: 'https://images.example/grid.webp' },
    { role: 'detail-page', deliveryUrl: 'https://images.example/detail.webp' },
  ],
};
const art = resolveCardArtwork(card, [exactAsset]);
assert.equal(art.kind, 'exact');
assert.equal(art.small, 'https://images.example/grid.webp');
assert.equal(art.large, 'https://images.example/detail.webp');
assert.deepEqual(art.candidates.map((candidate) => candidate.uri), [
  'https://images.example/grid.webp',
  'https://images.example/detail.webp',
  'https://images.example/original.jpg',
], 'thumbnail/detail/original remain tied to one exact asset');

const activityMigration = fs.readFileSync('supabase/migrations/20261003101500_issue304_activity_artwork_snapshots.sql','utf8');
assert.match(activityMigration,/card_image_small_snapshot/);
assert.match(activityMigration,/m\.user_id=a\.user_id and m\.card_id=a\.card_id/);
assert.doesNotMatch(activityMigration,/ilike|similarity|card_name\s*=/i,
  'historical thumbnail repair must not fuzzy-match another printing');

const coroMigration = fs.readFileSync('supabase/migrations/20261003102000_issue304_corocoro_artwork_binding.sql','utf8');
assert.match(coroMigration,/ja:corocoro-shining-mew-2001/);
assert.match(coroMigration,/ja:corocoro-comic-may-2001-promo/);
assert.match(coroMigration,/magazine_cover_is_not_card_front/);
assert.doesNotMatch(coroMigration,/image_small\s*=\s*['"]/,
  'association evidence must not publish an unlicensed/reference card image');

const binder = fs.readFileSync('components/BinderArtwork.tsx','utf8');
assert.match(binder,/getMagazineSetCoverForSet/);
assert.match(binder,/magazineCoverImage/);
assert.match(binder,/!magazineCover && hasResolvedLogo/,
  'magazine covers must not enter the white logo shelf');

const search = fs.readFileSync('app/(tabs)/search.tsx','utf8');
assert.match(search,/getLocalSetLogoSourceForSet/);
assert.match(search,/imageFallbackUris=\{card\.imageFallbackUris\}/);
const searchResults = fs.readFileSync('components/search/SearchResults.tsx','utf8');
assert.match(searchResults,/height: 116/,'set artwork is meaningfully larger');
assert.match(searchResults,/fallbackUris=\{imageFallbackUris\}/);
assert.match(searchResults,/fullUri=\{fullImageUri\}/);

const home = fs.readFileSync('features/home/HubScreen.tsx','utf8');
assert.match(home,/card_image_small_snapshot/);
assert.match(home,/imageFallbackUrls/);
assert.match(home,/getCardArtworkPresentation/);

console.log('Issue #304 artwork regressions passed: exact-printing renditions, durable removal thumbnails, CoroCoro cover separation and larger high-resolution paths.');
