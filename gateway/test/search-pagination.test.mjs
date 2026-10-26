import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { matchRoute } from '../src/routes.js';
import { validateQuery, withBoundedPageSize } from '../src/validation.js';

const route = matchRoute('/v1/search');
const opaque = 'eyJ2ZXJzaW9uIjoxLCJzdHJhdGVneSI6ImV4YWN0TmFtZSJ9';
test('public catalogue search allows one bounded opaque continuation cursor', () => {
  assert.equal(route.auth, 'public');
  assert.equal(route.cache, 'search');
  assert.equal(route.rate, 'search');
  assert.doesNotThrow(() => validateQuery(route, new URL('https://fixture.invalid/v1/search?q=Pikachu&language=en&limit=50&cursor=' + opaque)));
  for (const query of ['cursor=bad+value', 'cursor=' + 'a'.repeat(2049), 'cursor=a&cursor=b', 'offset=50']) {
    assert.throws(() => validateQuery(route, new URL('https://fixture.invalid/v1/search?q=Pikachu&' + query)));
  }
});
test('existing fifty-row enforcement preserves exact search/cursor scope', () => {
  const original = new Request('https://fixture.invalid/v1/search?q=Pikachu&language=ja&limit=500&cursor=' + opaque);
  const bounded = withBoundedPageSize(original, route, { STACKR_ENFORCE_UI_PAGE_LIMIT: 'true' });
  const url = new URL(bounded.url);
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('cursor'), opaque);
  assert.equal(url.searchParams.get('q'), 'Pikachu');
  assert.equal(url.searchParams.get('language'), 'ja');
  assert.equal(withBoundedPageSize(original, route).url, original.url, 'legacy enforcement gate is unchanged');
});

const stateModule = 'data:text/javascript,' + encodeURIComponent(`
export async function catalogueCacheVersion(env) { return env.version ?? 'v1'; }
export async function activateCatalogueCacheVersion(env, version) { env.version = version; }
`);
const cacheSource = (await readFile(new URL('../src/cache.js', import.meta.url), 'utf8'))
  .replace("'./state.js'", JSON.stringify(stateModule));
const { cachedProxy } = await import('data:text/javascript;base64,' + Buffer.from(cacheSource).toString('base64'));
test('shared search cache isolates cursor and language while retaining warm hits', async () => {
  const rows = new Map(), jobs = [];
  const cache = { async match(key) { return rows.get(key.url)?.clone(); },
    async put(key, response) { rows.set(key.url, response.clone()); } };
  const env = { version: 'v1' }, ctx = { waitUntil(promise) { jobs.push(promise); } };
  let originCalls = 0;
  async function read(cursor, language = 'en') {
    const request = new Request('https://fixture.invalid/v1/search?q=Pikachu&limit=50&language=' + language + (cursor ? '&cursor=' + cursor : ''));
    const response = await cachedProxy({ request, route, env, ctx, cache, fetchFresh: async () => {
      originCalls++;
      return Response.json({ data: { results: [language + ':' + (cursor || 'first')] } });
    } });
    await Promise.all(jobs);
    return (await response.json()).data.results[0];
  }
  assert.equal(await read(null), 'en:first');
  assert.equal(await read(opaque), 'en:' + opaque);
  assert.equal(await read(opaque, 'ja'), 'ja:' + opaque);
  assert.equal(await read(opaque), 'en:' + opaque);
  assert.equal(originCalls, 3);
});
