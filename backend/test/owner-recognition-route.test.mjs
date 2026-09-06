import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createOwnerRecognitionRouter } from '../routes/ownerRecognition.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MODEL = 'siglip2_vision_256_768';
const INDEX = 'siglip2-vision-256-768-r3f9f96cb-full-48011-v1';
const SERVICE_TOKEN = 'private-service-token-that-must-not-leak';
const IMAGE = Buffer.from('private-test-image-bytes');
const ENV = {
  NODE_ENV: 'production', STACKR_OWNER_RECOGNITION_ENABLED: 'true',
  STACKR_OWNER_RECOGNITION_USER_IDS: OWNER,
  STACKR_OWNER_RECOGNITION_SERVICE_URL: 'https://recognition.example.invalid',
  OWNER_SIGLIP_SERVICE_TOKEN: SERVICE_TOKEN,
};
const valid = () => ({ status: 'review_required', modelVersion: MODEL, indexVersion: INDEX,
  requiresReview: true, autoAccept: false, autoAdd: false,
  candidates: [{ rank: 1, variantId: 'v1', canonicalKey: 'en:sv1:001', name: 'Example', similarity: 0.8 }],
});
const upstream = (value, status = 200) => new Response(JSON.stringify(value), { status });

async function setup(t, { env = ENV, fetchImpl = async () => upstream(valid()), timeoutMs = 50 } = {}) {
  const app = express();
  let authCalls = 0;
  app.use('/api/owner-recognition', createOwnerRecognitionRouter({ env, fetchImpl, timeoutMs,
    getSupabase: () => ({ auth: { getUser: async (token) => {
      authCalls++;
      return token === 'owner-access' ? { data: { user: { id: OWNER } }, error: null }
        : token === 'other-access' ? { data: { user: { id: OTHER, app_metadata: { stackr_admin: true } } }, error: null }
          : { data: { user: null }, error: { message: 'expired' } };
    } } }),
  }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/owner-recognition`;
  async function request(path = '/identify', { token = 'owner-access', type = 'image/jpeg', body = IMAGE, method = 'POST' } = {}) {
    const response = await fetch(`${base}${path}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': type },
      ...(method === 'POST' ? { body } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { request, authCalls: () => authCalls };
}

test('authentication precedes raw image parsing, including oversized unauthenticated payloads', async (t) => {
  let serviceCalls = 0;
  const app = await setup(t, { fetchImpl: async () => { serviceCalls++; return upstream(valid()); } });
  const missing = await app.request('/identify', { token: null, body: Buffer.alloc(5 * 1024 * 1024 + 1) });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'authentication_required');
  assert.equal(app.authCalls(), 0);
  assert.equal(serviceCalls, 0);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal((await app.request('/identify', { token: 'other-access' })).status, 403);
  assert.equal((await app.request('/identify', { token: 'expired-access' })).status, 401);
  assert.equal(serviceCalls, 0);
});

test('invalid content types, empty bodies and oversized owner images are rejected', async (t) => {
  let serviceCalls = 0;
  const app = await setup(t, { fetchImpl: async () => { serviceCalls++; return upstream(valid()); } });
  assert.equal((await app.request('/identify', { type: 'application/json', body: '{malformed' })).status, 415);
  assert.equal((await app.request('/identify', { body: Buffer.alloc(0) })).status, 400);
  assert.equal((await app.request('/identify', { body: Buffer.alloc(5 * 1024 * 1024 + 1) })).status, 413);
  assert.equal(serviceCalls, 0);
});

test('owner result forwards service credential only upstream and removes unknown image/token fields', async (t) => {
  const app = await setup(t, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://recognition.example.invalid/v1/owner-recognition/identify');
    assert.equal(options.headers.Authorization, `Bearer ${SERVICE_TOKEN}`);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.body, IMAGE);
    const result = valid();
    result.accessToken = SERVICE_TOKEN;
    result.image = IMAGE.toString();
    result.candidates[0].image = IMAGE.toString();
    result.candidates[0].token = 'owner-access';
    result.timings = { inferenceMs: 12, token: SERVICE_TOKEN };
    return upstream(result);
  } });
  const result = await app.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.autoAdd, false);
  assert.equal(result.body.autoAccept, false);
  assert.equal(result.body.requiresReview, true);
  assert.deepEqual(result.body.timings, { inferenceMs: 12 });
  for (const secret of [SERVICE_TOKEN, 'owner-access', IMAGE.toString()]) {
    assert.equal(JSON.stringify(result.body).includes(secret), false);
  }
});

test('incompatible model, index, candidates and automatic acceptance fail closed', async (t) => {
  let result = valid();
  const app = await setup(t, { fetchImpl: async () => upstream(result) });
  for (const overrides of [
    { modelVersion: 'different-model' }, { indexVersion: 'different-index' },
    { autoAdd: true }, { autoAccept: true }, { requiresReview: false },
    { candidates: [{ variantId: 'a', canonicalKey: 'a', name: 'a', similarity: '0.9' }] },
  ]) {
    result = { ...valid(), ...overrides };
    const response = await app.request();
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'OWNER_MODEL_UNAVAILABLE');
    assert.equal(response.body.candidates, undefined);
  }
});

test('timeout returns 504 and releases the in-flight slot', async (t) => {
  let calls = 0;
  const app = await setup(t, { timeoutMs: 10, fetchImpl: async (_url, options) => {
    if (calls++ > 0) return upstream(valid());
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const response = await app.request();
  assert.equal(response.status, 504);
  assert.equal(response.body.error.code, 'OWNER_MODEL_TIMEOUT');
  assert.equal((await app.request()).status, 200);
});

test('missing service configuration fails without an upstream request', async (t) => {
  const app = await setup(t, { env: { ...ENV, OWNER_SIGLIP_SERVICE_TOKEN: '' }, fetchImpl: async () => { throw new Error('must not call'); } });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'OWNER_MODEL_UNCONFIGURED');
});

test('status requires ready flag and exact model/index, exposes no upstream details', async (t) => {
  let ready = { ready: true, modelVersion: MODEL, indexVersion: INDEX, token: SERVICE_TOKEN };
  const app = await setup(t, { fetchImpl: async () => upstream(ready) });
  const response = await app.request('/status', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(response.body.available, true);
  assert.equal(JSON.stringify(response.body).includes(SERVICE_TOKEN), false);
  ready = { ok: true, modelVersion: MODEL, indexVersion: INDEX };
  assert.equal((await app.request('/status', { method: 'GET' })).status, 200);
  ready = { ready: true, modelVersion: 'wrong', indexVersion: INDEX };
  assert.equal((await app.request('/status', { method: 'GET' })).status, 503);
});

test('upstream HTTP and malformed JSON failures do not leak service details', async (t) => {
  let response = upstream({ token: SERVICE_TOKEN, image: IMAGE.toString() }, 500);
  const app = await setup(t, { fetchImpl: async () => response });
  for (const upstreamResponse of [response, new Response(`not-json-${SERVICE_TOKEN}`)]) {
    response = upstreamResponse;
    const result = await app.request();
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result.body).includes(SERVICE_TOKEN), false);
  }
});
