import assert from 'node:assert/strict';
import {
  assetState,
  buildJapaneseAliasPlan,
  canUseSamePrintingFinishFallback,
} from './complete-japanese-catalogue-images.mjs';

const readyAsset = {
  rights_status: 'approved',
  permission_status: 'approved',
  publicly_servable: true,
  storage_provider: 'supabase_storage',
  storage_bucket: 'stackr-catalogue-public',
  storage_key: 'pokemon/ja/example/original.webp',
  derivative_list: [
    { role: 'card-grid', storageKey: 'pokemon/ja/example/card-grid.webp' },
    { role: 'search-result', storageKey: 'pokemon/ja/example/search-result.webp' },
    { role: 'detail-page', storageKey: 'pokemon/ja/example/detail-page.webp' },
  ],
};
assert.equal(assetState(readyAsset).ready, true);
assert.equal(assetState({
  ...readyAsset,
  derivative_list: [...readyAsset.derivative_list, readyAsset.derivative_list[0]],
}).ready, false, 'duplicate required derivative roles are not API-ready');

const variants = [
  { id: 'normal-a', printing_id: 'printing-a', variant_code: 'normal', finish_code: 'normal', is_default: true, artwork_key: 'art-a' },
  { id: 'reverse-a', printing_id: 'printing-a', variant_code: 'reverse_holo', finish_code: 'reverse_holo', is_default: false, artwork_key: 'art-a' },
  { id: 'normal-b', printing_id: 'printing-b', variant_code: 'normal', finish_code: 'normal', is_default: true },
  { id: 'holo-b', printing_id: 'printing-b', variant_code: 'holo', finish_code: 'holo', is_default: false },
  { id: 'normal-c', printing_id: 'printing-c', variant_code: 'normal', finish_code: 'normal', is_default: true },
];

const plan = buildJapaneseAliasPlan(
  variants,
  new Set(['normal-a', 'holo-b']),
  new Set(),
);
assert.deepEqual(plan.aliasUpdates.get('normal-a'), ['reverse-a']);
assert.deepEqual(plan.aliasUpdates.get('holo-b'), ['normal-b']);
assert.deepEqual(plan.unresolvedPrintingIds, ['printing-c']);
assert.ok(plan.availableVariantIds.includes('normal-a'));
assert.ok(plan.availableVariantIds.includes('holo-b'));

const printingPlan = buildJapaneseAliasPlan(
  variants,
  new Set(),
  new Set(['printing-c']),
);
assert.ok(printingPlan.availableVariantIds.includes('normal-c'));
assert.equal(printingPlan.unresolvedPrintingIds.includes('printing-c'), false);

const conflictingArtworkPlan = buildJapaneseAliasPlan([
  { id: 'normal-d', printing_id: 'printing-d', variant_code: 'normal', finish_code: 'normal', is_default: true, artwork_key: 'art-one' },
  { id: 'special-d', printing_id: 'printing-d', variant_code: 'special', finish_code: 'normal', is_default: false, artwork_key: 'art-two' },
], new Set(['normal-d']), new Set());
assert.deepEqual(conflictingArtworkPlan.artworkConflictVariantIds, ['special-d']);
assert.equal(conflictingArtworkPlan.aliasUpdates.get('normal-d'), undefined);

const unknownArtworkPlan = buildJapaneseAliasPlan([
  { id: 'normal-e', printing_id: 'printing-e', variant_code: 'normal', finish_code: 'normal', is_default: true },
  { id: 'unclassified-e', printing_id: 'printing-e', variant_code: 'unclassified', finish_code: 'unclassified', is_default: false },
], new Set(['normal-e']), new Set());
assert.deepEqual(unknownArtworkPlan.artworkConflictVariantIds, ['unclassified-e']);
assert.equal(unknownArtworkPlan.aliasUpdates.get('normal-e'), undefined);

assert.equal(canUseSamePrintingFinishFallback(
  { id: 'normal-f', printing_id: 'printing-f', variant_code: 'normal', finish_code: 'normal' },
  { id: 'holo-f', printing_id: 'printing-f', variant_code: 'holo', finish_code: 'holo' },
), true);
assert.equal(canUseSamePrintingFinishFallback(
  { id: 'normal-g', printing_id: 'printing-g', variant_code: 'normal', finish_code: 'normal', artwork_key: 'art-g' },
  { id: 'holo-g', printing_id: 'printing-g', variant_code: 'holo', finish_code: 'holo', artwork_key: 'other-g' },
), false);

console.log('Japanese catalogue completion tests passed.');
