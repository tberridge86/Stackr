import { createHash, createHmac, randomUUID } from 'node:crypto';

const DEFAULT_REQUIRED_CATALOGUE_LANGUAGES = ['en', 'ja', 'zh-tw', 'zh-cn'];

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
const signedRecognition = process.argv.includes('--signed-recognition');
const allowRecognitionNotReady = process.argv.includes('--allow-recognition-not-ready');
const allowMissingRequestId = process.argv.includes('--allow-missing-request-id');
const fullGateway = process.argv.includes('--full-gateway');
const requirePublishedCatalogue = process.argv.includes('--require-published-catalogue');
const requiredCatalogueLanguages = argument(
  'required-catalogue-languages',
  DEFAULT_REQUIRED_CATALOGUE_LANGUAGES.join(','),
).split(',').map((language) => language.trim()).filter(Boolean);
const allowedOrigin = argument('allowed-origin', process.env.STACKR_ALLOWED_ORIGIN ?? 'https://staging.stackr.app');
const deniedOrigin = argument('denied-origin', 'https://not-stackr.invalid');
const searchQuery = encodeURIComponent(argument('search-query', 'SV2a 157'));
const checks = [];

if (backendUrl) checks.push(await check(backendUrl, '/health'));
if (backendUrl && fullGateway) {
  checks.push(await check(backendUrl, '/v1/health', {
    name: 'direct_origin_v1_health_without_gateway_key',
    accept: [401, 503],
  }));
}
if (recognitionUrl) {
  checks.push(await check(recognitionUrl, '/health'));
  checks.push(await check(recognitionUrl, '/ready', { accept: allowRecognitionNotReady ? [200, 503] : [200] }));
  if (signedRecognition) {
    const serviceSecret = process.env.RECOGNITION_SERVICE_SECRET;
    if (!serviceSecret) {
      checks.push({
        name: 'recognition_signed_vector_lookup',
        path: '/v1/recognition/identify',
        status: null,
        ok: false,
        requestIdPropagated: false,
        requestIdRequired: false,
        error: 'recognition_service_secret_missing',
      });
    } else {
      const path = '/v1/recognition/identify';
      const body = JSON.stringify({
        modelVersion: 'dinov2_vits14',
        embedding: [1, ...Array(383).fill(0)],
        ocrText: '151c 035/151',
        possibleCollectorNumber: '035/151',
        possibleSetCode: '151c',
        detectedLanguage: 'zh-Hans',
        detectedScript: 'chinese_simplified',
        captureQuality: {
          score: 0.95,
          focusScore: 0.95,
          glareScore: 0.95,
          exposureScore: 0.95,
          framingScore: 0.95,
          stabilityScore: 0.95,
          cardCoverage: 0.95,
          failureReasons: [],
        },
        client: { platform: 'android', appVersion: 'staging-smoke' },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomUUID();
      const userId = randomUUID();
      const deviceId = 'stackr-staging-smoke';
      const serviceId = 'stackr-public-gateway';
      const bodyHash = createHash('sha256').update(body).digest('hex');
      const canonical = [
        serviceId,
        timestamp,
        nonce,
        'POST',
        path,
        bodyHash,
        userId,
        deviceId,
      ].join('\n');
      const signature = createHmac('sha256', serviceSecret).update(canonical).digest('base64url');
      checks.push(await check(recognitionUrl, path, {
        name: 'recognition_signed_vector_lookup',
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'x-stackr-service-id': serviceId,
          'x-stackr-service-timestamp': timestamp,
          'x-stackr-service-nonce': nonce,
          'x-stackr-service-signature': signature,
          'x-stackr-body-sha256': bodyHash,
          'x-stackr-user-id': userId,
          'x-stackr-device-id': deviceId,
        },
        inspectJson(payload) {
          const candidates = Array.isArray(payload?.topCandidates) ? payload.topCandidates : [];
          const vectorCandidates = candidates.filter((candidate) => (
            Array.isArray(candidate?.reasons)
            && candidate.reasons.includes('vector_candidate')
            && candidate.reasons.some((reason) => String(reason).startsWith('index:'))
          ));
          return {
            ok: vectorCandidates.length > 0 && payload?.autoAddAllowed === false,
            errorCode: payload?.error?.code ?? null,
            exceptionType: payload?.error?.details?.exceptionType ?? null,
            matchStatus: payload?.matchStatus ?? null,
            candidateCount: candidates.length,
            vectorCandidateCount: vectorCandidates.length,
            indexVersion: payload?.indexVersion ?? null,
            autoAddAllowed: payload?.autoAddAllowed ?? null,
          };
        },
      }));
    }
  }
}
if (gatewayUrl) {
  checks.push(await check(gatewayUrl, '/v1/health'));
  checks.push(await check(gatewayUrl, '/v1/ready'));
  checks.push(await check(gatewayUrl, '/v1/catalog/manifest', {
    inspectJson: requirePublishedCatalogue ? manifestPublishedCheck : undefined,
  }));
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
