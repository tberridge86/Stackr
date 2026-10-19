import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { fetchListingSearchWithMedia } from '../lib/listingSearchMedia';

async function main() {
  process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';
  const previousPngLoader = require.extensions['.png'];
  require.extensions['.png'] = (module) => { module.exports = 'test-image-asset'; };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const presentation = require('../lib/marketplacePresentation') as typeof import('../lib/marketplacePresentation');
  if (previousPngLoader) require.extensions['.png'] = previousPngLoader;
  else delete require.extensions['.png'];
  const { getMarketplaceListingThumbnail, sanitizeMarketplaceListingPresentationFields } = presentation;
  const front = 'https://images.example.test/front.jpg';
  const back = 'https://images.example.test/back.jpg';
  const official = 'https://images.example.test/official.jpg';
  assert.equal(getMarketplaceListingThumbnail({ official_image_url: official, seller_front_image_url: front }), official);
  assert.equal(getMarketplaceListingThumbnail({ official_image_url: '', listing_images: ['', 'file:///private.jpg', front] }), front);
  assert.equal(getMarketplaceListingThumbnail({ listing_images: [back], seller_front_image_url: front }), back, 'Existing valid legacy preference is retained.');
  assert.equal(getMarketplaceListingThumbnail({ seller_front_image_url: front }), front);
  const mediaOnly = { listing_media: [
    { role: 'seller', slot: 'back', url: back },
    { role: 'seller', slot: 'front', url: front },
  ] };
  const before = JSON.stringify(mediaOnly);
  assert.equal(getMarketplaceListingThumbnail(mediaOnly), front, 'New labelled seller media supplies a front thumbnail.');
  assert.equal(JSON.stringify(mediaOnly), before, 'Selecting an image cannot mutate listing media.');
  assert.equal(getMarketplaceListingThumbnail({ listing_media: [
    { role: 'seller', slot: 'back', url: back },
    { role: 'seller', slot: 'packaging_front', url: front },
  ] }), front);
  assert.equal(getMarketplaceListingThumbnail({ seller_back_image_url: back }), back);
  assert.equal(getMarketplaceListingThumbnail({ listing_media: [
    { role: 'unknown', slot: 'front', url: front },
    { role: 'seller', slot: 'front', url: 'https://user:password@example.test/private.jpg' },
    { role: 'seller', slot: 'front', url: 'file:///private.jpg' },
  ] }), null, 'Malformed, credentialed and device-local media stay unavailable.');
  assert.equal(getMarketplaceListingThumbnail({}), null);

  // Execute the actual mounted screen mapper with the real media-selection helper.
  const screen = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
  const tree = ts.createSourceFile('search.tsx', screen, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const mapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'mapListingResult');
  assert.ok(mapper);
  const compiled = ts.transpileModule(mapper.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const mapListing = new Function('getMarketplaceListingThumbnail', 'sanitizeMarketplaceListingPresentationFields', 'sanitizeGate0CommerceCopy', `${compiled};return mapListingResult;`)(
    getMarketplaceListingThumbnail, sanitizeMarketplaceListingPresentationFields, (value: string | null, fallback: string) => value ?? fallback,
  ) as (row: Record<string, unknown>) => { id: string; imageUri: string | null; cardId: string };
  const row = { id: 'listing-a', card_id: 'printing-a', product_name: 'Pikachu', ...mediaOnly };
  const selections: string[] = [];
  const fresh = await fetchListingSearchWithMedia(async (select) => {
    selections.push(select);
    const selected = new Set(select.split(',').map((field) => field.trim()));
    return { data: [Object.fromEntries(Object.entries(row).filter(([key]) => selected.has(key)))], error: null };
  });
  assert.equal(selections.length, 1);
  assert.equal(mapListing(fresh.data[0]).imageUri, front, 'The actual search mapper renders a media-only listing from the selected fields.');
  assert.equal(mapListing(fresh.data[0]).cardId, 'printing-a');

  const legacySelections: string[] = [];
  const legacy = await fetchListingSearchWithMedia(async (select) => {
    legacySelections.push(select);
    return select.includes('listing_media')
      ? { data: null, error: { code: '42703', message: 'column listing_media does not exist' } }
      : { data: [{ ...row, listing_media: undefined, listing_images: [front] }], error: null };
  });
  assert.equal(legacySelections.length, 2, 'Old schema receives exactly one reduced projection retry.');
  assert.equal(mapListing(legacy.data![0]).imageUri, front);
  assert.ok(!legacySelections[1].includes('official_image_url'));

  for (const error of [
    { code: '42501', message: 'permission denied for listing_media' },
    { code: '57014', message: 'listing_media request timed out' },
    { code: '42703', message: 'column asking_price does not exist' },
  ]) {
    let calls = 0;
    const result = await fetchListingSearchWithMedia(async () => { calls++; return { data: null, error }; });
    assert.equal(calls, 1, 'Permission, timeout and unrelated schema failures must remain explicit.');
    assert.equal(result.error, error);
  }
  let cancelledCalls = 0;
  await fetchListingSearchWithMedia(async () => { cancelledCalls++; return { error: { code: 'PGRST204', message: 'Could not find listing_media in the schema cache' } }; }, () => false);
  assert.equal(cancelledCalls, 1, 'A superseded or account-invalidated search cannot issue the compatibility retry.');
  let transportCalls = 0;
  await assert.rejects(fetchListingSearchWithMedia(async () => { transportCalls++; throw new Error('offline'); }), /offline/);
  assert.equal(transportCalls, 1);
  let failedFallbackCalls = 0;
  const fallbackError = { code: '42501', message: 'access denied' };
  const failedFallback = await fetchListingSearchWithMedia(async () => {
    failedFallbackCalls++;
    return { error: failedFallbackCalls === 1 ? { code: 'PGRST204', message: 'listing_media missing from schema cache' } : fallbackError };
  });
  assert.equal(failedFallbackCalls, 2);
  assert.equal(failedFallback.error, fallbackError);
  console.log('Listing search media, legacy schema, actual mapper and cancellation checks passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
