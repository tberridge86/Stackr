import { preflightResponse, validateOrigin } from '../src/security.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const stateModule = 'data:text/javascript,' + encodeURIComponent("export async function catalogueCacheVersion(){return 'fixture-v1'};export async function activateCatalogueCacheVersion(){};");
const source = (await readFile(new URL('../src/cache.js', import.meta.url), 'utf8')).replace("'./state.js'", JSON.stringify(stateModule));
const { cachedProxy } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('explicit search refresh replaces an obsolete first-page cursor without deleting useful cache on failure', async () => {
  const entries = new Map(), jobs = [];
  const cache = { async match(key) { return entries.get(key.url)?.clone(); },
    async put(key,response) { entries.set(key.url,response.clone()); } };
  const ctx = { waitUntil(promise) { jobs.push(promise); } };
  let revision = 'old', calls = 0, failure = false;
  const read = async (refresh=false) => {
    const response = await cachedProxy({ request: new Request('https://fixture.invalid/v1/search?q=Pikachu&limit=50',
      { headers: refresh ? { 'Cache-Control': 'no-cache' } : {} }), route:{id:'search',cache:'search'}, env:{},ctx,cache,
      fetchFresh: async () => { calls++; if(failure) return Response.json({error:{code:'unavailable'}},{status:503});
        return Response.json({meta:{pagination:{nextCursor:revision}},data:{results:[revision]}}); } });
    await Promise.all(jobs); return response;
  };
  assert.equal((await (await read()).json()).meta.pagination.nextCursor,'old');
  revision='new';
  assert.equal((await (await read()).json()).meta.pagination.nextCursor,'old');
  assert.equal(calls,1,'ordinary reads retain their warm cache');
  assert.equal((await (await read(true)).json()).meta.pagination.nextCursor,'new','explicit refresh cannot repeat an obsolete cached cursor');
  assert.equal(calls,2);
  failure=true; assert.equal((await read(true)).status,503);
  assert.equal((await (await read()).json()).data.results[0],'new','failed refresh retains useful cached data');
  assert.equal(calls,3);
});

test('allowed web Search OPTIONS permits its explicit refresh header without broadening origins', () => {
  const origin = 'https://stackr.app';
  const request = new Request('https://fixture.invalid/v1/search?q=Pikachu', { method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'cache-control' } });
  assert.equal(validateOrigin(request, { ALLOWED_ORIGINS: origin }), origin);
  const response = preflightResponse({ id: 'search', methods: ['GET'] }, origin, 'fixture-request', '1');
  assert.equal(response.status, 204);
  assert.ok(response.headers.get('access-control-allow-headers').toLowerCase().split(',').map(value => value.trim()).includes('cache-control'));
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.throws(() => validateOrigin(new Request(request, { headers: { Origin: 'https://unapproved.invalid' } }), { ALLOWED_ORIGINS: origin }));
  assert.ok(!preflightResponse({ id: 'sets', methods: ['GET'] }, origin, 'fixture-request', '1')
    .headers.get('access-control-allow-headers').toLowerCase().includes('cache-control'), 'other routes retain their existing header contract');
});
