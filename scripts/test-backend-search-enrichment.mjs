import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const cardRow = {
  printing_id: id(1), variant_id: id(2), catalogue_version_id: id(3),
  canonical_key: 'pokemon:en:fixture:001:normal', game_code: 'pokemon',
  language_code: 'en', set_id: id(4), set_code: 'fixture',
  card_native_name: 'Celebi', card_english_display_name: 'Celebi',
  collector_number: '001', variant_code: 'normal', finish_code: 'normal',
};
const nameRow = {
  name_type: 'native', name: 'Celebi', normalized_name: 'celebi',
  printing_id: cardRow.printing_id, variant_id: cardRow.variant_id,
  language_code: 'en', printing_language_code: 'en',
};
const imageRow = {
  asset_id: id(5), asset_row_id: id(5), catalogue_version_id: id(3),
  asset_type: 'card_image', game_code: 'pokemon', set_id: id(4),
  printing_id: id(1), variant_id: id(2), storage_provider: 'external_reference',
  external_url: 'https://images.example/verified-celebi.webp',
  permission_status: 'approved', source_attribution: 'Fixture verified source',
};

function factsClient(calls, error = null, cards = [cardRow]) {
  return { schema(schema) {
    assert.equal(schema, 'api');
    return { from(table) {
      const filters = [];
      return {
        select() { return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        in(column, value) { filters.push([column, value]); return this; },
        ilike() { return this; }, order() { return this; }, limit() { return this; },
        then(resolve, reject) {
          calls.push(table);
          let data = table === 'catalogue_card_names' ? [nameRow]
            : table === 'catalogue_cards' ? cards : [];
          for (const [column, value] of filters) {
            data = data.filter((row) => Array.isArray(value) ? value.includes(row[column]) : row[column] === value);
          }
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
    } };
  } };
}

function fixture({ mode = 'success', rpc = true, rows = [imageRow], factsError = null, cards = [cardRow] } = {}) {
  const facts = [];
  const requests = [];
  const deferred = [];
  // Use the real SDK so abortSignal must reach the actual fetch, for both the
  // identity RPC and the legacy manifest projection. This never uses a network.
  const assetSupabase = createClient('https://assets.example', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch(input, init) {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://assets.example');
      assert.equal(url.pathname, rpc ? '/rest/v1/rpc/card_image_manifest_for_identities' : '/rest/v1/asset_manifest');
      requests.push({ url, signal: init.signal });
      if (mode === 'failure') {
        return Promise.resolve(new Response(JSON.stringify({ code: '57014', message: 'Fixture optional image failure' }), { status: 400 }));
      }
      if (mode === 'hang') {
        // Deliberately ignore cancellation to verify the deadline still settles
        // and a late page cannot launch another request or mutate returned facts.
        return new Promise((resolve, reject) => deferred.push({ resolve, reject }));
      }
      if (mode === 'body-hang') {
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', headers: new Headers(),
          text: () => new Promise((resolve, reject) => deferred.push({ resolve, reject })) });
      }
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    } },
  });
  const client = factsClient(facts, factsError, cards);
  return {
    api: createCatalogueV1Service({ supabase: client, searchSupabase: client, assetSupabase, assetIdentityRpc: rpc }),
    facts, requests, deferred,
  };
}

function assertFacts(result, operation) {
  if (operation === 'search') {
    assert.equal(result.results.length, 1);
    const hit = result.results[0];
    assert.equal(hit.reason, 'exact_name');
    assert.equal(hit.cardId, id(1));
    assert.equal(hit.variantId, id(2));
    assert.equal(hit.languageCode, 'en');
    assert.equal(hit.setId, id(4));
  }
  const card = operation === 'search' ? result.results[0].card : result.card;
  assert.equal(card.cardId, id(1));
  assert.equal(card.catalogueVersionId, id(3));
  assert.equal(card.set.setId, id(4));
  assert.equal(card.languageCode, 'en');
  assert.equal(card.defaultVariantId, id(2));
  assert.equal(card.names.native, 'Celebi');
  assert.equal(card.collectorNumber.value, '001');
  assert.equal(card.variants[0].finishCode, 'normal');
  return card.variants[0];
}

async function boundedRead(instance, operation) {
  let watchdog;
  try {
    return await Promise.race([
      operation === 'search' ? instance.api.search({ q: 'Celebi', language: 'en', limit: 40 }) : instance.api.card(id(1)),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`${operation}: successful card facts remained blocked by optional artwork for 1.5 seconds`)), 1500);
      }),
    ]);
  } finally { clearTimeout(watchdog); }
}

async function assertOptionalArtwork(operation) {
  for (const rpc of [true, false]) {
    const successful = fixture({ rpc });
    const image = assertFacts(await boundedRead(successful, operation), operation).image;
    assert.equal(image.deliveryUrl, imageRow.external_url);
    assert.equal(image.sourceAttribution, imageRow.source_attribution);
    assert.equal(image.permissionStatus, 'approved');

    const failed = fixture({ mode: 'failure', rpc });
    assert.equal(assertFacts(await boundedRead(failed, operation), operation).image, null,
      'An optional artwork failure preserves factual results with an honest missing image');

    const stalled = fixture({ mode: 'hang', rpc });
    const startedAt = performance.now();
    const result = await boundedRead(stalled, operation);
    assert.ok(performance.now() - startedAt < 1000, 'Optional artwork cannot consume a second after the facts are ready');
    assert.equal(assertFacts(result, operation).image, null);
    assert.ok(stalled.requests.length > 0);
    assert.ok(stalled.requests.every((request) => request.signal instanceof AbortSignal && request.signal.aborted),
      'The deadline must cancel the actual Supabase SDK fetches');
    const snapshot = JSON.stringify(result);
    const requestCount = stalled.requests.length;
    for (const request of stalled.deferred) request.resolve(new Response(JSON.stringify(Array(1000).fill(imageRow)), { status: 200 }));
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(JSON.stringify(result), snapshot, 'A late page cannot mutate returned factual results');
    assert.equal(stalled.requests.length, requestCount, 'An aborted enrichment cannot request the next manifest page');
  }

  const stalledBody = fixture({ mode: 'body-hang' });
  assert.equal(assertFacts(await boundedRead(stalledBody, operation), operation).image, null, 'The deadline includes response-body consumption');
  assert.ok(stalledBody.requests[0].signal.aborted);
  stalledBody.deferred[0].reject(new Error('Fixture late body rejection'));
  await new Promise(setImmediate);

  const sibling = fixture({ rows: [{ ...imageRow, variant_id: id(99) }] });
  assert.equal(assertFacts(await boundedRead(sibling, operation), operation).image, null, 'A sibling finish cannot supply the exact printing variant image');
  const unsafe = fixture({ rows: [{ ...imageRow, external_url: 'javascript:fixture' }] });
  assert.equal(assertFacts(await boundedRead(unsafe, operation), operation).image?.deliveryUrl ?? null, null,
    'Completed optional enrichment retains the existing safe-delivery policy');

  const failedFacts = fixture({ factsError: { code: '57014', message: 'Fixture essential facts failure' } });
  await assert.rejects(boundedRead(failedFacts, operation), (error) => error.code === '57014');
  assert.equal(failedFacts.requests.length, 0, 'Essential failures stay errors and do not launch optional artwork');
}

const warnings = [];
const originalWarn = console.warn;
try {
  console.warn = (message) => warnings.push(JSON.parse(message));
  for (const operation of ['search', 'card']) await assertOptionalArtwork(operation);
  const missingCard = fixture({ cards: [] });
  await assert.rejects(boundedRead(missingCard, 'card'), (error) => error.code === 'card_not_found');
  assert.equal(missingCard.requests.length, 0, 'A genuinely missing card remains a factual 404');
} finally { console.warn = originalWarn; }
assert.ok(warnings.length > 0);
assert.ok(warnings.every((warning) => warning.event === 'optional_card_artwork_failed'), 'Optional failures use a bounded, nonpersonal diagnostic');
console.log('Backend search and card detail preserve exact facts through optional artwork errors, deadlines and late bodies; actual SDK fetch cancellation, identity, provenance, essential errors and missing-card 404s pass.');
