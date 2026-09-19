import assert from 'node:assert/strict';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';
import { getCatalogueVariantKeys } from '../lib/catalogueVariantPresentation';
import { mergeBinderArtwork } from '../lib/stackrSetRetrieval';
import { nextStackrImageCandidate, stackrImageCandidates } from '../lib/stackrImageCandidates';
import type { StackrCard, StackrCatalogueAsset } from '../lib/stackrApiV1';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function card(codes: string[], languageCode: StackrCard['languageCode'] = 'en'): StackrCard {
  return { cardId: uuid(1), catalogueVersionId: uuid(2), game: 'pokemon', languageCode,
    set: { setId: uuid(3), setCode: 'fixture', nativeName: 'Fixture', englishDisplayName: null },
    collectorNumber: { value: '1', prefix: null, suffix: null, sort: 1, sortKey: '1' },
    names: { native: 'Fixture', englishDisplay: null }, rarity: { code: null, label: null },
    defaultVariantId: uuid(10), updatedAt: null,
    variants: codes.map((variantCode, i) => ({ variantId: uuid(10 + i), canonicalId: `${languageCode}:fixture:${variantCode}`,
      variantCode, variantLabel: variantCode, finishCode: variantCode, finishLabel: variantCode, artworkKey: null,
      imageVariantId: uuid(10 + i), sameArtworkAsVariantId: null, image: null, updatedAt: null })) };
}
function asset(c: StackrCard, index = 0): StackrCatalogueAsset {
  return { assetId: `asset-${index}`, assetType: 'card_image', game: 'pokemon', setId: c.set.setId,
    cardId: c.cardId, variantId: c.variants[index].variantId, permissionStatus: 'approved',
    deliveryUrl: `https://approved.example/${index}/original.jpg`, derivatives: [
      { role: 'card-grid', deliveryUrl: `https://approved.example/${index}/grid.webp` },
      { role: 'detail-page', deliveryUrl: `https://approved.example/${index}/detail.webp` },
    ] } as StackrCatalogueAsset;
}
for (const language of ['en', 'ja', 'zh-cn', 'zh-tw'] as const) {
  const c = card(['normal', 'reverse_holo'], language);
  c.variants[0].image = asset(c);
  const original = structuredClone(c);
  assert.deepEqual(getCatalogueVariantKeys({ raw_data: { stackr: { canonical: true, variants: c.variants } } }), ['normal', 'reverseHolofoil']);
  assert.equal(resolveCardArtwork(c).kind, 'exact');
  assert.equal(resolveCardArtwork(c, [], c.variants[1].variantId).kind, 'shared');
  assert.equal(resolveCardArtwork(c, [], 'nonexistent-holo').kind, 'missing');
  assert.deepEqual(c, original, 'presentation cannot edit IDs, finishes or source records');
}
const holo = card(['holo']);
holo.variants[0].image = asset(holo);
assert.deepEqual(getCatalogueVariantKeys({ raw_data: { stackr: { canonical: true, variants: holo.variants } } }), ['holofoil']);
assert.equal(resolveCardArtwork(holo).kind, 'exact');
const triple = card(['normal', 'reverse_holo', 'holo']);
triple.variants[0].image = asset(triple);
assert.deepEqual(triple.variants.map(v => resolveCardArtwork(triple, [], v.variantId).kind), ['exact', 'shared', 'shared']);
assert.equal(new Set(triple.variants.map(v => resolveCardArtwork(triple, [], v.variantId).assetId)).size, 1);
triple.variants[1].image = asset(triple, 1);
assert.equal(resolveCardArtwork(triple, [], triple.variants[1].variantId).sourceVariantId, triple.variants[1].variantId, 'exact reverse stays preferred');
triple.variants[1].image.derivatives = [];
assert.equal(resolveCardArtwork(triple, [], triple.variants[1].variantId).small, triple.variants[1].image.deliveryUrl, 'exact approved original beats another finish thumbnail');

for (const special of ['first_edition', 'pikachu_stamp', 'poke_ball', 'master_ball', 'alternate_art']) {
  const c = card(['normal', special]); c.variants[0].image = asset(c);
  c.variants[1].sameArtworkAsVariantId = c.variants[0].variantId;
  assert.equal(resolveCardArtwork(c, [], c.variants[1].variantId).kind, 'missing', `${special} cannot borrow ordinary face even with an unsafe old alias`);
  assert.equal(getCatalogueVariantKeys({ raw_data: { stackr: { canonical: true, variants: c.variants } } })?.length, 2);
}
const distinct = card(['normal', 'holo']); distinct.variants[0].image = asset(distinct);
distinct.variants[0].artworkKey = 'illustration-a'; distinct.variants[1].artworkKey = 'illustration-b';
assert.equal(resolveCardArtwork(distinct, [], distinct.variants[1].variantId).kind, 'missing');
const patterned = card(['normal']); patterned.variants[0].finishCode = 'special_pattern';
assert.equal(resolveCardArtwork(patterned, [{ ...asset(patterned), variantId: null }]).kind, 'missing', 'printing-scoped images cannot bypass a special finish');
for (const change of [{ cardId: uuid(99) }, { setId: uuid(99) }, { permissionStatus: 'private' }, { unavailableReason: 'withdrawn' }]) {
  const c = card(['normal']); assert.equal(resolveCardArtwork(c, [{ ...asset(c), ...change }]).kind, 'missing');
}
const missing = card(['normal', 'reverse_holo']);
assert.equal(resolveCardArtwork(missing).kind, 'missing');
assert.equal(missing.variants.length, 2, 'no image cannot remove collection eligibility');
const published = structuredClone(missing); published.variants[0].image = asset(published);
const artwork = resolveCardArtwork(published);
const row = { id: 'saved', card_id: missing.cardId, set_id: missing.set.setId, language: 'en', owned: true, owned_quantity: 4,
  notes: 'keep note', ebay_price: 27, card: { id: missing.cardId, set: { id: missing.set.setId }, images: {},
    raw_data: { stackr: { cardId: missing.cardId, catalogueVersionId: missing.catalogueVersionId, defaultVariantId: missing.defaultVariantId, variants: missing.variants } } } };
const incoming = { ...row, owned_quantity: 1, notes: 'wrong', ebay_price: 0,
  card: { ...row.card, images: { small: artwork.small, large: artwork.large }, raw_data: { ...row.card.raw_data, presentation: { artwork } } } };
const [recovered] = mergeBinderArtwork([row], [incoming]);
assert.equal(recovered.owned_quantity, 4); assert.equal(recovered.notes, 'keep note'); assert.equal(recovered.ebay_price, 27);
assert.equal((recovered.card.images as { small?: string }).small, artwork.small); assert.equal(recovered.card.raw_data.stackr.defaultVariantId, missing.defaultVariantId);
const candidates = stackrImageCandidates(artwork.candidates.map(c => ({ uri: c.uri })));
const failures: string[] = [];
while (nextStackrImageCandidate(candidates, failures)) failures.push(nextStackrImageCandidate(candidates, failures)!.key);
assert.equal(new Set(failures).size, failures.length, 'failed URLs cannot loop');
assert.equal(failures.length, 3, 'thumbnail, detail and approved original are tried once');
assert.equal(nextStackrImageCandidate(stackrImageCandidates([{ uri: 'https://approved.example/corrected.webp' }]), failures)?.uri,
  'https://approved.example/corrected.webp', 'new artwork recovers from an exhausted old candidate list');
console.log('Master Set artwork: four languages, eligible finishes, exact priority, shared face, protected variants, originals, recovery and unchanged private state pass.');
