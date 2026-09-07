import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function normalizeBaseUrl(value, label, allowHttp) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment.`);
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error(`${label} must use HTTPS.`);
  }
  return url;
}

function requestIdFrom(response, body) {
  return String(response.headers.get('x-request-id') ?? body?.meta?.requestId ?? '').trim();
}

function assertV1Envelope(body, expectedRequestId, inspectData) {
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    throw new Error('response did not contain a Stackr API data envelope');
  }
  if (body.meta?.apiVersion !== '1') throw new Error('response did not identify Stackr API v1');
  if (String(body.meta?.requestId ?? '').trim() !== expectedRequestId) {
    throw new Error('response request ID did not match its envelope');
  }
  inspectData(body.data);
}

async function probeJson({
  fetchImpl,
  baseUrl,
  path,
  name,
  headers,
  timeoutMs,
  inspect,
}) {
  const startedAt = Date.now();
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  const requestId = requestIdFrom(response, body);
  if (response.status !== 200) throw new Error(`${name} returned HTTP ${response.status}.`);
  if (!requestId) throw new Error(`${name} did not return a request ID.`);
  inspect(body, response, requestId);
  return {
    name,
    status: response.status,
    requestId,
    durationMs: Date.now() - startedAt,
  };
}

function assertPrivatePricingFailure(body, response, expectedRequestId, name) {
  const status = response.status;
  const code = String(body?.error?.code ?? '').trim();
  if (status === 503) {
    if (code === 'pricing_owner_unconfigured' || code === 'pricing_access_mode_invalid' || code === 'pricing_access_unconfigured') {
      throw new Error(`${name} found a pricing configuration failure (${code}).`);
    }
    throw new Error(`${name} returned HTTP 503 instead of an owner-authentication denial.`);
  }
  if (status !== 401 || code !== 'authentication_required') {
    throw new Error(`${name} returned HTTP ${status} (${code || 'missing error code'}) instead of authentication_required.`);
  }
  if (String(body?.meta?.apiVersion ?? '') !== '1' || String(body?.meta?.requestId ?? '') !== expectedRequestId) {
    throw new Error(`${name} did not return a valid Stackr API v1 error envelope.`);
  }
  if (response.headers.get('cache-control') !== 'private, no-store') {
    throw new Error(`${name} did not keep the denied pricing response private.`);
  }
  if (!/authorization/i.test(response.headers.get('vary') ?? '')) {
    throw new Error(`${name} did not vary its denied pricing response by Authorization.`);
  }
}

async function probeAnonymousPricingDenial({ fetchImpl, baseUrl, path, name, headers, timeoutMs }) {
  const startedAt = Date.now();
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: 'GET',
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  const requestId = requestIdFrom(response, body);
  if (!requestId) throw new Error(`${name} did not return a request ID.`);
  assertPrivatePricingFailure(body, response, requestId, name);
  return { name, status: response.status, requestId, durationMs: Date.now() - startedAt };
}

export async function runProductionPricingSmoke({
  backendUrl,
  gatewayUrl,
  variantId,
  backendOriginKey,
  ownerAccessToken,
  expectedBackendCommit,
  expectedBackendDeploymentId,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  allowHttp = false,
} = {}) {
  const backend = normalizeBaseUrl(backendUrl, 'backend URL', allowHttp);
  const gateway = normalizeBaseUrl(gatewayUrl, 'gateway URL', allowHttp);
  const normalizedVariantId = String(variantId ?? '').trim();
  const normalizedOriginKey = String(backendOriginKey ?? '').trim();
  const normalizedOwnerAccessToken = String(ownerAccessToken ?? '').trim();
  const normalizedCommit = String(expectedBackendCommit ?? '').trim().toLowerCase();
  const normalizedDeploymentId = String(expectedBackendDeploymentId ?? '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedVariantId)) throw new Error('variant ID must be a canonical UUID.');
  if (!normalizedOriginKey) throw new Error('backend origin key is required.');
  if (!SHA_PATTERN.test(normalizedCommit)) throw new Error('expected backend commit must be a full 40-character Git SHA.');
  if (!UUID_PATTERN.test(normalizedDeploymentId)) {
    throw new Error('expected backend deployment ID must be a canonical UUID.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error('timeout must be an integer between 1000 and 60000 milliseconds.');
  }

  const results = [];
  results.push(await probeJson({
    fetchImpl,
    baseUrl: backend,
    path: '/health',
    name: 'direct_backend_runtime_health',
    timeoutMs,
    inspect(body) {
      const receivedCommit = String(body?.runtime?.gitCommit ?? '').trim().toLowerCase();
      if (body?.ok !== true || body?.runtime?.railwayEnvironment !== 'production') {
        throw new Error('direct backend health did not attest the production runtime');
      }
      if (body?.runtime?.gitCommitSource !== 'bundled_workflow_sha') {
        throw new Error('direct backend health did not attest bundled workflow provenance');
      }
      if (!/^[0-9a-f]{12}$/.test(receivedCommit) || normalizedCommit.slice(0, 12) !== receivedCommit) {
        throw new Error('direct backend health did not attest the expected Git SHA');
      }
      if (String(body?.runtime?.deploymentId ?? '').trim().toLowerCase() !== normalizedDeploymentId) {
        throw new Error('direct backend health did not attest the expected Railway deployment');
      }
    },
  }));

  const pricingProbes = [
    {
      key: 'exact_price',
      path: `/v1/cards/${encodeURIComponent(normalizedVariantId)}/price?productType=raw_card&currency=GBP&condition=near_mint`,
      inspectData(data) {
        if (data.variantId !== normalizedVariantId) throw new Error('price payload did not match the requested variant');
      },
    },
    {
      key: 'price_history',
      path: `/v1/cards/${encodeURIComponent(normalizedVariantId)}/price-history?productType=raw_card&currency=GBP&condition=near_mint&limit=1`,
      inspectData(data) {
        if (data.variantId !== normalizedVariantId || !Array.isArray(data.observations)) {
          throw new Error('price-history payload did not match the requested variant');
        }
      },
    },
    {
      key: 'movers',
      path: '/v1/market/movers?productType=raw_card&currency=GBP&limit=1',
      inspectData(data) {
        if (!Array.isArray(data.movers)) throw new Error('movers payload was not an array');
      },
    },
  ];

  for (const target of [
    { label: 'direct_backend', baseUrl: backend, headers: { 'x-stackr-origin-key': normalizedOriginKey } },
    { label: 'gateway', baseUrl: gateway, headers: {} },
  ]) {
    results.push(await probeJson({
      fetchImpl,
      baseUrl: target.baseUrl,
      path: '/v1/health',
      name: `${target.label}_health`,
      headers: target.headers,
      timeoutMs,
      inspect(body, response, requestId) {
        assertV1Envelope(body, requestId, (data) => {
          if (data.status !== 'ok' || data.apiVersion !== '1') throw new Error('health payload was not ready');
        });
      },
    }));
    for (const probe of pricingProbes) {
      results.push(await probeAnonymousPricingDenial({
        fetchImpl,
        baseUrl: target.baseUrl,
        path: probe.path,
        name: `${target.label}_anonymous_${probe.key}`,
        headers: target.headers,
        timeoutMs,
      }));
    }
  }

  if (normalizedOwnerAccessToken) {
    for (const target of [
      { label: 'direct_backend', baseUrl: backend, headers: { 'x-stackr-origin-key': normalizedOriginKey } },
      { label: 'gateway', baseUrl: gateway, headers: {} },
    ]) {
      for (const probe of pricingProbes) {
        results.push(await probeJson({
          fetchImpl,
          baseUrl: target.baseUrl,
          path: probe.path,
          name: `${target.label}_owner_${probe.key}`,
          headers: { ...target.headers, authorization: `Bearer ${normalizedOwnerAccessToken}` },
          timeoutMs,
          inspect(body, response, requestId) {
            assertV1Envelope(body, requestId, probe.inspectData);
            if (response.headers.get('cache-control') !== 'private, no-store') {
              throw new Error(`${target.label}_owner_${probe.key} did not keep owner pricing private.`);
            }
            if (!/authorization/i.test(response.headers.get('vary') ?? '')) {
              throw new Error(`${target.label}_owner_${probe.key} did not vary owner pricing by Authorization.`);
            }
          },
        }));
      }
    }
  }

  return {
    ok: true,
    expectedBackendCommit: normalizedCommit,
    expectedBackendDeploymentId: normalizedDeploymentId,
    variantId: normalizedVariantId,
    ownerPricingValidated: Boolean(normalizedOwnerAccessToken),
    checks: results,
  };
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const originKeyEnvironmentName = argument('backend-origin-key-env', 'BACKEND_ORIGIN_KEY');
  const timeoutMs = Number(argument('timeout-ms', '15000'));
  try {
    const result = await runProductionPricingSmoke({
      backendUrl: argument('backend', process.env.STACKR_BACKEND_URL),
      gatewayUrl: argument('gateway', process.env.STACKR_GATEWAY_URL),
      variantId: argument('variant-id', process.env.STACKR_PRICING_SMOKE_VARIANT_ID),
      backendOriginKey: process.env[originKeyEnvironmentName],
      ownerAccessToken: argument('owner-access-token', process.env.STACKR_PRICING_OWNER_ACCESS_TOKEN),
      expectedBackendCommit: argument('expected-backend-commit', process.env.STACKR_EXPECTED_MAIN_SHA),
      expectedBackendDeploymentId: argument(
        'expected-backend-deployment',
        process.env.STACKR_BACKEND_DEPLOYMENT_ID,
      ),
      timeoutMs,
      allowHttp: process.argv.includes('--allow-http'),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Production pricing smoke failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  }
}
