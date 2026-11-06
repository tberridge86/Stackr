import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createMediaService } from './media.mjs';

// Actual transparent 1×1 PNG bytes; all origin/R2 operations below are mocks.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4/8AAAAASUVORK5CYII=', 'base64'));
const digest = value => createHash('sha256').update(value).digest('hex');
const sourceUrl = 'https://images.example.com/product/original.png?v=1';
const sources = { 'products/black-bundle': { url: sourceUrl, sha256: digest(png), mime: 'image/png' } };
const request = (key = 'products/black-bundle', options) => new Request('https://stackr.test/media/' + key, options);
const importToken = 'local-test-publisher-token-32-characters-minimum';
const importRequest = (key = 'products/black-bundle', options = {}) => new Request('https://stackr.test/api/admin/media/' + key, { method: 'POST', body: png, ...options, headers: { 'Content-Type': 'image/png', 'X-StackR-Media-Import': importToken, ...options.headers } });
const imageResponse = (bytes = png, options = {}) => new Response(bytes, { status: options.status || 200, headers: { 'Content-Type': options.type || 'image/png', ...(options.length !== undefined ? { 'Content-Length': String(options.length) } : {}) } });
function bucketMock() {
  const objects = new Map(); let puts = 0, gets = 0;
  const object = (key, stored, body) => stored ? { key, size: stored.bytes.byteLength, httpEtag: '"' + digest(stored.bytes) + '"', httpMetadata: structuredClone(stored.options.httpMetadata), customMetadata: structuredClone(stored.options.customMetadata), ...(body ? { body: new Response(stored.bytes.slice()).body } : {}) } : null;
  return {
    objects,
    get puts() { return puts; }, get gets() { return gets; },
    async get(key) { gets++; return object(key, objects.get(key), true); },
    async head(key) { return object(key, objects.get(key), false); },
    async put(key, bytes, options) {
      puts++; assert.equal(options.onlyIf.get('If-None-Match'), '*');
      if (objects.has(key)) return null;
      objects.set(key, { bytes: Uint8Array.from(bytes), options }); return object(key, objects.get(key), false);
    },
  };
}

test('first GET validates original bytes, persists to immutable R2, and subsequent services use it', async () => {
  const bucket = bucketMock(); let fetches = 0;
  const service = createMediaService({ sources, fetchImpl: async (url, options) => {
    if(options.redirect==='error')throw new TypeError('Unsupported redirect mode: error');
    fetches++; assert.equal(url, sourceUrl); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { Accept: '*/*' }); return imageResponse();
  } });
  const first = await service.handleRequest(request(), { BUCKET: bucket }); assert.equal(first.status, 200);
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), png); assert.equal(first.headers.get('Content-Type'), 'image/png');
  assert.match(first.headers.get('ETag'), /^"[a-f0-9]+"$/); assert.equal(first.headers.get('Cache-Control'), 'public, max-age=300, must-revalidate');
  assert.equal(fetches, 1); assert.equal(bucket.puts, 1);
  const [[key, saved]] = [...bucket.objects]; assert.match(key, /^stackr-shop-originals\/v1\/[a-f0-9]{64}$/);
  assert.equal(saved.options.customMetadata.sha256, digest(png)); assert.equal(saved.options.customMetadata.source, sourceUrl);
  const freshService = createMediaService({ sources, fetchImpl: async () => { throw Error('Must use persisted original'); } });
  const second = await freshService.handleRequest(request(), { BUCKET: bucket }); assert.equal(second.status, 200); assert.deepEqual(new Uint8Array(await second.arrayBuffer()), png);
});

test('HEAD and If-None-Match operate against R2 metadata without re-fetching an original', async () => {
  const bucket = bucketMock(); let calls = 0;
  const service = createMediaService({ sources, fetchImpl: async () => { calls++; return imageResponse(); } });
  const head = await service.handleRequest(request('products/black-bundle', { method: 'HEAD' }), { BUCKET: bucket });
  assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(head.headers.get('Content-Length'), String(png.length));
  for (const value of [head.headers.get('ETag'), 'W/' + head.headers.get('ETag'), '*', '"other", ' + head.headers.get('ETag')]) {
    const conditional = await service.handleRequest(request('products/black-bundle', { headers: { 'If-None-Match': value } }), { BUCKET: bucket });
    assert.equal(conditional.status, 304); assert.equal(await conditional.text(), '');
  }
  assert.equal(calls, 1);
});

test('set logos use pinned immutable originals and cannot accept unlisted set sources', async () => {
  const bucket=bucketMock(),key='sets/jp-black-bolt--'+digest(png).slice(0,12);
  const service=createMediaService({sources:{[key]:{url:sourceUrl,sha256:digest(png)}},fetchImpl:async()=>{throw Error('The uploaded original must be used');}});
  const env={BUCKET:bucket,MEDIA_IMPORT_SECRET:importToken};
  assert.equal((await service.handleImport(importRequest(key),env)).status,201);
  const result=await service.handleRequest(request(key),env);assert.equal(result.status,200);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),png);
  assert.equal((await service.handleRequest(request('sets/unlisted-logo'),env)).status,404);
  assert.equal((await service.handleImport(importRequest('sets/unlisted-logo'),env)).status,404);
  assert.equal(bucket.puts,1);
});

test('simultaneous requests for one source share a fetch and one durable write', async () => {
  const bucket = bucketMock(); let calls = 0, release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const service = createMediaService({ sources, fetchImpl: async () => { calls++; started(); await gate; return imageResponse(); } });
  const pending = Array.from({ length: 8 }, () => service.handleRequest(request(), { BUCKET: bucket }));
  await entered; assert.equal(calls, 1); release();
  const responses = await Promise.all(pending); assert(responses.every(response => response.status === 200));
  for (const response of responses) assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  assert.equal(bucket.puts, 1);
});

test('a URL or expected SHA change creates a new object without deleting or replacing the old asset', async () => {
  const bucket = bucketMock();
  const first = createMediaService({ sources, fetchImpl: async () => imageResponse() }); await first.handleRequest(request(), { BUCKET: bucket });
  const nextSources = { 'products/black-bundle': { ...sources['products/black-bundle'], url: sourceUrl.replace('v=1', 'v=2') } };
  const second = createMediaService({ sources: nextSources, fetchImpl: async () => imageResponse() }); assert.equal((await second.handleRequest(request(), { BUCKET: bucket })).status, 200);
  const third = createMediaService({ sources: { 'products/black-bundle': { url: sourceUrl, mime: 'image/png' } }, fetchImpl: async () => imageResponse() });
  assert.equal((await third.handleRequest(request(), { BUCKET: bucket })).status, 200); assert.equal(bucket.objects.size, 3);
});

test('visitor URLs, transforms, malformed paths, unknown sources and methods cannot cause fetches', async () => {
  const bucket = bucketMock(); let calls = 0;
  const service = createMediaService({ sources, fetchImpl: async () => { calls++; return imageResponse(); } });
  for (const [key, status] of [['products/black-bundle?url=https://evil.example/file', 400], ['products/black-bundle?width=4000', 400], ['products/unknown', 404], ['https://evil.example/a.png', 404], ['%E0%A4%A', 400], ['products/__proto__', 404]]) assert.equal((await service.handleRequest(request(key), { BUCKET: bucket })).status, status);
  const post = await service.handleRequest(request('products/black-bundle', { method: 'POST', body: 'x' }), { BUCKET: bucket });
  assert.equal(post.status, 405); assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  assert.equal((await service.handleRequest(new Request('https://stackr.test/api/other'), { BUCKET: bucket })).status, 404);
  assert.equal(calls, 0);
});

test('the authored source map is snapshotted and private or credential-bearing origins fail closed', async () => {
  const urls = ['http://images.example.com/a.png', 'https://localhost/a.png', 'https://localhost./a.png', 'https://a.local/a.png', 'https://printer.local./a.png', 'https://metadata.google.internal/a.png', 'https://metadata.google.internal./a.png', 'https://127.0.0.1/a.png', 'https://2130706433/a.png', 'https://[::1]/a.png', 'https://user:pass@images.example.com/a.png', 'https://images.example.com:444/a.png'];
  for (const url of urls) {
    const bucket = bucketMock(); let calls = 0;
    const service = createMediaService({ sources: { 'products/item': { url } }, fetchImpl: async () => { calls++; return imageResponse(); } });
    const r = await service.handleRequest(request('products/item'), { BUCKET: bucket }); assert.equal(r.status, 502, url); assert.equal(calls, 0); assert.equal(bucket.puts, 0);
  }
  const map = structuredClone(sources), seen = [];
  const service = createMediaService({ sources: map, fetchImpl: async url => { seen.push(url); return imageResponse(); } });
  map['products/black-bundle'].url = 'https://evil.example/changed.png';
  assert.equal((await service.handleRequest(request(), { BUCKET: bucketMock() })).status, 200); assert.deepEqual(seen, [sourceUrl]);
});

test('HTTP, redirect, content type, image signature and expected-hash failures are not persisted', async () => {
  const cases = [
    [async () => imageResponse(png, { status: 404 }), 'source_http_404'],
    [async () => new Response(null, { status: 302, headers: { Location: 'https://localhost/private' } }), 'source_redirect'],
    [async () => imageResponse(png, { type: 'text/html' }), 'source_content_type'],
    [async () => imageResponse(new TextEncoder().encode('<html>not an image</html>')), 'source_not_image'],
    [async () => imageResponse(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), 'source_not_image'],
    [async () => imageResponse(Uint8Array.from([...png, 0])), 'source_hash_mismatch'],
    [async () => { const r = imageResponse(); Object.defineProperty(r, 'redirected', { value: true }); return r; }, 'source_redirect'],
    [async () => { const r = imageResponse(); Object.defineProperty(r, 'url', { value: 'https://elsewhere.example/a.png' }); return r; }, 'source_url_changed'],
    [async () => { throw Error('Sensitive network diagnostics must not leak'); }, 'source_fetch_failed'],
  ];
  for (const [fetchImpl, code] of cases) {
    const bucket = bucketMock(), service = createMediaService({ sources, fetchImpl });
    const result = await service.handleRequest(request(), { BUCKET: bucket }); assert.equal(result.status, 502); assert.equal(bucket.puts, 0); assert.deepEqual(await result.json(), { error: 'photo_awaiting', code });
  }
});

test('size and source time budgets fail closed, including body streaming and ignoring abort', async () => {
  const tooLarge = [async () => imageResponse(png, { length: 9999 }), async () => imageResponse()];
  for (const fetchImpl of tooLarge) {
    const bucket = bucketMock(), service = createMediaService({ sources, fetchImpl, limits: { maxBytes: 32 } });
    assert.equal((await service.handleRequest(request(), { BUCKET: bucket })).status, 502); assert.equal(bucket.puts, 0);
  }
  for (const fetchImpl of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'image/png' } })]) {
    const bucket = bucketMock(), service = createMediaService({ sources, fetchImpl, limits: { timeoutMs: 10 } });
    const start = performance.now(), r = await service.handleRequest(request(), { BUCKET: bucket });
    assert.equal(r.status, 502); assert(performance.now() - start < 1000); assert.equal(bucket.puts, 0);
  }
});

test('missing or failed R2 cannot be replaced by a pretend cache or success', async () => {
  let calls = 0; const service = createMediaService({ sources, fetchImpl: async () => { calls++; return imageResponse(); } });
  assert.equal((await service.handleRequest(request(), {})).status, 503); assert.equal(calls, 0);
  const badRead = bucketMock(); badRead.get = async () => { throw Error('R2 outage'); };
  assert.equal((await service.handleRequest(request(), { BUCKET: badRead })).status, 503); assert.equal(calls, 0);
  const badWrite = bucketMock(); badWrite.put = async () => { throw Error('R2 write failed'); };
  assert.equal((await service.handleRequest(request(), { BUCKET: badWrite })).status, 503); assert.equal(calls, 1);
  const disappearing = bucketMock(); disappearing.put = async () => ({ size: png.length });
  assert.equal((await service.handleRequest(request(), { BUCKET: disappearing })).status, 503);
});

test('bounded concurrent fetches and queue reject bursts without forwarding visitor headers', async () => {
  const sourceMap = Object.fromEntries(Array.from({ length: 5 }, (_, n) => ['products/p' + n, { url: 'https://images.example.com/' + n + '.png', mime: 'image/png' }]));
  let active = 0, maximum = 0, release;
  const gate = new Promise(resolve => { release = resolve; }); const bucket = bucketMock();
  const service = createMediaService({ sources: sourceMap, limits: { concurrency: 1, maxQueue: 1 }, fetchImpl: async (_, options) => {
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined); assert.equal(options.headers.Referer, undefined);
    active++; maximum = Math.max(maximum, active); await gate; active--; return imageResponse();
  } });
  const pending = Array.from({ length: 5 }, (_, n) => service.handleRequest(request('products/p' + n, { headers: { Authorization: 'secret', Cookie: 'private', Referer: 'https://private.example/' } }), { BUCKET: bucket }));
  await new Promise(resolve => setTimeout(resolve, 10)); release();
  const result = await Promise.all(pending); assert.equal(maximum, 1); assert.equal(result.filter(r => r.status === 200).length, 2); assert.equal(result.filter(r => r.status === 503).length, 3);
});

test('cached metadata cannot serve a mismatched source, expected SHA or unsafe content type', async () => {
  for (const mutate of [stored => stored.options.customMetadata.source = 'https://wrong.example/a.png', stored => stored.options.customMetadata.sha256 = '0'.repeat(64), stored => stored.options.httpMetadata.contentType = 'text/html']) {
    const bucket = bucketMock(), service = createMediaService({ sources, fetchImpl: async () => imageResponse() });
    await service.handleRequest(request(), { BUCKET: bucket }); mutate([...bucket.objects.values()][0]);
    const result = await service.handleRequest(request(), { BUCKET: bucket }); assert.equal(result.status, 502); assert.equal(bucket.puts, 1);
  }
});

test('media import is disabled without a strong temporary secret and visitor identity cannot authorize it', async () => {
  const bucket = bucketMock(); let fetches = 0;
  const service = createMediaService({ sources, fetchImpl: async () => { fetches++; return imageResponse(); } });
  for (const secret of [undefined, '', 'short', 'a'.repeat(513), 'a'.repeat(32) + '\n']) {
    const response = await service.handleImport(importRequest(), { BUCKET: bucket, MEDIA_IMPORT_SECRET: secret });
    assert.equal(response.status, 404); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  for (const token of ['', 'wrong', importToken + 'x']) {
    const response = await service.handleImport(importRequest('products/black-bundle', { headers: { 'X-StackR-Media-Import': token, 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.com' } }), { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken });
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'media_import_failed', code: 'forbidden' });
  }
  assert.equal(fetches, 0); assert.equal(bucket.gets, 0); assert.equal(bucket.puts, 0);
});

test('exact pinned imports persist the same immutable provenance as GET, survive new services, and are idempotent', async () => {
  const bucket = bucketMock(), env = { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken };
  let fetches = 0;
  const service = createMediaService({ sources, fetchImpl: async () => { fetches++; throw Error('Import must never fetch'); } });
  const first = await service.handleImport(importRequest(), env);
  const expected = { ok: true, key: 'products/black-bundle', sha256: digest(png), stored: true };
  assert.equal(first.status, 201); assert.deepEqual(await first.json(), expected); assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
  const [[key, saved]] = [...bucket.objects];
  assert.equal(key, 'stackr-shop-originals/v1/' + digest(sourceUrl + '\n' + digest(png)));
  assert.deepEqual(saved.options.customMetadata, { source: sourceUrl, sha256: digest(png), expectedsha256: digest(png), version: '1' });
  assert.deepEqual(saved.bytes, png); assert.equal(saved.options.httpMetadata.contentType, 'image/png');
  const second = await service.handleImport(importRequest(), env);
  assert.equal(second.status, 200); assert.deepEqual(await second.json(), expected); assert.equal(bucket.puts, 1);
  const freshService = createMediaService({ sources, fetchImpl: async () => { throw Error('Must use durable imported original'); } });
  const served = await freshService.handleRequest(request(), { BUCKET: bucket });
  assert.equal(served.status, 200); assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png); assert.equal(fetches, 0);
  // Removing the temporary environment capability immediately disables subsequent imports.
  assert.equal((await service.handleImport(importRequest(), { BUCKET: bucket })).status, 404);
});

test('imports accept only the fixed route, key, method, and pinned source without visitor options', async () => {
  const bucket = bucketMock(), env = { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken };
  const service = createMediaService({ sources, fetchImpl: async () => { throw Error('Never fetch'); } });
  for (const [key, status] of [['products/unknown', 404], ['products/__proto__', 404], ['https://elsewhere.example/a.png', 404], ['%E0%A4%A', 400], ['products/black-bundle?url=https://elsewhere.example/a.png', 400], ['products/black-bundle?', 400], ['products/black-bundle?overwrite=true', 400]]) {
    assert.equal((await service.handleImport(importRequest(key), env)).status, status, key);
  }
  const method = await service.handleImport(importRequest('products/black-bundle', { method: 'PUT' }), env);
  assert.equal(method.status, 405); assert.equal(method.headers.get('Allow'), 'POST');
  const unpinned = createMediaService({ sources: { 'products/item': { url: sourceUrl, mime: 'image/png' } } });
  assert.equal((await unpinned.handleImport(importRequest('products/item'), env)).status, 409);
  assert.equal(bucket.puts, 0); assert.equal(bucket.gets, 0);
});

test('imports verify raw type, magic, exact hash, body size, and streaming timeout before any storage write', async () => {
  const bucket = bucketMock(), env = { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken };
  const service = createMediaService({ sources });
  const cases = [
    [{ headers: { 'Content-Type': 'text/html' } }, 415, 'import_content_type'],
    [{ headers: { 'Content-Type': 'image/jpeg' } }, 415, 'import_content_type'],
    [{ body: 'not an image' }, 422, 'import_not_image'],
    [{ body: Uint8Array.from([...png, 0]) }, 422, 'import_hash_mismatch'],
    [{ headers: { 'Content-Length': String(10 * 1024 * 1024 + 1) } }, 413, 'import_too_large'],
    [{ headers: { 'Content-Length': String(png.length + 1) } }, 400, 'import_size_mismatch'],
  ];
  for (const [options, status, code] of cases) {
    const response = await service.handleImport(importRequest('products/black-bundle', options), env);
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: 'media_import_failed', code });
  }
  const bounded = createMediaService({ sources, limits: { maxBytes: 32, timeoutMs: 10 } });
  assert.equal((await bounded.handleImport(importRequest(), env)).status, 413);
  const stalled = importRequest('products/black-bundle', { body: new ReadableStream({ start() {} }), duplex: 'half' });
  const start = performance.now(), timeout = await bounded.handleImport(stalled, env);
  assert.equal(timeout.status, 408); assert.equal((await timeout.json()).code, 'import_timeout'); assert(performance.now() - start < 1000);
  assert.equal(bucket.puts, 0); assert.equal(bucket.gets, 0);
});

test('imports never replace an existing object with untrusted provenance, and still validate an idempotent request body', async () => {
  for (const mutate of [saved => saved.options.customMetadata.source = 'https://wrong.example/x.png', saved => saved.options.customMetadata.expectedsha256 = '0'.repeat(64), saved => saved.options.customMetadata.sha256 = '0'.repeat(64), saved => saved.options.customMetadata.version = '2', saved => saved.options.httpMetadata.contentType = 'image/jpeg']) {
    const bucket = bucketMock(), env = { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken }, service = createMediaService({ sources });
    await service.handleImport(importRequest(), env); mutate([...bucket.objects.values()][0]);
    const response = await service.handleImport(importRequest(), env);
    assert.equal(response.status, 502); assert.equal((await response.json()).code, 'cached_media_invalid'); assert.equal(bucket.puts, 1);
  }
  const bucket = bucketMock(), env = { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken }, service = createMediaService({ sources });
  await service.handleImport(importRequest(), env);
  assert.equal((await service.handleImport(importRequest('products/black-bundle', { body: Uint8Array.from([...png, 0]) }), env)).status, 422);
  assert.equal(bucket.puts, 1);
});

test('imports require durable R2 and successful readback, including conditional-write races', async () => {
  const service = createMediaService({ sources });
  assert.equal((await service.handleImport(importRequest(), { MEDIA_IMPORT_SECRET: importToken })).status, 503);
  for (const mutate of [
    bucket => bucket.head = async () => { throw Error('private read outage'); },
    bucket => bucket.put = async () => { throw Error('private write outage'); },
    bucket => bucket.put = async () => undefined,
    bucket => bucket.put = async () => null,
    bucket => bucket.put = async () => ({ size: png.length }),
  ]) {
    const bucket = bucketMock(); mutate(bucket);
    const response = await service.handleImport(importRequest(), { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'media_import_failed', code: 'storage_unavailable' });
  }
  const bucket = bucketMock(), originalPut = bucket.put;
  bucket.put = async (...args) => { await originalPut(...args); return null; };
  const response = await service.handleImport(importRequest(), { BUCKET: bucket, MEDIA_IMPORT_SECRET: importToken });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, key: 'products/black-bundle', sha256: digest(png), stored: true });
});
