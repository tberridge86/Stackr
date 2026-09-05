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

function assertGatewayCacheBypass(response, name) {
  if (response.headers.get('x-stackr-cache') !== 'BYPASS') {
    throw new Error(`${name} was not confirmed as a gateway cache bypass.`);
  }
  if (response.headers.get('cache-control') !== 'no-store') {
    throw new Error(`${name} did not disable client caching.`);
  }
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

export async function runProductionPricingSmoke({
  backendUrl,
  gatewayUrl,
  variantId,
  backendOriginKey,
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

  const probes = [
    {
      key: 'health',
      path: '/v1/health',
      inspectData(data) {
        if (data.ok !== true) throw new Error('health payload was not ready');
      },
    },
    {
      key: 'exact_price',
      cachedByGateway: true,
      path: `/v1/cards/${encodeURIComponent(normalizedVariantId)}/price?productType=raw_card&currency=GBP&condition=near_mint`,
      inspectData(data) {
        if (data.variantId !== normalizedVariantId) throw new Error('price payload did not match the requested variant');
      },
    },
    {
      key: 'price_history',
      cachedByGateway: true,
      path: `/v1/cards/${encodeURIComponent(normalizedVariantId)}/price-history?productType=raw_card&currency=GBP&condition=near_mint&limit=1`,
      inspectData(data) {
        if (data.variantId !== normalizedVariantId || !Array.isArray(data.observations)) {
          throw new Error('price-history payload did not match the requested variant');
        }
      },
    },
    {
      key: 'movers',
      cachedByGateway: true,
      path: '/v1/market/movers?productType=raw_card&currency=GBP&limit=1',
      inspectData(data) {
        if (!Array.isArray(data.movers)) throw new Error('movers payload was not an array');
      },
    },
  ];

  for (const target of [
    { label: 'direct_backend', baseUrl: backend, headers: { 'x-stackr-origin-key': normalizedOriginKey } },
    {
      label: 'public_gateway',
      baseUrl: gateway,
      // Gateway market reads are cacheable. A bearer value makes its cache
      // layer fetch fresh data, and public routes neither authenticate nor
      // forward it to the backend. The response assertion below is the proof.
      headers: { authorization: 'Bearer smoke-cache-bypass' },
      requireCacheBypass: true,
    },
  ]) {
    for (const probe of probes) {
      results.push(await probeJson({
        fetchImpl,
        baseUrl: target.baseUrl,
        path: probe.path,
        name: `${target.label}_${probe.key}`,
        headers: target.headers,
        timeoutMs,
        inspect(body, response, requestId) {
          assertV1Envelope(body, requestId, probe.inspectData);
          if (target.requireCacheBypass && probe.cachedByGateway) {
            assertGatewayCacheBypass(response, `${target.label}_${probe.key}`);
          }
        },
      }));
    }
  }

  return {
    ok: true,
    expectedBackendCommit: normalizedCommit,
    expectedBackendDeploymentId: normalizedDeploymentId,
    variantId: normalizedVariantId,
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
