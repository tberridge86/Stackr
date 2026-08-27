import { randomUUID } from 'node:crypto';

const DEFAULT_REQUIRED_CATALOGUE_LANGUAGES = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];

const COMMERCE_DISABLED_ROUTES = [
  {
    name: 'stripe_create_connect_account_disabled',
    method: 'POST',
    path: '/api/stripe/create-connect-account',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_account_status_disabled',
    method: 'GET',
    path: '/api/stripe/account-status?userId=commerce-disabled-smoke',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_create_account_link_disabled',
    method: 'POST',
    path: '/api/stripe/create-account-link',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_create_payment_intent_disabled',
    method: 'POST',
    path: '/api/stripe/create-payment-intent',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_create_trade_cash_payment_intent_disabled',
    method: 'POST',
    path: '/api/stripe/create-trade-cash-payment-intent',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_onboarding_complete_disabled',
    method: 'GET',
    path: '/api/stripe/onboarding-complete',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'stripe_onboarding_refresh_disabled',
    method: 'GET',
    path: '/api/stripe/onboarding-refresh',
    code: 'payments_disabled',
    message: 'Payments are disabled for this release.',
  },
  {
    name: 'shippo_status_disabled',
    method: 'GET',
    path: '/api/shippo/status',
    code: 'shipping_disabled',
    message: 'Shipping is disabled for this release.',
  },
  {
    name: 'shippo_rates_disabled',
    method: 'POST',
    path: '/api/shippo/rates',
    code: 'shipping_disabled',
    message: 'Shipping is disabled for this release.',
  },
  {
    name: 'shippo_labels_disabled',
    method: 'POST',
    path: '/api/shippo/labels',
    code: 'shipping_disabled',
    message: 'Shipping is disabled for this release.',
  },
  {
    name: 'shippo_tracking_disabled',
    method: 'GET',
    path: '/api/shippo/track/smoke/smoke-commerce-disabled',
    code: 'shipping_disabled',
    message: 'Shipping is disabled for this release.',
  },
  {
    name: 'legacy_trade_sent_retired',
    method: 'POST',
    path: '/api/trade/sent',
    status: 410,
    code: 'legacy_trade_mutation_retired',
    message: 'This legacy trade mutation route has been retired.',
  },
  {
    name: 'legacy_trade_received_retired',
    method: 'POST',
    path: '/api/trade/received',
    status: 410,
    code: 'legacy_trade_mutation_retired',
    message: 'This legacy trade mutation route has been retired.',
  },
  ...[
    ['notify_generic_retired', '/api/notify'],
    ['notify_trade_offer_retired', '/api/notify/trade-offer'],
    ['notify_trade_status_retired', '/api/notify/trade-status'],
    ['notify_wishlist_match_retired', '/api/notify/wishlist-match'],
    ['notify_price_alert_retired', '/api/notify/price-alert'],
    ['discord_trade_listing_retired', '/api/discord/new-trade-listing'],
    ['discord_review_retired', '/api/discord/new-review'],
  ].map(([name, path]) => ({
    name,
    method: 'POST',
    path,
    status: 410,
    code: 'unauthenticated_side_effect_retired',
    message: 'This unauthenticated side-effect route has been retired.',
  })),
];

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function check(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs ?? 10_000));
  const requestId = randomUUID();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'x-request-id': requestId, ...(options.headers ?? {}) },
      body: options.body,
      signal: controller.signal,
    });
    const returnedRequestId = response.headers.get('x-request-id');
    let bodyCheck = null;
    if (options.inspectResponse) {
      try {
        bodyCheck = await options.inspectResponse(response.clone(), response);
      } catch (error) {
        bodyCheck = { ok: false, error: error.name };
      }
    } else if (options.inspectJson) {
      try {
        bodyCheck = options.inspectJson(await response.clone().json(), response);
      } catch (error) {
        bodyCheck = { ok: false, error: error.name };
      }
    }
    const corsOrigin = response.headers.get('access-control-allow-origin');
    const corsOk = options.expectCorsOrigin !== undefined
      ? corsOrigin === options.expectCorsOrigin
      : options.expectNoCorsOrigin
        ? corsOrigin === null
        : true;
    const statusOk = options.accept?.includes(response.status) ?? response.ok;
    return {
      name: options.name ?? path,
      path,
      status: response.status,
      ok: statusOk && corsOk && (bodyCheck?.ok ?? true),
      requestIdPropagated: returnedRequestId === requestId,
      requestIdRequired: options.requireRequestId !== false,
      corsOrigin,
      bodyCheck,
    };
  } catch (error) {
    return {
      name: options.name ?? path,
      path,
      status: null,
      ok: false,
      requestIdPropagated: false,
      requestIdRequired: options.requireRequestId !== false,
      error: error.name,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function commerceDisabledResponseCheck(expectedStatus, expectedCode, expectedMessage) {
  return (body, response) => {
    const headerRequestId = response.headers.get('x-request-id');
    const bodyRequestId = typeof body?.requestId === 'string' ? body.requestId : null;
    return {
      ok: response.status === expectedStatus
        && body?.code === expectedCode
        && body?.error === expectedMessage
        && Boolean(headerRequestId)
        && bodyRequestId === headerRequestId,
      expectedStatus,
      receivedStatus: response.status,
      expectedCode,
      receivedCode: body?.code ?? null,
      headerRequestId,
      bodyRequestId,
    };
  };
}

function backendAttestationCheck(expectedCommit, expectedEnvironment, expectedSupabaseProjectRef) {
  return (body, response) => {
    const receivedCommit = String(body?.runtime?.gitCommit ?? '').trim().toLowerCase();
    const normalizedExpectedCommit = String(expectedCommit ?? '').trim().toLowerCase();
    const receivedEnvironment = String(body?.runtime?.railwayEnvironment ?? '').trim();
    const receivedSupabaseProjectRef = String(body?.runtime?.supabaseProjectRef ?? '').trim();
    const commitIsNontrivialHex = /^[0-9a-f]{12,64}$/.test(receivedCommit);
    const expectedIsFullHex = /^[0-9a-f]{40,64}$/.test(normalizedExpectedCommit);
    const commitMatches = commitIsNontrivialHex
      && expectedIsFullHex
      && normalizedExpectedCommit.startsWith(receivedCommit);
    return {
      ok: response.status === 200
        && body?.ok === true
        && commitMatches
        && receivedEnvironment === expectedEnvironment
        && receivedSupabaseProjectRef === expectedSupabaseProjectRef,
      expectedCommit: normalizedExpectedCommit,
      receivedCommit: receivedCommit || null,
      expectedEnvironment,
      receivedEnvironment: receivedEnvironment || null,
      expectedSupabaseProjectRef,
      receivedSupabaseProjectRef: receivedSupabaseProjectRef || null,
    };
  };
}

function manifestPublishedCheck(body) {
  const manifest = body?.data ?? body;
  const shards = Array.isArray(manifest?.availableLanguageShards)
    ? manifest.availableLanguageShards
    : [];
  const missingVersions = shards.filter((shard) => !shard.catalogueVersion || !shard.catalogueVersionId);
  const publishedLanguages = new Set(shards.map((shard) => shard.languageCode));
  const missingLanguages = requiredCatalogueLanguages.filter((language) => !publishedLanguages.has(language));
  return {
    ok: Boolean(manifest?.currentCatalogueVersion)
      && manifest.currentCatalogueVersion !== 'bootstrap'
      && missingVersions.length === 0
      && missingLanguages.length === 0,
    currentCatalogueVersion: manifest?.currentCatalogueVersion ?? null,
    languageShards: shards.length,
    missingVersionedShards: missingVersions.map((shard) => shard.languageCode ?? null),
    missingLanguageShards: missingLanguages,
  };
}

const gatewayUrl = argument('gateway', process.env.STACKR_GATEWAY_URL);
const backendUrl = argument('backend', process.env.STACKR_BACKEND_URL);
const recognitionUrl = argument('recognition', process.env.STACKR_RECOGNITION_URL);
const allowRecognitionNotReady = process.argv.includes('--allow-recognition-not-ready');
const allowMissingRequestId = process.argv.includes('--allow-missing-request-id');
const fullGateway = process.argv.includes('--full-gateway');
const gatewaySafety = process.argv.includes('--gateway-safety');
const requirePublishedCatalogue = process.argv.includes('--require-published-catalogue');
const requireCommerceDisabled = process.argv.includes('--require-commerce-disabled');
const expectedBackendCommit = argument('expected-backend-commit');
const expectedBackendEnvironment = argument('expected-backend-environment');
const expectedBackendSupabaseProjectRef = argument('expected-backend-supabase-project-ref');
const requiredCatalogueLanguages = argument(
  'required-catalogue-languages',
  DEFAULT_REQUIRED_CATALOGUE_LANGUAGES.join(','),
).split(',').map((language) => language.trim()).filter(Boolean);
const allowedOrigin = argument('allowed-origin', process.env.STACKR_ALLOWED_ORIGIN ?? 'https://staging.stackr.app');
const deniedOrigin = argument('denied-origin', 'https://not-stackr.invalid');
const searchQuery = encodeURIComponent(argument('search-query', 'SV2a 157'));
const checks = [];

if (fullGateway && gatewaySafety) {
  console.error('--full-gateway and --gateway-safety are mutually exclusive.');
  process.exit(1);
}

if (gatewaySafety && !gatewayUrl) {
  console.error('--gateway-safety requires a gateway URL via --gateway or STACKR_GATEWAY_URL.');
  process.exit(1);
}

if (requireCommerceDisabled && !backendUrl) {
  console.error('--require-commerce-disabled requires a backend URL via --backend or STACKR_BACKEND_URL.');
  process.exit(1);
}

if (expectedBackendCommit && !backendUrl) {
  console.error('--expected-backend-commit requires a backend URL via --backend or STACKR_BACKEND_URL.');
  process.exit(1);
}

if (expectedBackendCommit && (!expectedBackendEnvironment || !expectedBackendSupabaseProjectRef)) {
  console.error('--expected-backend-commit also requires --expected-backend-environment and --expected-backend-supabase-project-ref.');
  process.exit(1);
}

if (backendUrl) {
  checks.push(await check(backendUrl, '/health', {
    name: 'backend_health',
    inspectJson: expectedBackendCommit
      ? backendAttestationCheck(
          expectedBackendCommit,
          expectedBackendEnvironment,
          expectedBackendSupabaseProjectRef,
        )
      : undefined,
  }));
}
if (backendUrl && requireCommerceDisabled) {
  for (const route of COMMERCE_DISABLED_ROUTES) {
    const isPost = route.method === 'POST';
    const expectedStatus = route.status ?? 503;
    checks.push(await check(backendUrl, route.path, {
      name: route.name,
      method: route.method,
      headers: isPost ? { 'content-type': 'application/json' } : undefined,
      body: isPost ? '{}' : undefined,
      accept: [expectedStatus],
      inspectJson: commerceDisabledResponseCheck(expectedStatus, route.code, route.message),
    }));
  }
}
if (backendUrl && (fullGateway || gatewaySafety)) {
  checks.push(await check(backendUrl, '/v1/health', {
    name: 'direct_origin_v1_health_without_gateway_key',
    accept: [401, 503],
  }));
}
if (recognitionUrl) {
  checks.push(await check(recognitionUrl, '/health'));
  checks.push(await check(recognitionUrl, '/ready', { accept: allowRecognitionNotReady ? [200, 503] : [200] }));
}
if (gatewayUrl) {
  checks.push(await check(gatewayUrl, '/v1/health'));
  checks.push(await check(gatewayUrl, '/v1/ready'));
  if (!gatewaySafety) {
    checks.push(await check(gatewayUrl, '/v1/catalog/manifest', {
      inspectJson: requirePublishedCatalogue ? manifestPublishedCheck : undefined,
    }));
  }
  if (fullGateway) {
    checks.push(await check(gatewayUrl, '/v1/languages'));
    let firstSetId = null;
    checks.push(await check(gatewayUrl, '/v1/sets?limit=1', {
      inspectJson(body) {
        firstSetId = body?.data?.sets?.[0]?.setId ?? null;
        return { ok: Boolean(firstSetId), firstSetId };
      },
    }));
    let firstCardId = null;
    if (firstSetId) {
      checks.push(await check(gatewayUrl, `/v1/sets/${encodeURIComponent(firstSetId)}/cards?limit=1`, {
        inspectJson(body) {
          firstCardId = body?.data?.cards?.[0]?.cardId ?? null;
          return { ok: Boolean(firstCardId), firstCardId };
        },
      }));
    }
    if (firstCardId) {
      checks.push(await check(gatewayUrl, `/v1/cards/${encodeURIComponent(firstCardId)}`));
      checks.push(await check(gatewayUrl, `/v1/cards/${encodeURIComponent(firstCardId)}/variants`, {
        inspectJson(body) {
          const variants = body?.data?.variants;
          return { ok: Array.isArray(variants) && variants.length > 0, variantCount: variants?.length ?? 0 };
        },
      }));
    }
    checks.push(await check(gatewayUrl, `/v1/search?q=${searchQuery}&limit=1`, {
      // Public search is cached by the gateway. Bypass that cache here so a
      // successful release smoke proves the newly deployed origin can answer.
      // The public route does not forward this header to the backend.
      headers: { Authorization: 'Bearer smoke-cache-bypass' },
    }));
    let firstAssetDeliveryUrl = null;
    let firstAssetId = null;
    let assetManifestNextCursor = null;
    checks.push(await check(gatewayUrl, '/v1/assets/manifest?limit=1', {
      inspectJson(body) {
        const assets = body?.data?.assets;
        const firstAsset = assets?.[0] ?? null;
        firstAssetId = firstAsset?.assetId ?? null;
        assetManifestNextCursor = body?.meta?.pagination?.nextCursor ?? null;
        const derivatives = Array.isArray(firstAsset?.derivative_list) ? firstAsset.derivative_list : [];
        firstAssetDeliveryUrl = derivatives.find((item) => item?.role === 'search-result')?.deliveryUrl
          ?? firstAsset?.derivatives?.find((item) => item?.role === 'search-result')?.deliveryUrl
          ?? firstAsset?.delivery_url
          ?? firstAsset?.deliveryUrl
          ?? null;
        return {
          ok: Array.isArray(assets)
            && assets.length > 0
            && (!requirePublishedCatalogue || Boolean(assetManifestNextCursor)),
          assetCount: assets?.length ?? 0,
          nextCursorPresent: Boolean(assetManifestNextCursor),
        };
      },
    }));
    if (assetManifestNextCursor) {
      checks.push(await check(
        gatewayUrl,
        `/v1/assets/manifest?limit=1&cursor=${encodeURIComponent(assetManifestNextCursor)}`,
        {
          name: 'asset_manifest_cursor_page',
          inspectJson(body) {
            const assets = body?.data?.assets;
            const nextAssetId = assets?.[0]?.assetId ?? null;
            return {
              ok: Array.isArray(assets) && assets.length > 0 && nextAssetId !== firstAssetId,
              assetCount: assets?.length ?? 0,
              repeatedAsset: Boolean(nextAssetId && nextAssetId === firstAssetId),
            };
          },
        },
      ));
    }
    if (firstAssetDeliveryUrl) {
      checks.push(await check('', firstAssetDeliveryUrl, {
        name: 'asset_delivery',
        requireRequestId: false,
        async inspectResponse(response) {
          const contentType = response.headers.get('content-type');
          const bytes = (await response.arrayBuffer()).byteLength;
          return {
            ok: Boolean(contentType?.startsWith('image/')) && bytes > 0,
            contentType,
            bytes,
          };
        },
      }));
    }
  }
  if (fullGateway || gatewaySafety) {
    checks.push(await check(gatewayUrl, '/v1/health', {
      name: 'cors_allowed_preflight',
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET',
      },
      accept: [204],
      expectCorsOrigin: allowedOrigin,
    }));
    checks.push(await check(gatewayUrl, '/v1/health', {
      name: 'cors_denied_origin',
      headers: { Origin: deniedOrigin },
      accept: [403],
      expectNoCorsOrigin: true,
    }));
  }
}

if (!checks.length) {
  console.error('No deployment smoke-test URLs were supplied.');
  process.exit(1);
}

const failed = checks.filter((item) => (
  !item.ok
  || (!allowMissingRequestId && item.requestIdRequired !== false && !item.requestIdPropagated)
));
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
