import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Exercise the real cache module without Cloudflare services. Only catalogue
// version storage is substituted; transport, response bodies and cache timing
// are controlled explicitly so these tests cannot be mistaken for live latency.
const stateModule = 'data:text/javascript,' + encodeURIComponent(`
export async function catalogueCacheVersion(env) { return env.version ?? 'v1'; }
export async function activateCatalogueCacheVersion(env, version) { env.version = version; }
`);
const source = (await readFile(new URL('../src/cache.js', import.meta.url), 'utf8'))
  .replace("'./state.js'", JSON.stringify(stateModule));
const { cachedProxy } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(options = {}) {
  const rows = new Map();
  const jobs = [];
  const env = { version: 'v1' };
  const cache = {
    async match(key) { return rows.get(key.url)?.clone(); },
    async put(key, response) { rows.set(key.url, response.clone()); },
  };
  const ctx = { waitUntil(promise) { jobs.push(promise); } };
  const route = { id: 'set_cards', cache: 'catalogue' };
  const request = new Request('https://api.example/v1/sets/example/cards?language=ja');
  const run = (fetchFresh, extra = {}) => cachedProxy({ request, route, env, cache, ctx, fetchFresh, ...options, ...extra });
  const drain = async () => { for (let i = 0; i < jobs.length; i++) await jobs[i]; };
  return { rows, jobs, env, cache, ctx, route, request, run, drain };
}
const fresh = (value = 'correct-card', init = {}) => new Response(JSON.stringify({ data: [{ id: value }] }), {
  headers: { 'Content-Type': 'application/json', ETag: '"v1-card"', ...init.headers }, ...init,
});
async function seed(f, ageSeconds = 90) {
  await f.run(async () => fresh());
  await f.drain();
  for (const response of f.rows.values()) response.headers.set('X-Stackr-Cache-Stored-At', String(Date.now() - ageSeconds * 1000));
}

test('eight simultaneous cold reads share one origin call and have independent bodies', async () => {
  const f = fixture();
  const origin = deferred();
  let calls = 0;
  const reads = Array.from({ length: 8 }, () => f.run(async () => { calls++; return origin.promise; }));
  await tick();
  assert.equal(calls, 1);
  origin.resolve(fresh());
  const responses = await Promise.all(reads);
  for (const response of responses) {
    assert.equal(response.headers.get('X-Stackr-Cache'), 'MISS');
    assert.equal((await response.json()).data[0].id, 'correct-card');
  }
  await f.drain();
});

test('cache persistence is off the response path and joins remain deduplicated until stored', async () => {
  const f = fixture();
  const write = deferred();
  f.cache.put = async () => write.promise;
  let calls = 0;
  const fetchFresh = async () => { calls++; return fresh(); };
  const response = await f.run(fetchFresh);
  assert.equal((await response.json()).data[0].id, 'correct-card');
  await f.run(fetchFresh);
  assert.equal(calls, 1);
  write.resolve();
  await f.drain();
});

test('stale conditional 304 schedules one refresh without blocking readers', async () => {
  const f = fixture();
  await seed(f);
  const origin = deferred();
  let calls = 0;
  const request = new Request(f.request, { headers: { 'If-None-Match': '"v1-card"' } });
  const reads = Array.from({ length: 6 }, () => f.run(async () => { calls++; return origin.promise; }, { request }));
  const responses = await Promise.all(reads);
  assert.ok(responses.every((response) => response.status === 304));
  assert.equal(calls, 1);
  origin.resolve(fresh('updated-card'));
  await f.drain();
  const updated = await f.run(async () => { throw new Error('must be a hit'); });
  assert.equal((await updated.json()).data[0].id, 'updated-card');
});

test('failed origin is evicted from the flight map and retried', async () => {
  const f = fixture();
  let calls = 0;
  const fetchFresh = async () => { calls++; if (calls === 1) throw new Error('offline'); return fresh(); };
  await assert.rejects(f.run(fetchFresh), /offline/);
  assert.equal((await (await f.run(fetchFresh)).json()).data[0].id, 'correct-card');
  assert.equal(calls, 2);
  await f.drain();
});

test('cache read and write failures do not discard a valid response', async () => {
  const f = fixture();
  f.cache.match = async () => { throw new Error('cache unavailable'); };
  f.cache.put = async () => { throw new Error('storage full'); };
  assert.equal((await (await f.run(async () => fresh())).json()).data[0].id, 'correct-card');
  await f.drain();
});

test('language and catalogue-version keys do not share in-flight results', async () => {
  const f = fixture();
  let calls = 0;
  const origin = deferred();
  const fetchFresh = async () => { calls++; await origin.promise; return fresh(); };
  const ja = f.run(fetchFresh);
  const en = f.run(fetchFresh, { request: new Request(f.request.url.replace('language=ja', 'language=en')) });
  await tick();
  f.env.version = 'v2';
  const v2 = f.run(fetchFresh);
  await tick();
  assert.equal(calls, 3);
  origin.resolve();
  await Promise.all([ja, en, v2]);
  await f.drain();
});

test('authenticated and cookie requests never enter the shared cache', async () => {
  const f = fixture();
  let calls = 0;
  f.cache.match = async () => { throw new Error('must not read shared cache'); };
  f.cache.put = async () => { throw new Error('must not write shared cache'); };
  const fetchFresh = async () => { calls++; return fresh(); };
  for (const headers of [{ Authorization: 'Bearer test-only' }, { Cookie: 'session=test-only' }]) {
    const responses = await Promise.all([1, 2].map(() => f.run(fetchFresh, { request: new Request(f.request, { headers }) })));
    for (const response of responses) {
      assert.equal(response.headers.get('X-Stackr-Cache'), 'BYPASS');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  assert.equal(calls, 4);
  assert.equal(f.rows.size, 0);
});

test('errors, private, no-store and Set-Cookie responses are not made public', async () => {
  for (const init of [{ status: 503 }, { headers: { 'Cache-Control': 'private' } },
    { headers: { 'Cache-Control': 'no-store' } }, { headers: { 'Set-Cookie': 'test=only' } }, { headers: { Vary: '*' } }]) {
    const f = fixture();
    const response = await f.run(async () => fresh('not-cacheable', init));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    await f.drain();
    assert.equal(f.rows.size, 0);
  }
});

test('entries beyond their hard stale limit require fresh data', async () => {
  const f = fixture();
  await seed(f, 361);
  let calls = 0;
  const response = await f.run(async () => { calls++; return fresh('new-card'); });
  assert.equal((await response.json()).data[0].id, 'new-card');
  assert.equal(calls, 1);
  await f.drain();
});

test('manifest activation stores under the returned catalogue version', async () => {
  const f = fixture();
  await f.run(async () => new Response(JSON.stringify({ data: { currentCatalogueVersion: 'v2' } })),
    { route: { id: 'catalogue_manifest', cache: 'catalogue' } });
  await f.drain();
  assert.equal(f.env.version, 'v2');
  assert.ok([...f.rows.keys()].every((key) => new URL(key).searchParams.get('__stackr_cache_version') === 'v2'));
});


test('origin 304 renews the exact cached body instead of retaining a bodyless response', async () => {
  const f = fixture();
  await seed(f);
  const request = new Request(f.request, { headers: { 'If-None-Match': '"v1-card"' } });
  const response = await f.run(async () => new Response(null, { status: 304, headers: { ETag: '"v1-card"' } }), { request });
  assert.equal(response.status, 304);
  await f.drain();
  const cached = await f.run(async () => { throw new Error('must not call origin'); });
  assert.equal(cached.headers.get('X-Stackr-Cache'), 'HIT');
  assert.equal((await cached.json()).data[0].id, 'correct-card');
});

test('conditional and unconditional cold requests cannot share a bodyless 304', async () => {
  const f = fixture();
  const gate = deferred();
  const conditional = f.run(async () => { await gate.promise; return new Response(null, { status: 304 }); },
    { request: new Request(f.request, { headers: { 'If-None-Match': '"old"' } }) });
  const ordinary = f.run(async () => fresh('full-card'));
  gate.resolve();
  assert.equal((await conditional).status, 304);
  assert.equal((await (await ordinary).json()).data[0].id, 'full-card');
  await f.drain();
});

test('a private origin response is fetched separately for each anonymous caller', async () => {
  const f = fixture();
  const gate = deferred();
  let calls = 0;
  const fetchFresh = async () => { const id = ++calls; await gate.promise; return fresh(String(id), { headers: { 'Set-Cookie': `session=${id}` } }); };
  const first = f.run(fetchFresh);
  const second = f.run(fetchFresh);
  await tick();
  gate.resolve();
  const responses = await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.notEqual(responses[0].headers.get('Set-Cookie'), responses[1].headers.get('Set-Cookie'));
  await f.drain();
  assert.equal(f.rows.size, 0);
});
