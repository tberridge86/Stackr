import assert from 'node:assert/strict';
import type { StackrApiClient, StackrCard, StackrCatalogueAsset } from '../lib/stackrApiV1';
import { mergePreferredSetArtwork, readPreferredSetArtwork, PREFERRED_ARTWORK_PAGE_SIZE } from '../lib/stackrPreferredSetArtwork';

const card = {
  cardId: 'printing', catalogueVersionId: 'version', languageCode: 'ja', game: 'pokemon',
  set: { setId: 'set', setCode: 'S12a', nativeName: 'VSTARユニバース', englishDisplayName: null },
  collectorNumber: { value: '1' }, names: { native: 'リザードン', englishDisplay: null },
  defaultVariantId: 'normal', variants: [
    { variantId: 'normal', canonicalId: 'ja:1:normal', imageVariantId: 'normal', image: null },
    { variantId: 'holo', canonicalId: 'ja:1:holo', imageVariantId: 'holo', image: null },
  ],
} as StackrCard;
const asset = (id: string) => ({ assetId: id, assetType: 'card_image', variantId: id, deliveryUrl: `https://approved.example/${id}.webp` }) as StackrCatalogueAsset;
const page = (id: string): StackrCard => ({ ...card, defaultVariantId: id,
  variants: card.variants.filter((variant) => variant.variantId === id).map((variant) => ({ ...variant, image: asset(id) })) });

async function main() {
  const first = mergePreferredSetArtwork([card], [page('normal')]);
  const second = mergePreferredSetArtwork(first, [page('holo')]);
  assert.equal(second[0].defaultVariantId, 'normal', 'partial-page defaults cannot change the selected finish');
  assert.deepEqual(second[0].variants.map((v) => v.image?.assetId), ['normal', 'holo']);
  const samePage = mergePreferredSetArtwork([card], [page('normal'), page('holo')]);
  assert.deepEqual(samePage[0].variants.map((v) => v.image?.assetId), ['normal', 'holo'],
    'several rows of the same printing in one page must retain every supplied finish image');
  const wrongLanguageLast = mergePreferredSetArtwork([card], [page('normal'), { ...page('normal'), languageCode: 'en' }]);
  assert.equal(wrongLanguageLast[0].variants[0].image?.assetId, 'normal');
  for (const other of [
    { ...page('normal'), languageCode: 'en' },
    { ...page('normal'), catalogueVersionId: 'changed' },
    { ...page('normal'), set: { ...card.set, setId: 'other' } },
    { ...page('normal'), collectorNumber: { value: '2' } },
  ]) assert.equal(mergePreferredSetArtwork([card], [other as StackrCard])[0], card);
  const wrongVariant = page('normal'); wrongVariant.variants = [{ ...wrongVariant.variants[0], canonicalId: 'wrong' }];
  assert.equal(mergePreferredSetArtwork([card], [wrongVariant])[0].variants[0].image, null);

  let calls = 0;
  const progress: StackrCard[][] = [];
  const controller = new AbortController();
  const client = { setCards: async (_set: string, query: any, init: any) => {
    assert.equal(query.includeAssets, true); assert.equal(query.limit, PREFERRED_ARTWORK_PAGE_SIZE); assert.equal(query.language, 'ja');
    assert(init.signal instanceof AbortSignal);
    calls++;
    assert.equal(query.cursor, calls === 1 ? null : 'next');
    if (calls === 2) assert.equal(progress[0][0].variants[0].image?.assetId, 'normal', 'first page published before second request');
    return { data: { cards: [page(calls === 1 ? 'normal' : 'holo')] }, meta: { pagination: { nextCursor: calls === 1 ? 'next' : null } } };
  } } as unknown as Pick<StackrApiClient, 'setCards'>;
  const complete = await readPreferredSetArtwork([card], client, controller.signal, (rows) => progress.push(rows));
  assert.equal(calls, 2); assert.equal(progress.length, 2);
  assert.deepEqual(complete[0].variants.map((v) => v.image?.assetId), ['normal', 'holo']);

  calls = 0;
  const cancelled = new AbortController();
  await assert.rejects(readPreferredSetArtwork([card], client, cancelled.signal, () => cancelled.abort(new Error('left binder'))), /left binder/);
  assert.equal(calls, 1, 'leaving the binder stops further page requests');
  console.log('Preferred artwork streams pages, retains finish/edition/version identity, and stops on cancellation.');
}
void main();
