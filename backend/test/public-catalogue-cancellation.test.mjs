import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = process.env.STACKR_CANCELLATION_TEST_ROOT ?? fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(path.join(repo, 'backend/package.json'));
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const load = (name) => import(pathToFileURL(path.join(repo, `backend/${name}`)));
const { default: createV1Router } = await load('routes/v1.js');
const api = await load('lib/stackrApiV1.js');
const trace = await load('lib/traceContext.js');
const { fetchFastSetCards } = await load('lib/fastSetCards.js');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = {
  printing_id: id(1), variant_id: id(2), catalogue_version_id: id(3),
  canonical_key: 'pokemon:en:fixture:001:normal', game_code: 'pokemon',
  language_code: 'en', set_id: id(4), set_code: 'fixture',
  card_native_name: 'Mew', card_english_display_name: 'Mew',
  collector_number: '001', variant_code: 'normal', finish_code: 'normal',
};
const name = { name_type: 'native', name: 'Mew', normalized_name: 'mew',
  printing_id: id(1), variant_id: id(2), printing_language_code: 'en' };
const image = { asset_id: id(5), asset_row_id: id(5), catalogue_version_id: id(3),
  asset_type: 'card_image', game_code: 'pokemon', set_id: id(4), printing_id: id(1),
  variant_id: id(2), storage_provider: 'external_reference',
  external_url: 'https://images.example/verified-mew.webp', permission_status: 'approved',
  source_attribution: 'Fixture verified source' };
const searchPath = '/v1/search?q=Mew&language=en&limit=40';
const json = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers });

async function until(predicate, message, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(predicate(), message);
}

async function fixture(t, transport, routerOptions = {}) {
  const calls = [], contexts = [], responses = [], pending = new Set();
  let closing = false, settled = 0;
  const sdk = createClient('https://fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: trace.createTracedFetch(async (input, init) => {
      // Like native fetch, an already-aborted request never reaches the network.
      init.signal?.throwIfAborted();
      if (closing) return json([]);
      const call = { url: new URL(String(input)), signal: init.signal };
      calls.push(call);
      const hold = (body = false) => {
        const promise = new Promise((resolve, reject) => {
          const done = (callback, value) => {
            pending.delete(stop);
            init.signal?.removeEventListener('abort', abort);
            callback(value);
          };
          const abort = () => done(reject, init.signal.reason);
          const stop = () => done(resolve, body ? '[]' : json([]));
          pending.add(stop);
          init.signal?.addEventListener('abort', abort, { once: true });
        });
        if (!body) return promise;
        return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: () => promise };
      };
      return transport?.(call, hold, calls) ?? normal(call);
    }) },
  });
  const service = api.createCatalogueV1Service({ supabase: sdk, searchSupabase: sdk, assetSupabase: sdk, assetIdentityRpc: true });
  const wrapped = new Proxy(service, { get(target, key) {
    if (typeof target[key] !== 'function') return target[key];
    return async (...args) => {
      contexts.push(trace.currentTrace());
      try { return await target[key](...args); } finally { settled++; }
    };
  } });
  const app = express();
  app.use(trace.traceMiddleware());
  app.use((req, res, next) => {
    const entry = { req, res, writes: 0 };
    const original = res.json;
    res.json = function (...args) { entry.writes++; return original.apply(this, args); };
    responses.push(entry);
    next();
  });
  const options = typeof routerOptions === 'function' ? routerOptions(sdk) : routerOptions;
  app.use('/v1', createV1Router({ service: wrapped, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    closing = true;
    for (const stop of pending) stop();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { sdk, calls, contexts, responses, get settled() { return settled; },
    request(route = searchPath, headers = {}) {
      const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path: route, headers, agent: false });
      const result = new Promise((resolve, reject) => {
        req.on('error', reject);
        req.on('response', res => {
          let body = '';
          res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }));
        });
      });
      result.catch(() => {});
      return { req, result };
    },
  };
}

function normal({ url }) {
  const table = url.pathname.split('/').at(-1);
  return json(table === 'catalogue_card_names' ? [name]
    : table === 'catalogue_cards' ? [card]
      : table === 'catalogue_sets' ? { catalogue_version_id: id(3) }
        : table === 'card_image_manifest_for_identities' ? [image]
          : table === 'catalogue_set_card_rows' ? [{ card_row: card, image_row: image }] : []);
}

function assertFacts(result, withImage = true) {
  assert.equal(result.status, 200);
  const hit = result.body.data.results[0];
  assert.equal(hit.cardId, id(1)); assert.equal(hit.variantId, id(2));
  assert.equal(hit.languageCode, 'en'); assert.equal(hit.setId, id(4));
  assert.equal(hit.card.catalogueVersionId, id(3));
  assert.equal(hit.card.variants[0].finishCode, 'normal');
  assert.equal(hit.card.variants[0].image?.deliveryUrl ?? null, withImage ? image.external_url : null);
  if (withImage) assert.equal(hit.card.variants[0].image.sourceAttribution, image.source_attribution);
}

for (const body of [false, true]) {
  test(`public disconnect cancels essential SDK ${body ? 'body read' : 'request'} and prevents next strategy`, async (t) => {
    const f = await fixture(t, (_call, hold) => hold(body));
    const request = f.request();
    await until(() => f.calls.length === 1, 'Essential lookup started');
    request.req.destroy();
    await until(() => f.calls[0].signal?.aborted, 'Disconnected SDK work was aborted');
    await until(() => f.settled === 1, 'Service settled after SDK cancellation');
    assert.equal(f.calls.length, 1, 'No fallback strategy is dispatched');
    assert.equal(f.responses[0].writes, 0, 'Closed response is not written');
  });
}

test('disconnect during SDK 503 backoff prevents another network attempt', async (t) => {
  const f = await fixture(t, () => json({ message: 'fixture unavailable' }, 503, { 'Retry-After': '1' }));
  const request = f.request();
  await until(() => f.calls.length === 1, '503 lookup started');
  // The real SDK has consumed the immediate response and entered retry sleep.
  await new Promise(resolve => setTimeout(resolve, 30));
  request.req.destroy();
  await until(() => f.settled === 1, 'Abort interrupts SDK backoff', 350);
  assert.equal(f.calls.length, 1);
  assert.equal(f.responses[0].writes, 0);
});

test('same-identity concurrent request survives the other disconnect with approved imagery', async (t) => {
  const f = await fixture(t, (_call, hold, calls) => calls.length === 1 ? hold() : undefined);
  const first = f.request();
  await until(() => f.calls.length === 1, 'First identical request started');
  const second = f.request();
  first.req.destroy();
  assertFacts(await second.result);
  await until(() => f.settled === 2, 'Both independent service calls settled');
  assert.equal(f.contexts.length, 2);
  assert.notEqual(f.contexts[0].catalogueReadSignal, f.contexts[1].catalogueReadSignal);
  assert.equal(f.contexts[0].catalogueReadSignal.aborted, true);
  assert.equal(f.contexts[1].catalogueReadSignal.aborted, false);
  assert.equal(f.responses[0].writes, 0); assert.equal(f.responses[1].writes, 1);
});

test('normal finish preserves cache contract and removes disconnect listeners', async (t) => {
  const f = await fixture(t);
  const result = await f.request().result;
  assertFacts(result);
  assert.match(result.headers['cache-control'], /^public,/);
  assert.ok(result.headers.etag); assert.ok(result.headers['x-request-id']);
  assert.equal(f.contexts[0].catalogueReadSignal.aborted, false);
  await until(() => f.responses[0].res.writableFinished, 'Response finished');
  assert.equal(f.responses[0].req.listenerCount('aborted'), 0);
  assert.equal(f.responses[0].res.listenerCount('close'), 0);
  const cached = await f.request(searchPath, { 'If-None-Match': result.headers.etag }).result;
  assert.equal(cached.status, 304); assert.equal(cached.body, null);
});

test('optional artwork child deadline aborts image transport while parent facts remain usable', async (t) => {
  const f = await fixture(t, (call, hold) => call.url.pathname.endsWith('/card_image_manifest_for_identities') ? hold() : undefined);
  assertFacts(await f.request().result, false);
  const asset = f.calls.find(call => call.url.pathname.endsWith('/card_image_manifest_for_identities'));
  assert.equal(asset.signal.aborted, true);
  assert.equal(f.contexts[0].catalogueReadSignal.aborted, false);
});

test('parent disconnect also cancels optional artwork without publishing facts to a closed response', async (t) => {
  const f = await fixture(t, (call, hold) => call.url.pathname.endsWith('/card_image_manifest_for_identities') ? hold() : undefined);
  const request = f.request();
  await until(() => f.calls.some(call => call.url.pathname.endsWith('/card_image_manifest_for_identities')), 'Artwork read started');
  request.req.destroy();
  await until(() => f.settled === 1, 'Optional artwork parent abort propagates');
  assert.equal(f.calls.at(-1).signal.aborted, true);
  assert.equal(f.responses[0].writes, 0);
});

for (const disconnect of [false, true]) {
  test(`optional translation combines child and parent signals (${disconnect ? 'disconnect' : 'child expiry'})`, async (t) => {
    const f = await fixture(t, (call, hold) => {
      const table = call.url.pathname.split('/').at(-1);
      if (table === 'catalogue_cards' && call.url.searchParams.has('card_native_name')) return hold();
      if (table === 'catalogue_cards') return json([{ ...card, language_code: 'ja', card_native_name: 'ミュウ' }]);
      if (table === 'catalogue_card_names') return json([{ ...name, printing_language_code: 'ja' }]);
    });
    const request = f.request('/v1/search?q=Mew&language=ja&limit=40');
    await until(() => f.calls.some(call => call.url.searchParams.has('card_native_name')), 'Optional translation started');
    const translation = f.calls.find(call => call.url.searchParams.has('card_native_name'));
    if (disconnect) {
      request.req.destroy();
      await until(() => f.settled === 1, 'Parent abort escapes optional translation catch');
      assert.equal(f.responses[0].writes, 0);
      assert.equal(f.calls.some(call => call.url.pathname.endsWith('/card_image_manifest_for_identities')), false);
    } else {
      const result = await request.result;
      assert.equal(result.status, 200);
      assert.equal(result.body.data.results[0].languageCode, 'ja');
      assert.equal(result.body.data.results[0].card.names.native, 'ミュウ');
      assert.equal(f.contexts[0].catalogueReadSignal.aborted, false);
    }
    assert.equal(translation.signal.aborted, true);
  });
}

test('late noncooperative image page cannot dispatch another page after disconnect', async (t) => {
  let release;
  const f = await fixture(t, call => {
    if (call.url.pathname.endsWith('/card_image_manifest_for_identities')) {
      return new Promise(resolve => { release = resolve; });
    }
  });
  const request = f.request();
  await until(() => release, 'Noncooperative manifest page started');
  request.req.destroy();
  await until(() => f.calls.at(-1).signal?.aborted, 'Parent cancellation reached manifest');
  release(json(Array.from({ length: 1000 }, (_, index) => ({ ...image, asset_row_id: id(index + 10) }))));
  await until(() => f.settled === 1, 'Late page settled without continuation');
  assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/card_image_manifest_for_identities')).length, 1);
  assert.equal(f.responses[0].writes, 0);
});

test('actual fast-set fallback guard does not start the slower service after cancellation', async (t) => {
  let fallbacks = 0;
  const source = readFileSync(path.join(repo, 'backend/routes/v1.js'), 'utf8');
  const start = source.indexOf('async function defaultSetCards(');
  const end = source.indexOf('\nfunction defaultPricingService', start);
  assert.ok(start >= 0 && end > start);
  const f = await fixture(t, (_call, hold) => hold(), (sdk) => {
    // Exercise the actual default production fallback function with safe clients.
    const dependencies = { ...trace, ApiError: api.ApiError, fetchFastSetCards,
      getAssetSupabase: () => sdk, defaultService: () => ({ setCards() { fallbacks++; return { cards: [] }; } }),
      errorForLog: () => ({}), console };
    const getSetCards = new Function(...Object.keys(dependencies), `${source.slice(start, end)}; return defaultSetCards;`)(...Object.values(dependencies));
    return { getSetCards };
  });
  const request = f.request(`/v1/sets/${id(4)}/cards?includeAssets=false`);
  await until(() => f.calls.length === 1, 'Fast facts lookup started');
  request.req.destroy();
  await until(() => f.calls[0].signal?.aborted, 'Fast lookup was aborted');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fallbacks, 0); assert.equal(f.calls.length, 1);
  assert.equal(f.responses[0].writes, 0);
});

test('fast-set artwork and facts reads bind request signals and preserve exact cards', async (t) => {
  const f = await fixture(t, undefined, sdk => ({ getSetCards: (setId, query) => fetchFastSetCards(sdk, setId, query) }));
  for (const assets of [false, true]) {
    const result = await f.request(`/v1/sets/${id(4)}/cards?includeAssets=${assets}`).result;
    assert.equal(result.status, 200);
    assert.equal(result.body.data.cards[0].cardId, id(1));
    assert.equal(result.body.data.cards[0].set.setId, id(4));
  }
  assert.ok(f.calls.every(call => call.signal && !call.signal.aborted));
});

test('authenticated pricing route stays outside public catalogue cancellation scope', async (t) => {
  const f = await fixture(t, undefined, {
    env: { STACKR_PRICING_ACCESS_MODE: 'personal', STACKR_PRICING_OWNER_USER_ID: id(8) },
    getAuthenticatedUserId: async () => id(8),
    pricingService: { async price() {
      assert.equal(trace.currentTrace()?.catalogueReadSignal, undefined);
      return { fixture: true };
    } },
  });
  const result = await f.request(`/v1/cards/${id(2)}/price`, { Authorization: 'Bearer fixture-token' }).result;
  assert.equal(result.status, 200); assert.equal(result.body.data.fixture, true);
  assert.equal(result.headers['cache-control'], 'private, no-store');
});
