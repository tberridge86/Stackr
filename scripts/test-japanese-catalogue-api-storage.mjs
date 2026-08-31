import assert from 'node:assert/strict';
import {
  PUBLIC_CATALOGUE_BUCKET,
  STAGING_SUPABASE_ORIGIN,
  assertCanonicalStagingConfiguration,
  inspectAppReadyImage,
  inspectStagingStorageUrl,
  mapWithConcurrency,
  probeStorageUrl,
  verifyJapaneseCatalogue,
} from './verify-japanese-catalogue-api-storage.mjs';

const versionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const setId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const printingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const firstVariantId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const secondVariantId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function storageUrl(storageKey) {
  return `${STAGING_SUPABASE_ORIGIN}/storage/v1/object/public/${PUBLIC_CATALOGUE_BUCKET}/${storageKey}`;
}

function imageFor(variantId, suffix = variantId) {
  const originalPath = `cards/${suffix}/original.webp`;
  return {
    assetId: `asset-${suffix}`,
    assetType: 'card_image',
    variantId,
    deliveryPath: originalPath,
    deliveryUrl: storageUrl(originalPath),
    permissionStatus: 'approved',
    unavailableReason: null,
    derivatives: ['card-grid', 'search-result', 'detail-page'].map((role) => {
      const deliveryPath = `cards/${suffix}/${role}.webp`;
      return { role, deliveryPath, deliveryUrl: storageUrl(deliveryPath) };
    }),
  };
}

function fakeService(images = new Map([
  [firstVariantId, imageFor(firstVariantId)],
  [secondVariantId, imageFor(firstVariantId, 'shared-artwork')],
])) {
  return {
    async manifest() {
      return {
        availableLanguageShards: [{
          languageCode: 'ja',
          catalogueVersion: 'ja-test-v1',
          catalogueVersionId: versionId,
        }],
      };
    },
    async sets(input) {
      assert.equal(input.language, 'ja');
      assert.equal(input.game, 'pokemon');
      return {
        sets: [{ setId, languageCode: 'ja', game: 'pokemon' }],
        pagination: { nextCursor: null },
      };
    },
    async setCards(requestedSetId, input) {
      assert.equal(requestedSetId, setId);
      assert.equal(input.language, 'ja');
      return {
        cards: [{
          cardId: printingId,
          catalogueVersionId: versionId,
          languageCode: 'ja',
          set: { setId },
          variants: [firstVariantId, secondVariantId].map((variantId) => ({
            variantId,
            image: images.get(variantId) ?? null,
          })),
        }],
        pagination: { nextCursor: null },
      };
    },
  };
}

function expectedRows() {
  return [firstVariantId, secondVariantId].map((variantId) => ({
    variant_id: variantId,
    printing_id: printingId,
    set_id: setId,
    catalogue_version_id: versionId,
  }));
}

assert.deepEqual(
  assertCanonicalStagingConfiguration({
    target: 'staging',
    supabaseUrl: STAGING_SUPABASE_ORIGIN,
    serviceKey: 'test-service-key',
  }),
  { supabaseUrl: STAGING_SUPABASE_ORIGIN },
);
assert.throws(() => assertCanonicalStagingConfiguration({
  target: 'production',
  supabaseUrl: STAGING_SUPABASE_ORIGIN,
  serviceKey: 'test-service-key',
}), /target=staging/);
assert.throws(() => assertCanonicalStagingConfiguration({
  target: 'staging',
  supabaseUrl: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  serviceKey: 'test-service-key',
}), /canonical staging/);
assert.throws(() => assertCanonicalStagingConfiguration({
  target: 'staging',
  supabaseUrl: `${STAGING_SUPABASE_ORIGIN}/rest/v1`,
  serviceKey: 'test-service-key',
}), /exactly/);
assert.throws(() => assertCanonicalStagingConfiguration({
  target: 'staging',
  supabaseUrl: STAGING_SUPABASE_ORIGIN,
  serviceKey: '',
}), /required/);

const validUrl = storageUrl('cards/ja/001.webp');
assert.deepEqual(inspectStagingStorageUrl(validUrl), {
  ok: true,
  normalizedUrl: validUrl,
  bucket: PUBLIC_CATALOGUE_BUCKET,
  objectKey: 'cards/ja/001.webp',
});
for (const unsafeUrl of [
  'https://example.com/storage/v1/object/public/stackr-catalogue-public/cards/001.webp',
  `${STAGING_SUPABASE_ORIGIN}/storage/v1/object/authenticated/${PUBLIC_CATALOGUE_BUCKET}/cards/001.webp`,
  `${STAGING_SUPABASE_ORIGIN}/storage/v1/object/public/private-bucket/cards/001.webp`,
  `${STAGING_SUPABASE_ORIGIN}/storage/v1/object/public/${PUBLIC_CATALOGUE_BUCKET}/cards/%252e%252e/secret.webp`,
  `${validUrl}?token=secret`,
]) {
  assert.equal(inspectStagingStorageUrl(unsafeUrl).ok, false, unsafeUrl);
}

const readyImage = imageFor(firstVariantId);
assert.deepEqual(inspectAppReadyImage(readyImage), {
  ok: true,
  reasons: [],
  urls: [
    readyImage.deliveryUrl,
    ...readyImage.derivatives.map((derivative) => derivative.deliveryUrl),
  ],
});
const missingDerivative = structuredClone(readyImage);
missingDerivative.derivatives = missingDerivative.derivatives.filter((item) => item.role !== 'detail-page');
assert.equal(inspectAppReadyImage(missingDerivative).ok, false);
assert.ok(inspectAppReadyImage(missingDerivative).reasons.includes('detail-page:missing_derivative'));
const externalOriginal = structuredClone(readyImage);
externalOriginal.deliveryUrl = 'https://images.example/card.webp';
assert.equal(inspectAppReadyImage(externalOriginal).ok, false);

let activeWorkers = 0;
let maximumWorkers = 0;
const concurrencyResults = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
  activeWorkers += 1;
  maximumWorkers = Math.max(maximumWorkers, activeWorkers);
  await new Promise((resolve) => setTimeout(resolve, 1));
  activeWorkers -= 1;
  return value * 2;
});
assert.deepEqual(concurrencyResults, [2, 4, 6, 8, 10]);
assert.equal(maximumWorkers, 2);

let fetchCalls = 0;
const retryProbe = await probeStorageUrl(validUrl, {
  retries: 1,
  timeoutMs: 1_000,
  sleep: async () => {},
  fetchImpl: async () => {
    fetchCalls += 1;
    return fetchCalls === 1
      ? new Response(null, { status: 503 })
      : new Response('image-bytes', {
        status: 206,
        headers: { 'content-type': 'image/webp' },
      });
  },
});
assert.equal(retryProbe.ok, true);
assert.equal(retryProbe.attempts, 2);
assert.equal(retryProbe.bytesRead > 0, true);

const methods = [];
const rangeHeaders = [];
const rangedProbe = await probeStorageUrl(validUrl, {
  retries: 0,
  timeoutMs: 1_000,
  fetchImpl: async (_url, request) => {
    methods.push(request.method);
    rangeHeaders.push(request.headers.Range);
    return new Response('image-bytes', {
      status: 206,
      headers: { 'content-type': 'image/png; charset=binary' },
    });
  },
});
assert.equal(rangedProbe.ok, true);
assert.equal(rangedProbe.method, 'GET');
assert.equal(rangedProbe.contentType, 'image/png; charset=binary');
assert.deepEqual(methods, ['GET']);
assert.deepEqual(rangeHeaders, ['bytes=0-31']);

const emptyImageProbe = await probeStorageUrl(validUrl, {
  retries: 0,
  timeoutMs: 1_000,
  fetchImpl: async () => new Response(null, {
    status: 200,
    headers: { 'content-type': 'image/webp' },
  }),
});
assert.equal(emptyImageProbe.ok, false);
assert.equal(emptyImageProbe.error, 'empty_image_body');

const nonImageProbe = await probeStorageUrl(validUrl, {
  retries: 0,
  timeoutMs: 1_000,
  fetchImpl: async () => new Response('<html>not an image</html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  }),
});
assert.equal(nonImageProbe.ok, false);
assert.equal(nonImageProbe.error, 'non_image_content_type');

const missingProbe = await probeStorageUrl(validUrl, {
  retries: 3,
  timeoutMs: 1_000,
  fetchImpl: async () => new Response(null, { status: 404 }),
});
assert.equal(missingProbe.ok, false);
assert.equal(missingProbe.attempts, 1);

const complete = await verifyJapaneseCatalogue({
  service: fakeService(),
  expectedRows: expectedRows(),
  setConcurrency: 2,
  probeStorage: false,
});
assert.equal(complete.ok, true);
assert.equal(complete.expectedVariantCount, 2);
assert.equal(complete.enumeratedVariantCount, 2);
assert.equal(complete.appReadyVariantCount, 2);
assert.equal(complete.apiAppReadyCoveragePercent, 100);
assert.equal(complete.nativeImageVariantCount, 1);
assert.equal(complete.aliasedImageVariantCount, 1);
assert.equal(complete.uniqueStorageUrlCount, 8);
assert.equal(complete.storageProbe.enabled, false);

const incompleteImages = new Map([
  [firstVariantId, imageFor(firstVariantId)],
  [secondVariantId, missingDerivative],
]);
const incomplete = await verifyJapaneseCatalogue({
  service: fakeService(incompleteImages),
  expectedRows: expectedRows(),
  probeStorage: false,
});
assert.equal(incomplete.ok, false);
assert.equal(incomplete.appReadyVariantCount, 1);
assert.equal(incomplete.apiAppReadyCoveragePercent, 50);
assert.equal(incomplete.blockers.nonAppReadyVariants, 1);

let fullProbeCalls = 0;
const probed = await verifyJapaneseCatalogue({
  service: fakeService(),
  expectedRows: expectedRows(),
  probeStorage: true,
  probeConcurrency: 3,
  probeRetries: 0,
  probeTimeoutMs: 1_000,
  fetchImpl: async () => {
    fullProbeCalls += 1;
    return new Response('image-bytes', {
      status: 206,
      headers: { 'content-type': 'image/webp' },
    });
  },
});
assert.equal(probed.ok, true);
assert.equal(probed.storageProbe.checked, 8);
assert.equal(probed.storageProbe.coveragePercent, 100);
assert.equal(fullProbeCalls, 8);

console.log('Japanese catalogue API/storage verification tests passed.');
