import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createCatalogueV1Service, encodeCursor } from '../lib/stackrApiV1.js';
import { publicCatalogueRead } from '../lib/traceContext.js';

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const card = {
  printing_id: id(1), variant_id: id(2), catalogue_version_id: id(3),
  set_id: id(4), set_code: 'fixture', language_code: 'en', game_code: 'pokemon',
  card_native_name: 'Celebi', card_english_display_name: 'Celebi', collector_number: '001',
  variant_code: 'normal', finish_code: 'normal',
};
const artwork = {
  asset_id: id(5), asset_row_id: id(5), catalogue_version_id: id(3),
  asset_type: 'card_image', printing_id: id(1), variant_id: id(2),
  storage_provider: 'external_reference', external_url: 'https://images.example/celebi.webp',
  permission_status: 'approved', source_attribution: 'Fixture verified source',
};

function fixture({ mode = 'success', factsError = null } = {}) {
  const facts = [];
  const images = [];
  const deferred = [];
  const client = (origin, fetch) => createClient(origin, 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  const supabase = client('https://facts.example', async (input) => {
    const url = new URL(String(input));
    facts.push(url);
    if (factsError) return new Response(JSON.stringify(factsError), { status: 400 });
    const data = url.pathname.endsWith('/catalogue_sets')
      ? { catalogue_version_id: id(3), language_code: 'en' } : [card];
    return new Response(JSON.stringify(data), { status: 200 });
  });
  const assetSupabase = client('https://assets.example', (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/card_image_manifest_for_identities');
    images.push({ signal: init.signal });
    if (mode === 'failure') return Promise.resolve(new Response(JSON.stringify({ code: '57014', message: 'Optional fixture artwork failure' }), { status: 400 }));
    if (mode === 'hang') return new Promise((resolve) => deferred.push(resolve));
    if (mode === 'body-hang') return Promise.resolve({
      ok: true, status: 200, statusText: 'OK', headers: new Headers(),
      text: () => new Promise((resolve) => deferred.push(resolve)),
    });
    return Promise.resolve(new Response(JSON.stringify([artwork]), { status: 200 }));
  });
  return { facts, images, deferred, service: createCatalogueV1Service({ supabase, assetSupabase, assetIdentityRpc: true }) };
}

test('facts-only fallback never reads artwork and keeps the scoped page', async () => {
  for (const includeAssets of [false, 0, 'false', '0', 'no', 'off', ' FALSE ']) {
    const f = fixture();
    const result = await f.service.setCards(id(4), {
      language: 'en', includeAssets, limit: 5, cursor: encodeCursor({ variant_id: id(0) }),
    });
    assert.equal(f.images.length, 0, `includeAssets=${JSON.stringify(includeAssets)} must remain facts-only after fast-path fallback`);
    assert.equal(result.cards[0].cardId, id(1));
    assert.equal(result.cards[0].variants[0].image, null);
    assert.deepEqual(result.pagination, { limit: 5, nextCursor: null });
    const read = f.facts.find((url) => url.pathname.endsWith('/catalogue_cards'));
    for (const [key, value] of Object.entries({ set_id: `eq.${id(4)}`, catalogue_version_id: `eq.${id(3)}`, language_code: 'eq.en', variant_id: `gt.${id(0)}`, limit: '6' })) {
      assert.equal(read.searchParams.get(key), value);
    }
  }
});

test('fallback keeps approved image delivery by default and for explicit opt-in', async () => {
  for (const includeAssets of [undefined, true, 1, 'true']) {
    const f = fixture();
    const result = await f.service.setCards(id(4), { includeAssets });
    assert.equal(f.images.length, 1);
    assert.equal(result.cards[0].variants[0].image.deliveryUrl, artwork.external_url);
    assert.equal(result.cards[0].variants[0].image.sourceAttribution, artwork.source_attribution);
  }
});

test('failed or stalled fallback artwork preserves successful facts with a bounded deadline', async () => {
  for (const mode of ['failure', 'hang', 'body-hang']) {
    const f = fixture({ mode });
    let watchdog;
    let result;
    try {
      result = await Promise.race([
        f.service.setCards(id(4)),
        new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('Optional artwork blocked fallback facts for 1.5 seconds.')), 1500); }),
      ]);
    } finally { clearTimeout(watchdog); }
    assert.equal(result.cards[0].cardId, id(1));
    assert.equal(result.cards[0].variants[0].image, null);
    assert.ok(f.images.every((request) => request.signal instanceof AbortSignal && request.signal.aborted));
    const snapshot = JSON.stringify(result);
    const count = f.images.length;
    for (const release of f.deferred) release(mode === 'body-hang'
      ? JSON.stringify(Array(1000).fill(artwork))
      : new Response(JSON.stringify(Array(1000).fill(artwork)), { status: 200 }));
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(f.images.length, count, 'A late aborted page cannot request more artwork');
    assert.equal(JSON.stringify(result), snapshot, 'Late artwork cannot mutate the returned facts');
  }
});

test('essential facts failures stay errors and do not launch fallback artwork', async () => {
  const f = fixture({ factsError: { code: '57014', message: 'Essential fixture facts failure' } });
  await assert.rejects(f.service.setCards(id(4)), (error) => error.code === '57014');
  assert.equal(f.images.length, 0);
});

test('a parent disconnect during optional fallback artwork remains a cancellation', async () => {
  const f = fixture({ mode: 'hang' });
  const req = Object.assign(new EventEmitter(), { headers: {} });
  const res = Object.assign(new EventEmitter(), { writableFinished: false });
  const result = new Promise((resolve, reject) => {
    publicCatalogueRead(req, res, () => f.service.setCards(id(4)).then(resolve, reject));
  });
  const cancelled = assert.rejects(result, (error) => error.name === 'AbortError');
  for (let attempt = 0; attempt < 20 && !f.images.length; attempt += 1) await new Promise(setImmediate);
  assert.equal(f.images.length, 1, 'The optional artwork read started after successful facts');
  req.emit('aborted');
  assert.ok(f.images[0].signal.aborted, 'The SDK image transport inherits the parent cancellation');
  f.deferred[0](new Response(JSON.stringify([artwork]), { status: 200 }));
  await cancelled;
});
