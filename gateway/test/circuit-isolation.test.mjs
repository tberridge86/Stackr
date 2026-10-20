import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyRequest } from '../src/proxy.js';
import { matchRoute } from '../src/routes.js';
import { GatewayState } from '../src/state.js';

class MemoryNamespace {
  instances = new Map();

  getByName(name) {
    if (!this.instances.has(name)) {
      const values = new Map();
      const storage = {
        get: async (key) => structuredClone(values.get(key)),
        put: async (key, value) => values.set(key, structuredClone(value)),
      };
      this.instances.set(name, new GatewayState({ storage }));
    }
    const instance = this.instances.get(name);
    return { fetch: (request, init) => instance.fetch(new Request(request, init)) };
  }
}

function environment() {
  return {
    ENVIRONMENT: 'development',
    BACKEND_ORIGIN: 'https://backend.stackr.test',
    RECOGNITION_ORIGIN: 'https://recognition.stackr.test',
    RECOGNITION_SERVICE_SECRET: 'local-test-secret',
    GATEWAY_STATE: new MemoryNamespace(),
  };
}

function proxy(env, path, fetchImpl, method = 'GET') {
  const request = new Request(`https://api.stackr.test${path}`, { method });
  const route = matchRoute(new URL(request.url).pathname);
  assert.ok(route, `Expected a registered route for ${path}`);
  return proxyRequest({ request, route, env, requestId: 'local-circuit-test', fetchImpl });
}

const manifest = '/v1/assets/manifest?printingIds=11111111-1111-4111-8111-111111111111&limit=250';
const setCards = '/v1/sets/903d5baa-27c7-5690-b1d7-2395c770204a/cards?limit=24';
const search = '/v1/search?q=Pikachu&limit=100';
const pokemonCards = '/v1/pokemon/wartortle/cards?limit=24';
const circuitOpen = (error) => error.status === 503 && error.code === 'downstream_circuit_open';

test('five failed asset requests leave healthy card facts available while the asset circuit stays open', async () => {
  const env = environment();
  let assetCalls = 0;
  let factCalls = 0;
  const fetchImpl = async (url) => {
    if (new URL(url).pathname === '/v1/assets/manifest') {
      assetCalls += 1;
      return new Response(null, { status: 503 });
    }
    factCalls += 1;
    return Response.json({ cards: [{ id: 'printing-fact' }] });
  };
  for (let index = 0; index < 5; index += 1) {
    const path = index % 2 ? '/v1/assets/manifest?setId=903d5baa-27c7-5690-b1d7-2395c770204a' : manifest;
    assert.equal((await proxy(env, path, fetchImpl)).status, 503);
  }
  assert.equal(assetCalls, 10, 'GET retry behavior stays at two attempts per failed request');
  for (const path of [setCards, search, pokemonCards]) {
    assert.equal((await proxy(env, path, fetchImpl)).status, 200);
  }
  assert.equal(factCalls, 3);
  await assert.rejects(proxy(env, manifest, fetchImpl), circuitOpen);
  assert.equal(assetCalls, 10, 'healthy factual responses must not reset the open asset circuit');
  assert.equal(env.GATEWAY_STATE.instances.size, 2, 'asset query/card identity must not create new circuit groups');
});

test('backend fact failures still share their existing breaker without blocking assets', async () => {
  const env = environment();
  let factCalls = 0;
  let assetCalls = 0;
  const fetchImpl = async (url) => {
    if (new URL(url).pathname === '/v1/assets/manifest') {
      assetCalls += 1;
      return Response.json({ assets: [] });
    }
    factCalls += 1;
    return new Response(null, { status: 502 });
  };
  const before = Date.now();
  for (const path of [setCards, search, pokemonCards, setCards, search]) {
    assert.equal((await proxy(env, path, fetchImpl)).status, 502);
  }
  const after = Date.now();
  assert.equal(factCalls, 10);
  const state = await env.GATEWAY_STATE.instances.get('circuit:backend').storage.get('circuit');
  assert.equal(state.failures, 5, 'two GET attempts count as one failed request');
  assert.ok(state.openUntil >= before + 30_000 && state.openUntil <= after + 30_000);
  assert.equal((await proxy(env, manifest, fetchImpl)).status, 200);
  assert.equal(assetCalls, 1);
  await assert.rejects(proxy(env, pokemonCards, fetchImpl), circuitOpen);
  assert.equal(factCalls, 10, 'healthy asset responses must not reset the fact breaker');
});

test('asset transport errors keep retries and open the asset breaker after five requests', async () => {
  const env = environment();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new TypeError('local transport failure');
  };
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(proxy(env, manifest, fetchImpl), (error) => error.status === 502 && error.code === 'downstream_unavailable');
  }
  assert.equal(calls, 10);
  await assert.rejects(proxy(env, manifest, fetchImpl), circuitOpen);
  assert.equal(calls, 10);
  assert.equal((await proxy(env, search, async () => Response.json({ results: [] }))).status, 200);
});

test('recognition retains its target circuit and does not share backend or asset failures', async () => {
  const env = environment();
  let calls = 0;
  const failing = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await proxy(env, '/v1/recognition/identify', failing, 'POST')).status, 503);
  }
  assert.equal(calls, 5, 'POST requests retain one origin attempt');
  await assert.rejects(proxy(env, '/v1/recognition/identify', failing, 'POST'), circuitOpen);
  assert.equal(calls, 5);
  for (const path of [manifest, search]) {
    assert.equal((await proxy(env, path, async () => Response.json({ results: [] }))).status, 200);
  }
  assert.equal(env.GATEWAY_STATE.instances.size, 3);
});
