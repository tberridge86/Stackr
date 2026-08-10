import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';

import { hasAdminRole, handleRequest } from '../src/index.js';
import { hmacSha256, serviceSignatureInput, sha256Hex } from '../src/crypto.js';
import { GatewayError } from '../src/errors.js';
import { GatewayState } from '../src/state.js';
import { verifySupabaseRequest } from '../src/auth.js';
import { createGatewayOriginAuth } from '../../backend/lib/gatewayOriginAuth.js';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_ID = 'device:test:00000001';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.alarm = null;
  }

  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); this.alarm = null; }
  async setAlarm(value) { this.alarm = value; }
  async transaction(callback) { return callback(this); }
}

class MemoryDurableNamespace {
  constructor() {
    this.instances = new Map();
  }

  getByName(name) {
    if (!this.instances.has(name)) {
      this.instances.set(name, new GatewayState({ storage: new MemoryStorage() }));
    }
    const instance = this.instances.get(name);
    return { fetch: (request, init) => instance.fetch(new Request(request, init)) };
  }
}

class MemoryCache {
  constructor() {
    this.values = new Map();
  }

  async match(request) {
    const value = this.values.get(new Request(request).url);
    return value?.clone();
  }

  async put(request, response) {
    this.values.set(new Request(request).url, response.clone());
  }
}

function environment(overrides = {}) {
  return {
    API_VERSION: '1',
    ENVIRONMENT: 'staging',
    ALLOWED_ORIGINS: 'https://staging.stackr.app',
    BACKEND_ORIGIN: 'https://backend.stackr.test',
    RECOGNITION_ORIGIN: 'https://recognition.stackr.test',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    RECOGNITION_SERVICE_ID: 'stackr-public-gateway',
    RECOGNITION_SERVICE_SECRET: 'gateway-recognition-test-secret',
    BACKEND_ORIGIN_KEY: 'backend-origin-test-secret',
    BACKEND_ADMIN_KEY: 'backend-admin-test-secret',
    GATEWAY_STATE: new MemoryDurableNamespace(),
    ...overrides,
  };
}

function context() {
  const promises = [];
  return {
    promises,
    waitUntil(promise) { promises.push(promise); },
  };
}

function authenticated(claimOverrides = {}) {
  return {
    token: 'user-access-token',
    claims: {
      sub: USER_ID,
      role: 'authenticated',
      appMetadata: {},
      ...claimOverrides,
    },
  };
}

function request(path, init = {}) {
  return new Request(`https://api.stackrtcg.com${path}`, {
    ...init,
    headers: {
      Origin: 'https://staging.stackr.app',
      'CF-Connecting-IP': '203.0.113.9',
      ...(init.headers ?? {}),
    },
  });
}

test('health is local, CORS is explicit, and unsupported query parameters are rejected', async () => {
  const env = environment();
  const cache = new MemoryCache();
  const response = await handleRequest(request('/v1/health'), env, context(), {
    cache,
    fetchImpl: async () => { throw new Error('health must not call an origin'); },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staging.stackr.app');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const denied = await handleRequest(new Request('https://api.stackrtcg.com/v1/health', {
    headers: { Origin: 'https://evil.example' },
  }), environment(), context(), { cache });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const invalidQuery = await handleRequest(request('/v1/sets?admin=true'), environment(), context(), { cache });
  assert.equal(invalidQuery.status, 400);
  assert.equal((await invalidQuery.json()).error.code, 'unsupported_query_parameter');
});

test('readiness requires the recognition model and index to be ready', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return new Response(null, { status: path === '/ready' ? 503 : 200 });
  };

  const response = await handleRequest(request('/v1/ready'), environment(), context(), {
    cache: new MemoryCache(),
    fetchImpl,
  });

  assert.equal(response.status, 503);
  assert.deepEqual(paths.sort(), ['/health', '/ready']);
});

test('catalogue-only readiness does not depend on the disabled recognition service', async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(new URL(url).pathname);
    return new Response(null, { status: 200 });
  };
  const env = environment({
    RECOGNITION_REQUIRED: 'false',
    RECOGNITION_ORIGIN: undefined,
    RECOGNITION_SERVICE_SECRET: undefined,
  });

  const response = await handleRequest(request('/v1/ready'), env, context(), {
    cache: new MemoryCache(),
    fetchImpl,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(paths, ['/health']);

  const disabled = await handleRequest(request('/v1/recognition/identify', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'recognition:disabled:000001',
    },
    body: JSON.stringify({ modelVersion: 'model-v1', privateImageKey: 'private/card.jpg' }),
  }), env, context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl,
  });
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, 'recognition_not_enabled');
});

test('readiness allows bounded time for downstream dependency checks', async () => {
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname === '/ready') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1_600);
        init.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    }
    return new Response(null, { status: 200 });
  };

  const response = await handleRequest(request('/v1/ready'), environment(), context(), {
    cache: new MemoryCache(),
    fetchImpl,
  });

  assert.equal(response.status, 200);
});

test('public catalogue reads use a versioned cache and preserve ETags', async () => {
  const env = environment();
  const cache = new MemoryCache();
  let fetchCount = 0;
  let originKey = null;
  const fetchImpl = async (_url, init) => {
    fetchCount += 1;
    originKey = init.headers.get('x-stackr-origin-key');
    return new Response(JSON.stringify({ data: { sets: [] }, meta: { requestId: 'origin', apiVersion: '1' } }), {
      headers: { 'Content-Type': 'application/json', ETag: '"sets-v1"', Vary: 'If-None-Match' },
    });
  };

  const first = await handleRequest(request('/v1/sets?language=ja'), env, context(), { cache, fetchImpl });
  const second = await handleRequest(request('/v1/sets?language=ja'), env, context(), { cache, fetchImpl });
  const conditional = await handleRequest(request('/v1/sets?language=ja', {
    headers: { 'If-None-Match': '"sets-v1"' },
  }), env, context(), { cache, fetchImpl });

  assert.equal(first.headers.get('x-stackr-cache'), 'MISS');
  assert.equal(second.headers.get('x-stackr-cache'), 'HIT');
  assert.equal(conditional.status, 304);
  assert.equal(fetchCount, 1);
  assert.equal(originKey, env.BACKEND_ORIGIN_KEY);
  assert.equal(second.headers.get('vary'), 'Origin');
});

test('asset manifests use the versioned API route and preserve cursor pagination', async () => {
  let downstreamUrl = null;
  const response = await handleRequest(
    request('/v1/assets/manifest?limit=1&cursor=asset-cursor'),
    environment(),
    context(),
    {
      cache: new MemoryCache(),
      fetchImpl: async (url) => {
        downstreamUrl = String(url);
        return new Response(JSON.stringify({
          data: { assets: [{ assetId: 'asset-1' }] },
          meta: {
            requestId: 'origin',
            apiVersion: '1',
            pagination: { limit: 1, nextCursor: 'asset-cursor-2' },
          },
        }), { headers: { 'Content-Type': 'application/json' } });
      },
    },
  );

  assert.equal(
    downstreamUrl,
    'https://backend.stackr.test/v1/assets/manifest?limit=1&cursor=asset-cursor',
  );
  assert.deepEqual((await response.json()).meta.pagination, {
    limit: 1,
    nextCursor: 'asset-cursor-2',
  });

  let invalidLimitForwarded = false;
  const invalidLimit = await handleRequest(
    request('/v1/assets/manifest?limit=501'),
    environment(),
    context(),
    {
      cache: new MemoryCache(),
      fetchImpl: async () => {
        invalidLimitForwarded = true;
        return new Response('{}');
      },
    },
  );
  assert.equal(invalidLimit.status, 400);
  assert.equal((await invalidLimit.json()).error.code, 'invalid_limit');
  assert.equal(invalidLimitForwarded, false);
});

test('recognition requires user, device, idempotency, and a signed private hop', async () => {
  const env = environment();
  const cache = new MemoryCache();
  const downstream = [];
  const fetchImpl = async (url, init) => {
    downstream.push({ url: String(url), init });
    return new Response(JSON.stringify({ scanId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', matchStatus: 'no_match' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const payload = {
    modelVersion: 'model-v1',
    embedding: [1, 0, 0, 0],
    captureQuality: { score: 0.9 },
  };
  const init = {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'recognition:test:00000001',
    },
    body: JSON.stringify(payload),
  };
  const dependencies = { cache, fetchImpl, verifyAuth: async () => authenticated() };
  const first = await handleRequest(request('/v1/recognition/identify', init), env, context(), dependencies);
  const replay = await handleRequest(request('/v1/recognition/identify', init), env, context(), dependencies);

  assert.equal(first.status, 200);
  assert.equal((await first.json()).data.matchStatus, 'no_match');
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('x-idempotency-replayed'), 'true');
  assert.equal(downstream.length, 1);
  const headers = downstream[0].init.headers;
  assert.equal(headers.get('authorization'), null);
  assert.equal(headers.get('x-stackr-user-id'), USER_ID);
  assert.equal(headers.get('x-stackr-device-id'), DEVICE_ID);
  const timestamp = headers.get('x-stackr-service-timestamp');
  const nonce = headers.get('x-stackr-service-nonce');
  const bodyHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(payload)));
  const expected = await hmacSha256(env.RECOGNITION_SERVICE_SECRET, serviceSignatureInput({
    serviceId: env.RECOGNITION_SERVICE_ID,
    timestamp,
    nonce,
    method: 'POST',
    path: '/v1/recognition/identify',
    bodyHash,
    userId: USER_ID,
    deviceId: DEVICE_ID,
  }));
  assert.equal(headers.get('x-stackr-service-signature'), expected);
});

test('shadow comparison uses the v1 gateway, forwards the user session, and rejects image fields', async () => {
  const baseRecord = {
    schemaVersion: 'stackr-shadow-mode-pilot-v1.0.0',
    localRecordId: 'shadow-local-0001',
    anonymousScanId: 'shadow-scan-0001',
    rawImageRecorded: false,
    shadowSnapshot: { rawImageRecorded: false },
  };
  let downstream = null;
  const dependencies = {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl: async (url, init) => {
      downstream = { url: String(url), headers: init.headers };
      return new Response(JSON.stringify({ ok: true, itemId: 'shadow-item' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  const response = await handleRequest(request('/v1/recognition/shadow-comparisons', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'shadow:test:000000000001',
    },
    body: JSON.stringify({ record: baseRecord }),
  }), environment(), context(), dependencies);
  assert.equal(response.status, 200);
  assert.equal(downstream.url, 'https://backend.stackr.test/api/recognition-shadow-mode/items');
  assert.equal(downstream.headers.get('authorization'), 'Bearer user-access-token');

  let called = false;
  const rejected = await handleRequest(request('/v1/recognition/shadow-comparisons', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'shadow:test:000000000002',
    },
    body: JSON.stringify({ record: { ...baseRecord, imageUri: 'file:///private.jpg' } }),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl: async () => { called = true; return new Response('{}'); },
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, 'shadow_image_payload_forbidden');
  assert.equal(called, false);
});

test('private image upload rejects a MIME/signature mismatch before the origin', async () => {
  let called = false;
  const response = await handleRequest(request('/v1/assets/scans/upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'image/jpeg',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'upload:test:000000000001',
    },
    body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl: async () => { called = true; return new Response('{}'); },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'mime_signature_mismatch');
  assert.equal(called, false);
});

test('private upload grants reject excessive presigned expiry before the origin', async () => {
  let called = false;
  const response = await handleRequest(request('/v1/assets/scans/presigned-upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'upload-grant:test:000001',
    },
    body: JSON.stringify({ mimeType: 'image/jpeg', byteSize: 1024, expiresInSeconds: 3601 }),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl: async () => { called = true; return new Response('{}'); },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_expiry');
  assert.equal(called, false);
});

test('image fallback has a stricter account/device/IP limit', async () => {
  const env = environment();
  const dependencies = {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated(),
    fetchImpl: async () => new Response(JSON.stringify({ embedding: [1, 0, 0, 0] }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  };
  const responses = [];
  for (let index = 0; index < 6; index += 1) {
    responses.push(await handleRequest(request('/v1/recognition/embed', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-access-token',
        'Content-Type': 'application/json',
        'X-Stackr-Device-Id': DEVICE_ID,
        'Idempotency-Key': `image-fallback:test:${String(index).padStart(4, '0')}`,
      },
      body: JSON.stringify({ modelVersion: 'model-v1', privateImageKey: `private/${index}.jpg` }),
    }), env, context(), dependencies));
  }
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200, 429]);
  assert.equal(responses[5].headers.get('retry-after'), '60');
});

test('admin role uses app_metadata and never user_metadata', () => {
  assert.equal(hasAdminRole({ appMetadata: { role: 'admin' } }), true);
  assert.equal(hasAdminRole({ appMetadata: {}, raw: { user_metadata: { role: 'admin' } } }), false);
});

test('admin ingestion commands reject missing selectors and unknown fields before the origin', async () => {
  let called = false;
  const response = await handleRequest(request('/v1/admin/catalogue-ingestion/run-source', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'admin-command:test:000001',
    },
    body: JSON.stringify({ unexpected: true }),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated({ appMetadata: { role: 'admin' } }),
    fetchImpl: async () => { called = true; return new Response('{}'); },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'unsupported_payload_field');
  assert.equal(called, false);
});

test('admin ingestion commands accept the explicit approved-image switch', async () => {
  let forwarded = null;
  const response = await handleRequest(request('/v1/admin/catalogue-ingestion/run-source', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'admin-command:test:000002',
    },
    body: JSON.stringify({ source: 'tcgdex', language: 'en', allowImageAssets: true }),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated({ appMetadata: { role: 'admin' } }),
    fetchImpl: async (url, init) => {
      forwarded = {
        pathname: new URL(url).pathname,
        body: JSON.parse(new TextDecoder().decode(init.body)),
      };
      return new Response(JSON.stringify({ accepted: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(forwarded.pathname, '/api/admin/catalogue-ingestion/run-source');
  assert.equal(forwarded.body.allowImageAssets, true);
});

test('Supabase JWT verification checks signature, issuer, audience, and authenticated role', async () => {
  const issuer = 'https://project.supabase.co/auth/v1';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  const token = await new SignJWT({ role: 'authenticated', app_metadata: { role: 'admin' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const verified = await verifySupabaseRequest(new Request('https://api.stackrtcg.com/v1/recognition/identify', {
    headers: { Authorization: `Bearer ${token}` },
  }), { SUPABASE_URL: 'https://project.supabase.co' }, {
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  });
  assert.equal(verified.claims.sub, USER_ID);
  assert.equal(verified.claims.appMetadata.role, 'admin');

  await assert.rejects(
    verifySupabaseRequest(new Request('https://api.stackrtcg.com/v1/recognition/identify', {
      headers: { Authorization: `Bearer ${token}tampered` },
    }), { SUPABASE_URL: 'https://project.supabase.co' }, {
      jwks: createLocalJWKSet({ keys: [publicJwk] }),
      fetchImpl: async () => new Response(null, { status: 401 }),
    }),
    (error) => error instanceof GatewayError && error.code === 'invalid_access_token',
  );
});

test('legacy HS256 sessions use the bounded Supabase Auth compatibility check', async () => {
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode('test-signing-secret-that-is-not-used-by-the-gateway'));
  let authRequest = null;
  const verified = await verifySupabaseRequest(new Request('https://api.stackrtcg.com/v1/recognition/identify', {
    headers: { Authorization: `Bearer ${token}` },
  }), {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    AUTH_TIMEOUT_MS: '1000',
  }, {
    fetchImpl: async (url, init) => {
      authRequest = { url, init };
      return new Response(JSON.stringify({ id: USER_ID, app_metadata: {} }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(verified.claims.sub, USER_ID);
  assert.equal(authRequest.url, 'https://project.supabase.co/auth/v1/user');
  assert.equal(authRequest.init.headers.apikey, 'publishable-test-key');
  assert.ok(authRequest.init.signal instanceof AbortSignal);
});

test('partner API database structures are private and hash-only', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260728173530_stackr_api_gateway_controls.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists audit\.partner_api_clients/i);
  assert.match(sql, /create table if not exists audit\.partner_api_keys/i);
  assert.match(sql, /create table if not exists audit\.partner_api_usage_hourly/i);
  assert.match(sql, /create function audit\.gateway_set_updated_at\(\)/i);
  assert.match(sql, /usage_hour_utc = date_trunc\('hour', usage_hour_utc\)/i);
  assert.match(sql, /key_hash text not null unique/i);
  assert.match(sql, /api_access_enabled boolean not null default false/i);
  assert.match(sql, /revoke all on audit\.partner_api_keys from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /raw_api_key|plaintext_key|grant select[^;]+to anon/i);
  assert.doesNotMatch(sql, /audit\.set_updated_at\(\)/i);
});

test('Railway origin gate is reversible and constant-time checked', () => {
  const required = createGatewayOriginAuth({ mode: 'required', originKey: 'origin-secret' });
  const response = {
    statusCode: 200,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  let nextCalls = 0;
  required({ headers: { 'x-request-id': 'origin-test-request' } }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.code, 'gateway_origin_auth_required');
  required({ headers: { 'x-stackr-origin-key': 'origin-secret' } }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);

  const disabled = createGatewayOriginAuth({ mode: 'disabled' });
  disabled({ headers: {} }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
});

test('Railway origin gate fails closed by default in production', () => {
  const middleware = createGatewayOriginAuth({ environment: 'production', originKey: '' });
  const response = {
    statusCode: 200,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  let nextCalls = 0;

  middleware({ headers: { 'x-request-id': 'production-origin-test' } }, response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, 'gateway_origin_auth_unconfigured');
});

test('W3C trace context is continued through the gateway and private origin hop', async () => {
  const incomingTrace = '00-11111111111111111111111111111111-2222222222222222-01';
  let forwardedTrace = null;
  const response = await handleRequest(request('/v1/sets', {
    headers: { Traceparent: incomingTrace },
  }), environment(), context(), {
    cache: new MemoryCache(),
    fetchImpl: async (_url, init) => {
      forwardedTrace = init.headers.get('traceparent');
      return new Response(JSON.stringify({ data: { sets: [] } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(response.headers.get('x-trace-id'), '11111111111111111111111111111111');
  assert.match(response.headers.get('traceparent'), /^00-11111111111111111111111111111111-[a-f0-9]{16}-01$/);
  assert.equal(forwardedTrace, response.headers.get('traceparent'));
  assert.notEqual(forwardedTrace, incomingTrace);
});

test('protected observability dashboard requires admin and injects only the backend admin key', async () => {
  let downstreamHeaders = null;
  const response = await handleRequest(request('/v1/admin/observability/dashboard', {
    headers: {
      Authorization: 'Bearer admin-access-token',
      'X-Stackr-Device-Id': DEVICE_ID,
    },
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated({ appMetadata: { role: 'admin' } }),
    fetchImpl: async (_url, init) => {
      downstreamHeaders = init.headers;
      return new Response(JSON.stringify({ dashboards: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(downstreamHeaders.get('x-stackr-admin-key'), 'backend-admin-test-secret');
  assert.equal(downstreamHeaders.get('authorization'), null);
});

test('quality report route rejects raw scan fields before contacting the backend', async () => {
  let called = false;
  const response = await handleRequest(request('/v1/admin/observability/evaluations', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-access-token',
      'Content-Type': 'application/json',
      'X-Stackr-Device-Id': DEVICE_ID,
      'Idempotency-Key': 'quality-report:test:00001',
    },
    body: JSON.stringify({
      runKey: 'quality:test:0001',
      manifestSha256: 'a'.repeat(64),
      environment: 'test',
      report: {
        schemaVersion: 'stackr-quality-evaluation-v1.0.0',
        datasetKey: 'quality-test',
        claimStatus: 'blocked',
        releaseGates: Array.from({ length: 7 }, () => ({})),
        imagePath: 'private/scan.jpg',
      },
    }),
  }), environment(), context(), {
    cache: new MemoryCache(),
    verifyAuth: async () => authenticated({ appMetadata: { role: 'admin' } }),
    fetchImpl: async () => { called = true; return new Response('{}'); },
  });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});
