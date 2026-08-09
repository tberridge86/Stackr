import { errorResponse, GatewayError } from './errors.js';
import { hasAdminRole, requireAdmin, verifySupabaseRequest } from './auth.js';
import { cachedProxy } from './cache.js';
import { sha256Hex } from './crypto.js';
import { proxyRequest } from './proxy.js';
import { matchRoute, RATE_LIMITS } from './routes.js';
import {
  abortIdempotency,
  activateCatalogueCacheVersion,
  beginIdempotency,
  commitIdempotency,
  enforceRateLimit,
} from './state.js';
import {
  preflightResponse,
  requestIdFor,
  secureResponse,
  validateOrigin,
} from './security.js';
import {
  parseAndValidateJson,
  readBoundedBody,
  validateDeviceId,
  validateIdempotencyKey,
  validateImageBody,
  validatePath,
  validateQuery,
} from './validation.js';
import { createTraceContext } from './trace.js';

const encoder = new TextEncoder();
const DEPENDENCY_HEALTH_TIMEOUT_MS = 5_000;

function envelope(data, requestId, apiVersion, status = 200) {
  return new Response(JSON.stringify({
    data,
    meta: {
      requestId,
      apiVersion,
      generatedAt: new Date().toISOString(),
    },
  }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function dependencyHealth(origin, path, fetchImpl) {
  if (!origin) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEPENDENCY_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(path, origin), {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Stackr-Gateway-Readiness/1' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function gatewayRoute(route, env, requestId, apiVersion, payload, fetchImpl) {
  if (route.id === 'health') {
    return envelope({ status: 'ok', service: 'stackr-api-gateway', apiVersion }, requestId, apiVersion);
  }
  if (route.id === 'ready') {
    const recognitionRequired = env.RECOGNITION_REQUIRED !== 'false';
    const configured = Boolean(
      env.BACKEND_ORIGIN
      && env.BACKEND_ORIGIN_KEY
      && env.SUPABASE_URL
      && env.GATEWAY_STATE
      && (!recognitionRequired || (env.RECOGNITION_ORIGIN && env.RECOGNITION_SERVICE_SECRET)),
    );
    const [backendOk, recognitionOk] = configured
      ? await Promise.all([
          dependencyHealth(env.BACKEND_ORIGIN, '/health', fetchImpl),
          recognitionRequired
            ? dependencyHealth(env.RECOGNITION_ORIGIN, '/ready', fetchImpl)
            : Promise.resolve(true),
        ])
      : [false, false];
    const ready = configured && backendOk && recognitionOk;
    return envelope({
      status: ready ? 'ready' : 'not_ready',
      service: 'stackr-api-gateway',
      apiVersion,
    }, requestId, apiVersion, ready ? 200 : 503);
  }
  if (route.id === 'catalogue_cache_activate') {
    const activation = await activateCatalogueCacheVersion(env, payload.catalogueVersion);
    return envelope({
      catalogueVersion: activation.version,
      cacheNamespaceChanged: Boolean(activation.changed),
    }, requestId, apiVersion);
  }
  throw new GatewayError(404, 'route_not_found', 'Stackr API route was not found.');
}

async function normalizedDownstream(response, requestId, apiVersion, route) {
  const output = new Response(response.body, response);
  output.headers.delete('Set-Cookie');
  output.headers.delete('Server');
  output.headers.delete('X-Powered-By');
  if (response.status < 400) {
    const alreadyVersioned = route.target === 'backend' && !route.targetPath && !route.rewritePrefix;
    if (alreadyVersioned) return output;
    if ((response.headers.get('content-type') ?? '').includes('application/json')) {
      return envelope(await output.json(), requestId, apiVersion, response.status);
    }
    return output;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = await output.clone().json();
      if (body?.error?.code && body?.error?.requestId) return output;
      const message = response.status < 500 && typeof body?.error === 'string'
        ? body.error
        : response.status < 500 && typeof body?.message === 'string'
          ? body.message
          : 'A Stackr dependency rejected the request.';
      return errorResponse(new GatewayError(
        response.status,
        `downstream_${response.status}`,
        message,
      ), requestId, apiVersion);
    } catch {
      // Fall through to a payload-free standard error.
    }
  }
  return errorResponse(new GatewayError(
    response.status >= 500 ? 502 : response.status,
    response.status >= 500 ? 'downstream_error' : `downstream_${response.status}`,
    response.status >= 500 ? 'A Stackr dependency failed.' : 'A Stackr dependency rejected the request.',
  ), requestId, apiVersion);
}

function replayResponse(record) {
  const headers = new Headers(record.headers ?? {});
  headers.set('X-Idempotency-Replayed', 'true');
  return new Response(record.body ?? '', { status: record.status, headers });
}

async function responseRecord(response) {
  const body = await response.clone().text();
  if (body.length > 256 * 1024) throw new Error('Idempotent response exceeds replay storage limit.');
  const headers = {};
  for (const name of ['content-type', 'cache-control', 'etag', 'location']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return { status: response.status, headers, body };
}

function contentTypeFor(route, request) {
  const contentType = String(request.headers.get('content-type') ?? '').toLowerCase();
  if (route.body === 'image') return contentType;
  if (route.body && !contentType.startsWith('application/json')) {
    throw new GatewayError(415, 'unsupported_media_type', 'This route requires application/json.');
  }
  return contentType;
}

function clientIp(request) {
  return String(request.headers.get('cf-connecting-ip') ?? 'unknown').slice(0, 128);
}

async function processRequest(request, env, ctx, deps) {
  const apiVersion = String(env.API_VERSION ?? '1');
  const requestId = requestIdFor(request);
  const trace = deps.trace;
  const url = new URL(request.url);
  let origin = null;
  let rate = null;
  let route = null;
  let auth = null;
  let deviceId = null;
  let idempotency = null;
  try {
    validatePath(url.pathname);
    route = matchRoute(url.pathname);
    if (!route) throw new GatewayError(404, 'route_not_found', 'Stackr API route was not found.');
    validateQuery(route, url);
    origin = validateOrigin(request, env);
    if (request.method === 'OPTIONS') {
      if (!origin) throw new GatewayError(400, 'cors_origin_required', 'CORS preflight requires an allowed Origin.');
      return secureResponse(preflightResponse(route, origin, requestId, apiVersion), { requestId, apiVersion, origin, trace });
    }
    if (!route.methods.includes(request.method)) {
      throw new GatewayError(405, 'method_not_allowed', 'HTTP method is not allowed for this route.', { allowed: route.methods });
    }
    if (route.target === 'recognition' && env.RECOGNITION_REQUIRED === 'false') {
      throw new GatewayError(503, 'recognition_not_enabled', 'Card recognition is not enabled for this API release.');
    }

    const ipHash = await sha256Hex(`ip:${clientIp(request)}`);
    if (route.auth !== 'public') {
      await enforceRateLimit(env, `preauth-${route.rate}`, { ip: ipHash }, {
        limit: Math.max(60, RATE_LIMITS[route.rate].limit * 4),
        windowSeconds: RATE_LIMITS[route.rate].windowSeconds,
      });
    }

    if (route.auth !== 'public') {
      auth = await (deps.verifyAuth ?? verifySupabaseRequest)(request, env, { fetchImpl: deps.fetchImpl });
      if (route.auth === 'admin') requireAdmin(auth.claims);
    }
    deviceId = validateDeviceId(request.headers.get('x-stackr-device-id'), route.auth !== 'public');

    let bodyBytes = new Uint8Array();
    let payload = null;
    if (!['GET', 'HEAD'].includes(request.method)) {
      contentTypeFor(route, request);
      bodyBytes = await readBoundedBody(request, route.maxBodyBytes ?? 64 * 1024);
      if (route.body === 'image') validateImageBody(bodyBytes, request.headers.get('content-type'));
      else if (route.body) payload = parseAndValidateJson(bodyBytes, route.body, url.pathname);
    }
    if (route.id === 'recognition_identify' && payload?.privateImageKey) route = { ...route, rate: 'imageFallback' };

    const rateConfig = RATE_LIMITS[route.rate];
    const dimensions = {
      ip: ipHash,
      device: deviceId ? await sha256Hex(`device:${deviceId}`) : null,
      account: auth?.claims?.sub ? await sha256Hex(`account:${auth.claims.sub}`) : null,
    };
    rate = await enforceRateLimit(env, route.rate, dimensions, rateConfig);

    const bodyHash = await sha256Hex(bodyBytes.length ? bodyBytes : encoder.encode(''));
    if (route.idempotent) {
      const key = validateIdempotencyKey(request.headers.get('idempotency-key'));
      const identity = dimensions.account ?? dimensions.device ?? dimensions.ip;
      const fingerprint = await sha256Hex([
        request.method,
        url.pathname,
        url.searchParams.toString(),
        bodyHash,
        identity,
      ].join('\n'));
      const begun = await beginIdempotency(env, identity, key, fingerprint);
      idempotency = { identity, key, fingerprint };
      if (begun.state === 'replay') {
        return secureResponse(replayResponse(begun.response), { requestId, apiVersion, origin, rate, trace });
      }
    }

    let response;
    if (route.target === 'gateway') {
      response = await gatewayRoute(route, env, requestId, apiVersion, payload, deps.fetchImpl);
    } else {
      const fetchFresh = async () => normalizedDownstream(await proxyRequest({
        request,
        route,
        env,
        requestId,
        trace,
        auth,
        deviceId,
        bodyBytes,
        bodyHash,
        fetchImpl: deps.fetchImpl,
      }), requestId, apiVersion, route);
      if (route.cache !== 'none') {
        response = await cachedProxy({
          request,
          route,
          env,
          ctx,
          cache: deps.cache,
          fetchFresh,
        });
      } else {
        response = await fetchFresh();
        const uncached = new Response(response.body, response);
        uncached.headers.set('Cache-Control', 'no-store');
        response = uncached;
      }
    }

    if (idempotency) {
      if (response.status < 500) {
        await commitIdempotency(env, idempotency.identity, idempotency.key, idempotency.fingerprint, await responseRecord(response));
      } else {
        await abortIdempotency(env, idempotency.identity, idempotency.key, idempotency.fingerprint);
      }
    }
    return secureResponse(response, { requestId, apiVersion, origin, rate, trace });
  } catch (error) {
    if (idempotency) {
      await abortIdempotency(env, idempotency.identity, idempotency.key, idempotency.fingerprint).catch(() => undefined);
    }
    const response = errorResponse(error, requestId, apiVersion);
    if (error?.details?.retryAfter) response.headers.set('Retry-After', String(error.details.retryAfter));
    return secureResponse(response, { requestId, apiVersion, origin, rate, trace });
  }
}

async function recordGatewayEvent(env, event, fetchImpl) {
  if (String(env.STACKR_OBSERVABILITY_EVENTS_ENABLED ?? 'false').toLowerCase() !== 'true') return;
  const origin = String(env.BACKEND_ORIGIN ?? '').trim();
  const originKey = String(env.BACKEND_ORIGIN_KEY ?? '').trim();
  if (!origin || !originKey) return;
  const response = await fetchImpl(new URL('/api/admin/observability/events', origin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stackr-Origin-Key': originKey,
      'X-Request-Id': event.requestId,
      Traceparent: `00-${event.traceId}-${event.spanId}-01`,
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error(`Observability event rejected with status ${response.status}.`);
}

export async function handleRequest(request, env, ctx = {}, dependencies = {}) {
  const startedAt = Date.now();
  const trace = createTraceContext(request.headers.get('traceparent'));
  const deps = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    cache: dependencies.cache ?? caches.default,
    verifyAuth: dependencies.verifyAuth,
    trace,
  };
  const response = await processRequest(request, env, {
    waitUntil: typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : () => {},
  }, deps);
  const route = matchRoute(new URL(request.url).pathname);
  const userId = response.status < 500 ? null : 'redacted';
  console.log(JSON.stringify({
    level: response.status >= 500 ? 'error' : 'info',
    event: 'stackr_gateway_request',
    request_id: response.headers.get('x-request-id'),
    route_id: route?.id ?? 'unmatched',
    method: request.method,
    status: response.status,
    duration_ms: Date.now() - startedAt,
    environment: String(env.ENVIRONMENT ?? 'development'),
    actor: userId,
    trace_id: trace.traceId,
    span_id: trace.spanId,
    cache_status: response.headers.get('x-stackr-cache') ?? 'NONE',
  }));
  const event = {
    requestId: response.headers.get('x-request-id'),
    traceId: trace.traceId,
    spanId: trace.spanId,
    sourceComponent: 'gateway',
    eventType: 'request.completed',
    routeId: route?.id ?? 'unmatched',
    method: request.method,
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
    cacheStatus: response.headers.get('x-stackr-cache') ?? 'NONE',
    observedAt: new Date().toISOString(),
    metricSummary: {},
  };
  if (typeof ctx.waitUntil === 'function') ctx.waitUntil(recordGatewayEvent(env, event, deps.fetchImpl).catch(() => undefined));
  return response;
}

export { GatewayState } from './state.js';
export { hasAdminRole } from './auth.js';

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
