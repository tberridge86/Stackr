/** Fixed originals and faithful, preloaded renditions in the Site's R2 bucket. */
const MEDIA_KEY = /^(?:products|contents|cards|sets)\/[a-zA-Z0-9_-]{1,160}$/;
const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MEDIA_DEFAULTS = Object.freeze({ maxBytes: 10 * 1024 * 1024, timeoutMs: 7000, concurrency: 4, maxQueue: 32 });
const MEDIA_CACHE_CONTROL = 'public, max-age=300, must-revalidate';

function mediaError(code, status = 502) { return Object.assign(new Error(code), { code, status }); }
function mediaFailure(code, status, method = 'GET', extra = {}) {
  const body = JSON.stringify({ error: 'photo_awaiting', code });
  return new Response(method === 'HEAD' ? null : body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function publicSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || !host.includes('.') || host.endsWith('.') ||
        /^(?:\[.*\]|\d+(?:\.\d+){3})$/.test(host) || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
function mediaMime(value) { return typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : ''; }
function imageSignature(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}
async function mediaDigest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function matchesMediaEtag(header, etag) {
  return typeof header === 'string' && header.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}
function importResult(body, status, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function importSecret(value) {
  return typeof value === 'string' && value.length >= 32 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
}
async function equalImportSecret(expected, supplied) {
  if (typeof supplied !== 'string' || supplied.length > 512) return false;
  const [a, b] = await Promise.all([mediaDigest(expected), mediaDigest(supplied)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

export function createMediaService({ sources, fetchImpl = fetch, limits = {} }) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources) || typeof fetchImpl !== 'function') throw new TypeError('Expected a fixed image source map');
  const settings = Object.fromEntries(Object.entries(MEDIA_DEFAULTS).map(([key, max]) => [key, Number.isSafeInteger(limits[key]) && limits[key] > 0 ? Math.min(limits[key], max) : max]));
  const entries = new Map();
  for (const [key, value] of Object.entries(sources)) {
    if (!MEDIA_KEY.test(key)) throw new TypeError('Invalid media source key');
    if (value?.kind === 'stored-rendition') {
      const url = publicSourceUrl(value.original?.url);
      const originalSha256 = typeof value.original?.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(value.original.sha256) ? value.original.sha256.toLowerCase() : null;
      const sha256 = typeof value.delivery?.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(value.delivery.sha256) ? value.delivery.sha256.toLowerCase() : null;
      const mime = mediaMime(value.delivery?.mime), bytes = value.delivery?.bytes;
      const valid = Boolean(url && originalSha256 && sha256 && MEDIA_TYPES.has(mime) && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= settings.maxBytes);
      entries.set(key, Object.freeze({ kind: 'stored-rendition', url, originalSha256, sha256, mime, bytes, valid }));
      continue;
    }
    const url = publicSourceUrl(value?.url), sha256 = typeof value?.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(value.sha256) ? value.sha256.toLowerCase() : null;
    const mime = value?.mime === undefined ? null : mediaMime(value.mime);
    const valid = Boolean((value?.kind === undefined || value.kind === 'original') && url && (value.sha256 === undefined || sha256) && (mime === null || MEDIA_TYPES.has(mime)));
    entries.set(key, Object.freeze({ kind: 'original', url, sha256, mime, valid }));
  }
  const pendingByBucket = new WeakMap();
  let active = 0;
  const queue = [];
  function takeSlot() {
    if (active < settings.concurrency) { active++; return Promise.resolve(); }
    if (queue.length >= settings.maxQueue) return Promise.reject(mediaError('media_busy', 503));
    return new Promise(resolve => queue.push(resolve));
  }
  function releaseSlot() {
    const next = queue.shift(); if (next) next(); else active--;
  }
  async function storageKey(source) {
    if (source.kind === 'stored-rendition') return 'stackr-shop-renditions/v1/' + await mediaDigest([source.url, source.originalSha256, source.sha256, source.mime, source.bytes].join('\n'));
    // A URL or expected-byte change creates a new object; previous originals stay untouched.
    return 'stackr-shop-originals/v1/' + await mediaDigest(source.url + '\n' + (source.sha256 || ''));
  }
  function validateStored(object, source) {
    if (!object) return;
    const metadata = object.customMetadata || {}, mime = mediaMime(object.httpMetadata?.contentType);
    if (!MEDIA_TYPES.has(mime) || source.mime && source.mime !== mime || !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > settings.maxBytes || metadata.version !== '1' || metadata.source !== source.url || (metadata.expectedsha256 || '') !== (source.sha256 || '') || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '') || source.sha256 && metadata.sha256 !== source.sha256) throw mediaError('cached_media_invalid');
    if (source.kind === 'stored-rendition' && (object.size !== source.bytes || metadata.kind !== 'stored-rendition' || metadata.originalsha256 !== source.originalSha256 || metadata.deliverybytes !== String(source.bytes))) throw mediaError('cached_media_invalid');
  }
  async function stored(bucket, key, source, head = false) {
    let object;
    try { object = head && typeof bucket.head === 'function' ? await bucket.head(key) : await bucket.get(key); }
    catch { throw mediaError('storage_unavailable', 503); }
    validateStored(object, source); return object;
  }
  async function boundedImage(response, signal) {
    const declared = response.headers.get('Content-Length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) <= 0 || Number(declared) > settings.maxBytes)) throw mediaError('source_too_large');
    if (!response.body || typeof response.body.getReader !== 'function') throw mediaError('source_not_image');
    const capacity = declared !== null ? Number(declared) : settings.maxBytes;
    const bytes = new Uint8Array(capacity), reader = response.body.getReader(); let size = 0;
    const cancel = () => { reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        if (signal.aborted) throw mediaError('source_timeout');
        const chunk = await reader.read(); if (chunk.done) break;
        if (size + chunk.value.byteLength > capacity) { await reader.cancel(); throw mediaError('source_too_large'); }
        bytes.set(chunk.value, size); size += chunk.value.byteLength;
      }
      if (signal.aborted) throw mediaError('source_timeout');
      if (size === 0 || declared !== null && size !== Number(declared)) throw mediaError('source_size_mismatch');
      return bytes.subarray(0, size);
    } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  }
  async function retrieve(source) {
    // A rendition is pinned delivery data, never a request to transform/fetch its master.
    if (source.kind === 'stored-rendition') throw mediaError('rendition_not_ready', 503);
    const controller = new AbortController(); let timer;
    const operation = (async () => {
      const response = await fetchImpl(source.url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers: { Accept: '*/*' }, signal: controller.signal });
      if (response.redirected || response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) throw mediaError('source_redirect');
      if (response.url && response.url !== source.url) throw mediaError('source_url_changed');
      if (!response.ok) throw mediaError(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? 'source_http_' + response.status : 'source_http_error');
      const declaredMime = mediaMime(response.headers.get('Content-Type'));
      if (!MEDIA_TYPES.has(declaredMime) || source.mime && declaredMime !== source.mime) throw mediaError('source_content_type');
      const bytes = await boundedImage(response, controller.signal), mime = imageSignature(bytes);
      if (!mime || mime !== declaredMime || source.mime && mime !== source.mime) throw mediaError('source_not_image');
      const sha256 = await mediaDigest(bytes);
      if (source.sha256 && sha256 !== source.sha256) throw mediaError('source_hash_mismatch');
      if (controller.signal.aborted) throw mediaError('source_timeout');
      return { bytes, mime, sha256 };
    })();
    try {
      return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(mediaError('source_timeout')); }, settings.timeoutMs); })]);
    } catch (error) {
      if (error?.status) throw error;
      throw mediaError(controller.signal.aborted ? 'source_timeout' : 'source_fetch_failed');
    } finally { clearTimeout(timer); }
  }
  async function persistOriginal(bucket, key, source, image) {
    let result;
    try {
      result = await bucket.put(key, image.bytes, {
        onlyIf: new Headers({ 'If-None-Match': '*' }),
        httpMetadata: { contentType: image.mime, cacheControl: MEDIA_CACHE_CONTROL },
        customMetadata: { source: source.url, sha256: image.sha256, expectedsha256: source.sha256 || '', version: '1', ...(source.kind === 'stored-rendition' ? { kind: 'stored-rendition', originalsha256: source.originalSha256, deliverybytes: String(source.bytes) } : {}) },
      });
    } catch { throw mediaError('storage_unavailable', 503); }
    // A conditional conflict returns null. Callers must validate a durable readback.
    if (result === undefined) throw mediaError('storage_unavailable', 503);
    return result !== null;
  }
  async function acquire(bucket, key, source) {
    let pending = pendingByBucket.get(bucket);
    if (!pending) { pending = new Map(); pendingByBucket.set(bucket, pending); }
    if (!pending.has(key)) {
      const operation = (async () => {
        await takeSlot();
        try {
          // A different request/isolate may have populated R2 while this request queued.
          if (await stored(bucket, key, source, true)) return;
          const image = await retrieve(source);
          await persistOriginal(bucket, key, source, image);
        } finally { releaseSlot(); }
      })().finally(() => pending.delete(key));
      pending.set(key, operation);
    }
    await pending.get(key);
  }
  async function handleRequest(request, env = {}, ctx) {
    const url = new URL(request.url), method = request.method;
    if (!url.pathname.startsWith('/media/')) return mediaFailure('not_found', 404, method);
    if (method !== 'GET' && method !== 'HEAD') return mediaFailure('method_not_allowed', 405, method, { Allow: 'GET, HEAD' });
    // No width/URL/source/refresh override is accepted from a visitor.
    if (url.search) return mediaFailure('query_not_supported', 400, method);
    let key;
    try { key = decodeURIComponent(url.pathname.slice(7)); } catch { return mediaFailure('invalid_path', 400, method); }
    if (!MEDIA_KEY.test(key) || !entries.has(key)) return mediaFailure('not_found', 404, method);
    const source = entries.get(key);
    if (!source.valid) return mediaFailure('invalid_source', 502, method);
    const bucket = env.BUCKET;
    if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function') return mediaFailure('storage_unavailable', 503, method);
    try {
      const immutableKey = await storageKey(source);
      const metadataOnly = method === 'HEAD' || request.headers.has('If-None-Match');
      let object = await stored(bucket, immutableKey, source, metadataOnly);
      if (!object) {
        if (source.kind === 'stored-rendition') throw mediaError('rendition_not_ready', 503);
        await acquire(bucket, immutableKey, source);
        object = await stored(bucket, immutableKey, source, metadataOnly);
        if (!object) throw mediaError('storage_unavailable', 503);
      }
      const etag = /^"[^"\r\n]+"$/.test(object.httpEtag || '') ? object.httpEtag : '"' + object.customMetadata.sha256 + '"';
      const headers = { 'Content-Type': mediaMime(object.httpMetadata.contentType), 'Content-Length': String(object.size), ETag: etag, 'Cache-Control': MEDIA_CACHE_CONTROL, 'X-Content-Type-Options': 'nosniff' };
      if (matchesMediaEtag(request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
      if (method === 'HEAD') return new Response(null, { headers });
      if (metadataOnly) object = await stored(bucket, immutableKey, source);
      if (!object || !('body' in object) || !object.body) throw mediaError('storage_unavailable', 503);
      return new Response(object.body, { headers });
    } catch (error) { return mediaFailure(error?.code || 'source_unavailable', error?.status || 502, method, error?.code === 'media_busy' ? { 'Retry-After': '2' } : error?.code === 'rendition_not_ready' ? { 'Retry-After': '30' } : {}); }
  }
  async function handleImport(request, env = {}) {
    const fail = (code, status, extra) => importResult({ error: 'media_import_failed', code }, status, extra);
    // This temporary publisher capability is disabled unless explicitly configured.
    if (!importSecret(env.MEDIA_IMPORT_SECRET)) return fail('not_found', 404);
    if (!await equalImportSecret(env.MEDIA_IMPORT_SECRET, request.headers.get('X-StackR-Media-Import'))) return fail('forbidden', 403);
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/admin/media/')) return fail('not_found', 404);
    if (request.method !== 'POST') return fail('method_not_allowed', 405, { Allow: 'POST' });
    if (url.href.includes('?') || url.hash) return fail('query_not_supported', 400);
    let key;
    try { key = decodeURIComponent(url.pathname.slice('/api/admin/media/'.length)); } catch { return fail('invalid_path', 400); }
    if (!MEDIA_KEY.test(key) || !entries.has(key)) return fail('not_found', 404);
    const source = entries.get(key);
    if (!source.valid) return fail('invalid_source', 502);
    if (!source.sha256) return fail('source_hash_required', 409);
    const declaredMime = mediaMime(request.headers.get('Content-Type'));
    if (!MEDIA_TYPES.has(declaredMime) || source.mime && source.mime !== declaredMime) return fail('import_content_type', 415);
    const bucket = env.BUCKET;
    if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function') return fail('storage_unavailable', 503);
    let hasSlot = false, timer;
    const controller = new AbortController();
    try {
      await takeSlot(); hasSlot = true;
      const bytes = await Promise.race([
        boundedImage(request, controller.signal),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(mediaError('source_timeout')); }, settings.timeoutMs); }),
      ]);
      clearTimeout(timer);
      if (source.kind === 'stored-rendition' && bytes.length !== source.bytes) throw mediaError('source_size_mismatch');
      const mime = imageSignature(bytes);
      if (!mime || mime !== declaredMime || source.mime && source.mime !== mime) throw mediaError('source_not_image');
      const sha256 = await mediaDigest(bytes);
      if (sha256 !== source.sha256) throw mediaError('source_hash_mismatch');
      const immutableKey = await storageKey(source);
      let object = await stored(bucket, immutableKey, source, true), created = false;
      if (!object) {
        created = await persistOriginal(bucket, immutableKey, source, { bytes, mime, sha256 });
        object = await stored(bucket, immutableKey, source, true);
        if (!object) throw mediaError('storage_unavailable', 503);
      }
      return importResult({ ok: true, key, sha256, stored: true }, created ? 201 : 200);
    } catch (error) {
      const inputErrors = { source_too_large: ['import_too_large', 413], source_size_mismatch: ['import_size_mismatch', 400], source_not_image: ['import_not_image', 422], source_hash_mismatch: ['import_hash_mismatch', 422], source_timeout: ['import_timeout', 408] };
      const [code, status] = inputErrors[error?.code] || [error?.code || 'import_unavailable', error?.status || 502];
      return fail(code, status, code === 'media_busy' ? { 'Retry-After': '2' } : undefined);
    } finally { clearTimeout(timer); if (hasSlot) releaseSlot(); }
  }
  return { handleRequest, handleImport };
}
