import assert from 'node:assert/strict';
import {
  STAGING_GATEWAY_ORIGIN,
  assertCanonicalStagingGateway,
  createStagingGatewayCatalogueService,
  verifyDeployedJapaneseGateway,
} from './verify-japanese-staging-gateway.mjs';
import {
  PUBLIC_CATALOGUE_BUCKET,
  STAGING_SUPABASE_ORIGIN,
} from './verify-japanese-catalogue-api-storage.mjs';

const versionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const setId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const printingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const variantId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function storageUrl(role) {
  return `${STAGING_SUPABASE_ORIGIN}/storage/v1/object/public/${PUBLIC_CATALOGUE_BUCKET}/cards/ja/${role}.webp`;
}

function readyImage() {
  return {
    assetId: 'asset-ja-smoke',
    assetType: 'card_image',
    variantId,
    deliveryPath: 'cards/ja/original.webp',
    deliveryUrl: storageUrl('original'),
    permissionStatus: 'approved',
    unavailableReason: null,
    derivatives: ['card-grid', 'search-result', 'detail-page'].map((role) => ({
      role,
      deliveryPath: `cards/ja/${role}.webp`,
      deliveryUrl: storageUrl(role),
    })),
  };
}

function gatewayEnvelope(data, request, pagination = null, cache = 'BYPASS') {
  const requestId = request.headers['X-Request-Id'];
  return new Response(JSON.stringify({
    data,
    meta: {
      requestId,
      apiVersion: '1',
      ...(pagination ? { pagination } : {}),
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      'x-stackr-api-version': '1',
      'x-stackr-cache': cache,
    },
  });
}

function gatewayFetch(url, request) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, STAGING_GATEWAY_ORIGIN);
  assert.equal(request.headers.Authorization, 'Bearer stackr-japanese-catalogue-cache-bypass');
  if (parsed.pathname === '/v1/catalog/manifest') {
    return gatewayEnvelope({
      currentCatalogueVersion: 'ja-smoke-v1',
      availableLanguageShards: [{
        languageCode: 'ja',
        catalogueVersion: 'ja-smoke-v1',
        catalogueVersionId: versionId,
      }],
    }, request);
  }
  if (parsed.pathname === '/v1/sets') {
    assert.equal(parsed.searchParams.get('language'), 'ja');
    assert.equal(parsed.searchParams.get('game'), 'pokemon');
    return gatewayEnvelope({
      sets: [{ setId, languageCode: 'ja', game: 'pokemon' }],
    }, request, { nextCursor: null });
  }
  if (parsed.pathname === `/v1/sets/${setId}/cards`) {
    assert.equal(parsed.searchParams.get('language'), 'ja');
    return gatewayEnvelope({
      cards: [{
        cardId: printingId,
        catalogueVersionId: versionId,
        languageCode: 'ja',
        set: { setId },
        variants: [{ variantId, image: readyImage() }],
      }],
    }, request, { nextCursor: null });
  }
  throw new Error(`Unexpected gateway path ${parsed.pathname}`);
}

assert.equal(assertCanonicalStagingGateway(STAGING_GATEWAY_ORIGIN), STAGING_GATEWAY_ORIGIN);
for (const unsafe of [
  'https://api.stackrtcg.com',
  'http://stackr-api-gateway-staging.berridge14.workers.dev',
  `${STAGING_GATEWAY_ORIGIN}/v1`,
  `${STAGING_GATEWAY_ORIGIN}?target=production`,
]) {
  assert.throws(() => assertCanonicalStagingGateway(unsafe), /must use exactly/);
}

const service = createStagingGatewayCatalogueService({
  gateway: STAGING_GATEWAY_ORIGIN,
  fetchImpl: gatewayFetch,
  sleep: async () => {},
  retries: 0,
});
await service.manifest();
assert.deepEqual(service.report(), {
  origin: STAGING_GATEWAY_ORIGIN,
  requests: 1,
  cacheBypassResponses: 1,
  cacheBypassPercent: 100,
  requestIdsVerified: 1,
  requestIdPercent: 100,
  apiVersions: ['1'],
});

const report = await verifyDeployedJapaneseGateway({
  gateway: STAGING_GATEWAY_ORIGIN,
  fetchImpl: gatewayFetch,
  storageFetchImpl: async (_url, request) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.Range, 'bytes=0-31');
    return new Response('image-bytes', {
      status: 206,
      headers: { 'content-type': 'image/webp' },
    });
  },
  sleep: async () => {},
  gatewayRetries: 0,
  probeRetries: 0,
  expectedRows: [{
    variant_id: variantId,
    printing_id: printingId,
    set_id: setId,
    catalogue_version_id: versionId,
  }],
});
assert.equal(report.ok, true);
assert.equal(report.verificationMode, 'deployed-staging-gateway');
assert.equal(report.apiAppReadyCoveragePercent, 100);
assert.equal(report.gateway.requests, 3);
assert.equal(report.gateway.cacheBypassPercent, 100);
assert.equal(report.gateway.requestIdPercent, 100);
assert.equal(report.gatewayStorageSample.checked, 4);
assert.equal(report.gatewayStorageSample.passed, 4);
assert.equal(report.gatewayStorageSample.coveragePercent, 100);

const nonBypassingService = createStagingGatewayCatalogueService({
  gateway: STAGING_GATEWAY_ORIGIN,
  fetchImpl: async (url, request) => {
    const response = await gatewayFetch(url, request);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers),
        'x-stackr-cache': 'HIT',
      },
    });
  },
  sleep: async () => {},
  retries: 0,
});
await assert.rejects(() => nonBypassingService.manifest(), /did not bypass/);

console.log('Japanese deployed staging gateway verification tests passed.');
