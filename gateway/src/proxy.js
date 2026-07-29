import { GatewayError } from './errors.js';
import { createServiceHeaders } from './crypto.js';
import { stateCall } from './state.js';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function originFor(route, env) {
  if (route.target === 'backend') return env.BACKEND_ORIGIN;
  if (route.target === 'recognition') return env.RECOGNITION_ORIGIN;
  return null;
}

function targetPath(route, sourcePath) {
  if (route.targetPath) return route.targetPath;
  if (route.rewritePrefix) return sourcePath.replace(route.rewritePrefix[0], route.rewritePrefix[1]);
  return sourcePath;
}

function timeoutFor(route, env) {
  if (route.rate === 'imageFallback') return Number(env.IMAGE_FALLBACK_TIMEOUT_MS ?? 12_000);
  if (route.target === 'recognition') return Number(env.RECOGNITION_TIMEOUT_MS ?? 5_000);
  return Number(env.BACKEND_TIMEOUT_MS ?? 4_000);
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutError = new Error('downstream timeout');
  timeoutError.name = 'TimeoutError';
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkCircuit(env, target) {
  const result = await stateCall(env, `circuit:${target}`, '/circuit/check');
  if (result.body.open) {
    throw new GatewayError(503, 'downstream_circuit_open', 'A Stackr dependency is temporarily unavailable.', {
      retryAfter: result.body.retryAfter,
    });
  }
}

async function recordCircuit(env, target, success) {
  await stateCall(env, `circuit:${target}`, '/circuit/record', {
    success,
    threshold: 5,
    openSeconds: 30,
  });
}

function sanitizedHeaders(request) {
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'content-type', 'if-none-match', 'range', 'x-stackr-upload-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function proxyRequest({ request, route, env, requestId, trace, auth, deviceId, bodyBytes, bodyHash, fetchImpl = fetch }) {
  const rawOrigin = String(originFor(route, env) ?? '').trim();
  if (!rawOrigin) throw new GatewayError(503, 'downstream_not_configured', 'A Stackr dependency is not configured.');
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new GatewayError(503, 'downstream_not_configured', 'A Stackr dependency is not configured.');
  }
  if (origin.protocol !== 'https:' && env.ENVIRONMENT !== 'development') {
    throw new GatewayError(503, 'downstream_not_secure', 'A Stackr dependency is not securely configured.');
  }

  const source = new URL(request.url);
  const destination = new URL(origin);
  destination.pathname = targetPath(route, source.pathname);
  destination.search = source.search;
  const headers = sanitizedHeaders(request);
  headers.set('X-Request-Id', requestId);
  headers.set('X-Stackr-Api-Version', String(env.API_VERSION ?? '1'));
  headers.set('X-Forwarded-Host', source.host);
  headers.set('X-Forwarded-Proto', source.protocol.replace(':', ''));
  if (trace) headers.set('Traceparent', `00-${trace.traceId}-${trace.spanId}-${trace.flags}`);

  if (route.target === 'backend') {
    const originKey = String(env.BACKEND_ORIGIN_KEY ?? '');
    if (!originKey && env.ENVIRONMENT !== 'development') {
      throw new GatewayError(503, 'backend_origin_auth_unconfigured', 'Backend origin authentication is not configured.');
    }
    if (originKey) headers.set('X-Stackr-Origin-Key', originKey);
  }

  if (route.forwardUserJwt && auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
  if (route.injectBackendAdminKey) {
    const adminKey = String(env.BACKEND_ADMIN_KEY ?? '');
    if (!adminKey) throw new GatewayError(503, 'admin_gateway_not_configured', 'Admin routing is not configured.');
    headers.set('X-Stackr-Admin-Key', adminKey);
  }
  if (route.target === 'recognition') {
    const signed = await createServiceHeaders(env, {
      method: request.method,
      path: destination.pathname,
      bodyHash,
      userId: auth?.claims?.sub ?? '',
      deviceId: deviceId ?? '',
    });
    for (const [name, value] of Object.entries(signed)) headers.set(name, value);
  }

  const init = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : bodyBytes,
    redirect: 'manual',
  };
  await checkCircuit(env, route.target);
  const attempts = request.method === 'GET' ? 2 : 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, destination.toString(), init, timeoutFor(route, env));
      if (RETRYABLE_STATUS.has(response.status) && attempt + 1 < attempts) continue;
      await recordCircuit(env, route.target, response.status < 500);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= attempts) break;
    }
  }
  await recordCircuit(env, route.target, false).catch(() => undefined);
  if (lastError?.name === 'AbortError' || lastError?.name === 'TimeoutError' || String(lastError).includes('downstream timeout')) {
    throw new GatewayError(504, 'downstream_timeout', 'A Stackr dependency timed out.');
  }
  throw new GatewayError(502, 'downstream_unavailable', 'A Stackr dependency could not be reached.');
}
