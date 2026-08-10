import { GatewayError } from './errors.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function requestIdFor(request) {
  const supplied = String(request.headers.get('x-request-id') ?? '').trim();
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

export function validateOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (!allowedOrigins(env).has(origin)) {
    throw new GatewayError(403, 'cors_origin_denied', 'This origin is not allowed to call Stackr API.');
  }
  return origin;
}

function appendVary(headers, value) {
  const current = headers.get('Vary');
  const values = new Set(String(current ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  values.add(value);
  headers.set('Vary', [...values].join(', '));
}

export function secureResponse(response, { requestId, apiVersion, origin, rate, trace }) {
  const secured = new Response(response.body, response);
  const headers = secured.headers;
  headers.set('X-Request-Id', requestId);
  headers.set('X-Stackr-Api-Version', apiVersion);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (trace) {
    headers.set('Traceparent', `00-${trace.traceId}-${trace.spanId}-${trace.flags}`);
    headers.set('X-Trace-Id', trace.traceId);
  }
  headers.delete('Server');
  headers.delete('X-Powered-By');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'ETag, RateLimit-Remaining, Traceparent, X-Request-Id, X-Stackr-Api-Version, X-Stackr-Cache, X-Trace-Id');
    appendVary(headers, 'Origin');
  }
  if (rate) {
    headers.set('RateLimit-Remaining', String(Math.max(0, rate.remaining ?? 0)));
  }
  return secured;
}

export function preflightResponse(route, origin, requestId, apiVersion) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': [...route.methods, 'OPTIONS'].join(', '),
    'Access-Control-Allow-Headers': [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'If-None-Match',
      'Traceparent',
      'X-Request-Id',
      'X-Stackr-Api-Version',
      'X-Stackr-Device-Id',
      'X-Stackr-Upload-Id',
    ].join(', '),
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Stackr-Api-Version': apiVersion,
  });
  appendVary(headers, 'Origin');
  appendVary(headers, 'Access-Control-Request-Method');
  appendVary(headers, 'Access-Control-Request-Headers');
  return new Response(null, { status: 204, headers });
}
