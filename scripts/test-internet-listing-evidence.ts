import assert from 'node:assert/strict';
import { mkdtemp, rmdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { EbayListingEvidenceSourceAdapter } from './catalogue-ingestion/ebayListingEvidenceAdapter';
import {
  assessInternetListingEvidence,
  buildListingQueries,
  buildRecognitionMetadataFingerprint,
  evidenceSetCodeMatches,
  selectIndependentListingImages,
} from './catalogue-ingestion/internetEvidence';

async function main() {
const japaneseFingerprint = buildRecognitionMetadataFingerprint({
  variantId: '11111111-1111-4111-8111-111111111111',
  printingId: '22222222-2222-4222-8222-222222222222',
  languageCode: 'ja',
  setCode: 'SV2a',
  collectorNumber: '157/165',
  nativeName: 'リザードンex',
  englishDisplayName: 'Charizard ex',
  aliases: ['Lizardon ex'],
  setNames: ['ポケモンカード151', 'Pokémon Card 151'],
  variantCode: 'special_art_rare',
  finishCode: 'textured',
  rarityCode: 'sar',
  referenceImageSha256: 'a'.repeat(64),
  referenceImagePerceptualHash: '0000000000000000',
});

assert.equal(japaneseFingerprint.languageCode, 'ja');
assert.deepEqual(japaneseFingerprint.names, ['リザードンex', 'Charizard ex', 'Lizardon ex']);
assert.match(japaneseFingerprint.fingerprintSha256, /^[0-9a-f]{64}$/);

const confirmed = assessInternetListingEvidence(japaneseFingerprint, {
  sourceItemId: 'v1|123|0',
  sourceUrl: 'https://www.ebay.example/itm/123',
  title: 'リザードンex 157/165 SV2a SAR 日本版 Pokemon Card',
  imageUrls: ['https://i.ebayimg.example/images/123.jpg'],
  aspects: [{ name: 'Language', value: 'Japanese' }],
  query: 'Charizard ex 157/165 SV2a Japanese Pokemon card',
});
assert.equal(confirmed.identityStatus, 'confirmed');
assert.equal(confirmed.variantStatus, 'confirmed');
assert.equal(confirmed.collectorNumberMatch, true);
assert.equal(confirmed.setCodeMatch, true);
assert.equal(confirmed.nameMatch, true);
assert.equal(confirmed.explicitLanguage, 'ja');
assert.equal(confirmed.eligibleForIndependentBenchmark, true);
assert.equal(confirmed.automaticCatalogueMutationAllowed, false);

const translatedChinese = buildRecognitionMetadataFingerprint({
  variantId: '33333333-3333-4333-8333-333333333333',
  languageCode: 'zh-cn',
  setCode: '151c',
  collectorNumber: '035/151',
  nativeName: '可达鸭',
  englishDisplayName: 'Psyduck',
  aliases: ['Koduck'],
  finishCode: 'master_ball',
  referenceImageSha256: 'b'.repeat(64),
});
const chineseAssessment = assessInternetListingEvidence(translatedChinese, {
  sourceItemId: 'v1|456|0',
  title: '可达鸭 035/151 151c 大师球 简体中文 Pokemon Card',
  imageUrls: ['https://i.ebayimg.example/images/456.jpg'],
});
assert.equal(chineseAssessment.identityStatus, 'confirmed');
assert.equal(chineseAssessment.variantStatus, 'confirmed');
assert.equal(chineseAssessment.explicitLanguage, 'zh-cn');
assert.ok(chineseAssessment.translatedSignals.includes('master_ball'));

const rejected = assessInternetListingEvidence(japaneseFingerprint, {
  sourceItemId: 'v1|999|0',
  title: 'Charizard ex 006/165 SV2a English Pokemon Card',
  imageUrls: ['https://i.ebayimg.example/images/999.jpg'],
});
assert.equal(rejected.identityStatus, 'rejected');
assert.ok(rejected.conflicts.includes('collector_number_conflict'));
assert.ok(rejected.conflicts.includes('language_conflict'));

assert.equal(evidenceSetCodeMatches('Boltund VMAX 035/184 S8 Japanese', 'S8'), true);
assert.equal(evidenceSetCodeMatches('Froslass 035/184 S8b Japanese', 'S8'), false);
const adjacentSetCode = assessInternetListingEvidence(buildRecognitionMetadataFingerprint({
  variantId: '44444444-4444-4444-8444-444444444444',
  languageCode: 'zh-tw',
  setCode: 'S8',
  collectorNumber: '035',
  nativeName: '逐電犬VMAX',
  finishCode: 'holo',
}), {
  sourceItemId: 'v1|set-code-boundary|0',
  title: 'Froslass 035/184 S8b Holo Traditional Chinese',
  imageUrls: ['https://i.ebayimg.example/images/boundary.jpg'],
});
assert.equal(adjacentSetCode.setCodeMatch, false);
assert.notEqual(adjacentSetCode.identityStatus, 'confirmed');

const queries = buildListingQueries(japaneseFingerprint);
assert.ok(queries.some((query) => query.includes('157/165') && query.includes('SV2a')));
assert.ok(queries.length <= 4);

const independentImages = selectIndependentListingImages(japaneseFingerprint, [
  {
    sourceItemId: 'stock-copy',
    imageUrl: 'https://example.invalid/stock.jpg',
    contentSha256: 'a'.repeat(64),
    perceptualHash: 'ffffffffffffffff',
  },
  {
    sourceItemId: 'near-copy',
    imageUrl: 'https://example.invalid/near.jpg',
    contentSha256: 'c'.repeat(64),
    perceptualHash: '0000000000000001',
  },
  {
    sourceItemId: 'real-camera',
    imageUrl: 'https://example.invalid/camera.jpg',
    contentSha256: 'd'.repeat(64),
    perceptualHash: 'ffffffffffffffff',
  },
  {
    sourceItemId: 'duplicate-camera',
    imageUrl: 'https://example.invalid/duplicate.jpg',
    contentSha256: 'd'.repeat(64),
    perceptualHash: 'ffffffffffffffff',
  },
]);
assert.equal(independentImages.accepted.length, 1);
assert.equal(independentImages.accepted[0].sourceItemId, 'real-camera');
assert.deepEqual(
  independentImages.excluded.map((image) => image.exclusionReason).sort(),
  ['duplicate_listing_image_bytes', 'near_duplicate_of_reference_image', 'same_bytes_as_reference_image'],
);

const tempDirectory = await mkdtemp(path.join(tmpdir(), 'stackr-internet-evidence-'));
const manifestPath = path.join(tempDirectory, 'fingerprints.json');
await writeFile(manifestPath, JSON.stringify({ fingerprints: [japaneseFingerprint] }), 'utf8');

const fetchCalls: string[] = [];
const fetchImpl: typeof fetch = async (input) => {
  const url = String(input);
  fetchCalls.push(url);
  if (url.includes('/identity/v1/oauth2/token')) {
    return new Response(JSON.stringify({ access_token: 'bounded-test-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({
    itemSummaries: [{
      itemId: 'v1|123|0',
      title: 'リザードンex 157/165 SV2a SAR Japanese Pokemon Card',
      itemWebUrl: 'https://www.ebay.example/itm/123',
      image: { imageUrl: 'https://i.ebayimg.example/images/123.jpg' },
      additionalImages: [{ imageUrl: 'https://i.ebayimg.example/images/123-2.jpg' }],
      localizedAspects: [{ name: 'Language', value: 'Japanese' }],
      condition: 'Ungraded',
      itemCreationDate: '2026-08-20T00:00:00Z',
      seller: { username: 'must-not-be-retained' },
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const adapter = new EbayListingEvidenceSourceAdapter({
  manifestPath,
  clientId: 'test-client',
  clientSecret: 'test-secret',
  queriesPerVariant: 2,
  listingsPerQuery: 10,
  fetchImpl,
});
assert.equal((await adapter.healthCheck()).status, 'ok');
const records = [];
for await (const record of adapter.fetchCards({ limit: 1 })) records.push(record);
assert.equal(records.length, 1, 'duplicate eBay item must be retained once per fingerprint');
assert.equal(records[0].recordType, 'other');
assert.equal(records[0].payload.automaticCatalogueMutationAllowed, false);
assert.equal(JSON.stringify(records[0].payload).includes('must-not-be-retained'), false);
assert.equal(adapter.validateRecord(records[0]).ok, true);
const normalised = adapter.normaliseRecord(records[0]);
assert.equal(normalised.evidenceOnly, true);
assert.equal(normalised.sourceConfidence, 0.9);
assert.equal(fetchCalls.filter((url) => url.includes('/identity/v1/oauth2/token')).length, 1);
assert.equal(fetchCalls.filter((url) => url.includes('/item_summary/search')).length, 2);

await rm(manifestPath);
await rmdir(tempDirectory);

console.log('Internet listing recognition evidence tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
