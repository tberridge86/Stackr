import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { createClient } from '@supabase/supabase-js';
import { createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';
import { publicCatalogueRead, traceMiddleware } from '../backend/lib/traceContext.js';
import { SEARCH_IDENTITY_RPC, SEARCH_PIPELINE_REVISION } from '../backend/lib/catalogueSearchPagination.js';
import { findNativeCardNamesForEnglishQuery } from '../backend/lib/cardNameTranslations.js';
import { createSearchDatabase, id, proposal } from './test-fixtures/search-pagination-db.mjs';

const fixture = await createSearchDatabase();
const { db } = fixture;
function transport({ cap = 500, missing = false, fail = false, corrupt = null, stall = false, translationFailure = false, translationStall = false } = {}) {
  const calls = [], pending = [];
  const state = { missing, fail, corrupt, stall, translationFailure, translationStall };
  const client = createClient('https://fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://fixture.invalid', 'this test cannot contact a provider');
      const category = url.pathname.startsWith('/rest/v1/rpc/') ? 'rpc' : 'table';
      const name = url.pathname.split('/').at(-1);
      calls.push({ category, name, signal: init.signal });
      if (category === 'rpc') {
        if (name !== SEARCH_IDENTITY_RPC) return Response.json([]);
        if (state.missing) return Response.json({ code: 'PGRST202', message: 'Could not find api.' + SEARCH_IDENTITY_RPC }, { status: 404 });
        if (state.fail) return Response.json({ code: '42501', message: 'Fixture denied' }, { status: 403 });
        const args = JSON.parse(init.body);
        if (args.p_selector.kind === 'nativeTranslation' && state.translationFailure) return Response.json({ code: '42501', message: 'Fixture optional alias denied' }, { status: 403 });
        if (state.stall || (args.p_selector.kind === 'nativeTranslation' && state.translationStall)) return new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Fixture abort'), { name: 'AbortError' })), { once: true });
        });
        const data = await fixture.page(args.p_selector, args.p_after, args.p_limit, args.p_expected_revision, args.p_exclude_selector);
        if (state.corrupt && data.entries.length) {
          if (state.corrupt === 'duplicate') data.entries.push(data.entries[0]);
          if (state.corrupt === 'language') data.entries[0].cardRow.language_code = 'ko';
          if (state.corrupt === 'variant') data.entries[0].cardRow.variant_id = id(99999);
        }
        return Response.json(data);
      }
      if (name === 'asset_manifest') return Response.json([]);
      assert.ok(['catalogue_cards', 'catalogue_sets', 'catalogue_card_names', 'catalogue_card_collectors', 'catalogue_external_identifiers'].includes(name));
      const where = [], values = [];
      for (const [column, value] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(column)) continue;
        assert.match(column, /^[a-z_]+$/);
        if (value.startsWith('eq.')) {
          values.push(value.slice(3)); where.push('"' + column + '"::text=$' + values.length);
        } else if (value.startsWith('gt.')) {
          values.push(value.slice(3)); where.push('"' + column + '"::text>$' + values.length);
        } else if (value.startsWith('ilike.')) {
          values.push(value.slice(6)); where.push('"' + column + '"::text ilike $' + values.length);
        } else if (value.startsWith('in.(')) {
          values.push(value.slice(4, -1).split(',')); where.push('"' + column + '"::text=any($' + values.length + '::text[])');
        } else throw new Error('Unsupported fixture predicate');
      }
      const limit = Math.min(cap, Number(url.searchParams.get('limit') ?? 1000));
      const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map(value => {
        const [column, direction] = value.split('.'); assert.match(column, /^[a-z_]+$/);
        return '"' + column + '" ' + (direction === 'desc' ? 'desc' : 'asc');
      });
      const result = await db.query('select * from api.' + name + (where.length ? ' where ' + where.join(' and ') : '')
        + (order.length ? ' order by ' + order.join(',') : '') + ' limit ' + limit, values);
      return Response.json(result.rows);
    } },
  });
  return { state, calls, pending, api: createCatalogueV1Service({ supabase: client, searchSupabase: client,
    assetSupabase: client, assetIdentityRpc: true, collectorIdentityLookup: true }) };
}
async function collect(api, query, maximum = 100) {
  const results = [], cursors = new Set();
  let cursor = null;
  for (let page = 0; page < maximum; page++) {
    const response = await api.search({ ...query, cursor });
    assert.equal(response.pagination.continuationAvailable, true);
    results.push(...response.results);
    cursor = response.pagination.nextCursor;
    if (!cursor) return { results, pages: page + 1 };
    assert.ok(!cursors.has(cursor), 'every page must advance'); cursors.add(cursor);
  }
  throw new Error('Fixture paging budget exceeded');
}
function identities(results) { return results.filter(r => r.type === 'card').map(r => r.variantId); }
function exactVariantCards(results) {
  for (const result of results.filter(r => r.type === 'card')) {
    assert.equal(result.card.defaultVariantId, result.variantId);
    assert.deepEqual(result.card.variants.map(v => v.variantId), [result.variantId]);
  }
}
try {
  await fixture.seed({ count: 137 });
  const legacy = transport({ missing: true });
  const bounded = await legacy.api.search({ q: 'Fixturemon', language: 'en', limit: 50 });
  assert.equal(bounded.results.length, 50);
  assert.equal(bounded.pagination.nextCursor, null);
  assert.equal(bounded.pagination.continuationAvailable, false, 'an absent function is explicitly unavailable, not complete');
  const ordinary = transport();
  const current = await collect(ordinary.api, { q: 'Fixturemon', language: 'en', limit: 50 });
  assert.equal(current.results.length, 137); assert.equal(current.pages, 3);
  assert.equal(new Set(identities(current.results)).size, 137);
  exactVariantCards(current.results);
  console.log('PASS actual backend + actual SDK + local SQL: legacy 50/no continuation -> 137 exact variants over 3 pages.');

  const seeded = await fixture.seed({ count: 601, multilingual: true, finishes: 2 });
  for (const cap of [17, 50, 100, 500]) {
    const h = transport({ cap });
    const complete = await collect(h.api, { q: 'Fixturemon', limit: 50 });
    assert.equal(complete.results.length, 1202);
    assert.equal(new Set(identities(complete.results)).size, 1202);
    assert.deepEqual(new Set(identities(complete.results)), new Set(seeded.variants.map(v => v.id)));
    assert.equal(new Set(complete.results.map(r => r.languageCode)).size, 5);
    assert.ok(complete.results.every(r => r.reason === 'exact_name'));
    exactVariantCards(complete.results);
  }
  const scoped = await collect(transport({ cap: 17 }).api, { q: 'Fixturemon', language: 'ja', setId: id(101), limit: 17 });
  assert.ok(scoped.results.every(r => r.languageCode === 'ja' && r.setId === id(101)));
  assert.equal(scoped.results.length, seeded.variants.filter(v => v.language_code === 'ja').length);
  const fuzzy = await collect(transport({ cap: 17 }).api, { q: 'Fixture', limit: 50 });
  assert.equal(fuzzy.results.length, 1202);
  assert.ok(fuzzy.results.every(r => r.reason === 'fuzzy_name'));
  assert.equal(new Set(identities(fuzzy.results)).size, 1202, 'repeated native/alias name rows must not consume the identity page');
  const variantOnly = await collect(transport({ cap: 17 }).api, { q: 'Finishmon reverse_holo', limit: 50 });
  assert.equal(variantOnly.results.length, 601);
  assert.ok(variantOnly.results.every(r => r.variantCode === 'reverse_holo' && r.reason === 'exact_alias'));
  const collector = await collect(transport({ cap: 17 }).api, { q: 'fixture1 0002', language: 'ja', limit: 50 });
  assert.equal(collector.results.length, 2);
  assert.ok(collector.results.every(r => r.reason === 'exact_set_code_collector_number' && r.setId === id(101)));
  for (const q of ['fixture1 0002', 'fixture1-0002']) {
    const selected = await collect(transport({ cap: 17 }).api, { q, setId: id(101), limit: 50 });
    assert.equal(selected.results.length, 2);
    assert.ok(selected.results.every(r => r.setId === id(101) && r.languageCode === 'ja'));
  }
  console.log('PASS 1,202 unique multilingual/finish identities, printing-only + variant-only names, duplicate aliases, scoped collector and REST caps 17/50/100/500.');

  await fixture.seed({ count: 3, finishes: 2 });
  await db.exec('reset role');
  await db.query('delete from catalog.catalogue_version_printings where printing_id=$1', [id(1000)]);
  await fixture.insert('card_variants', [{ id: id(999111), printing_id: id(1001), set_id: id(100), game_code: 'pokemon', language_code: 'en',
    variant_code: 'unpublished', finish_code: 'normal', canonical_key: 'pokemon:en:fixture1:unpublished' }]);
  await db.exec('set role service_role');
  const membership = await collect(transport().api, { q: 'Fixturemon', language: 'en', limit: 50 });
  assert.equal(membership.results.length, 4, 'printing-only names require published printing membership');
  assert.ok(!identities(membership.results).includes(id(999111)), 'unpublished sibling variants cannot consume the identity page');
  const variantMembership = await collect(transport().api, { q: 'Finishmon reverse_holo', language: 'en', limit: 50 });
  assert.equal(variantMembership.results.length, 3, 'a variant-only name uses its own publication membership');
  const selector = { kind: 'name', normalized: 'fixturemon', nameTypes: ['native'], language: 'en' };
  const utc = await fixture.page(selector);
  await db.exec("set timezone='America/New_York'");
  const alternateTimezone = await fixture.page(selector, null, 50, utc.revision);
  assert.equal(alternateTimezone.revision, utc.revision, 'revision must not depend on the pooled session timezone');
  await db.exec("set timezone='UTC'");
  console.log('PASS physical-name selector preserves printing/variant publication boundaries and timezone-independent revisions.');

  await fixture.seed({ count: 1 });
  await db.exec('reset role');
  await fixture.insert('sets', [{ id: id(100000), game_code: 'pokemon', language_code: 'en', set_code: 'collision', native_name: 'Collision set' }]);
  await fixture.insert('catalogue_version_sets', [{ catalogue_version_id: id(200), language_code: 'en', set_id: id(100000), set_code: 'collision' }]);
  await fixture.insert('catalogue_version_external_identifiers', [
    { catalogue_version_id: id(200), source_entity_type: 'card_variant', external_id: 'collision-ref', language_code: 'en', variant_id: id(100000), confidence: 1 },
    { catalogue_version_id: id(200), source_entity_type: 'set', external_id: 'collision-ref', language_code: 'en', set_id: id(100000), confidence: 1 },
  ]);
  await db.exec('set role service_role');
  const sameUuid = await collect(transport().api, { q: 'collision-ref', limit: 50 });
  assert.deepEqual(sameUuid.results.map(r => r.type), ['card', 'set']);
  const sameUuidPaged = await collect(transport().api, { q: 'collision-ref', limit: 1 });
  assert.equal(sameUuidPaged.pages, 2);
  assert.deepEqual(sameUuidPaged.results.map(r => [r.type, r.variantId ?? r.setId]), [['card', id(100000)], ['set', id(100000)]]);
  console.log('PASS external card/set composite identities survive equal UUIDs within and across pages.');

  await fixture.seed({ count: 1 });
  await db.exec('reset role');
  for (let index = 0; index < 40; index++) {
    const set = id(700000 + index), printing = id(710000 + index), variant = id(720000 + index);
    await fixture.insert('sets', [{ id: set, game_code: 'pokemon', language_code: 'en', set_code: 'crowded1', native_name: 'Synthetic duplicate code' }]);
    await fixture.insert('catalogue_version_sets', [{ catalogue_version_id: id(200), set_id: set, language_code: 'en', set_code: 'crowded1' }]);
    await fixture.insert('card_printings', [{ id: printing, game_code: 'pokemon', language_code: 'en', set_id: set, collector_number: '002', native_name: 'Crowdedmon' }]);
    await fixture.insert('card_variants', [{ id: variant, game_code: 'pokemon', language_code: 'en', set_id: set, printing_id: printing, variant_code: 'normal', finish_code: 'normal', canonical_key: 'pokemon:en:crowded1:' + index }]);
    await fixture.insert('catalogue_version_variants', [{ catalogue_version_id: id(200), set_id: set, printing_id: printing, variant_id: variant, language_code: 'en' }]);
  }
  await db.exec('set role service_role');
  const crowded = await collect(transport({ cap: 17 }).api, { q: 'crowded1 002', limit: 17 });
  assert.equal(crowded.results.length, 40, 'set-code lookup must not silently stop at25or an effective17row cap');
  assert.equal(new Set(crowded.results.map(r => r.setId)).size, 40);
  console.log('PASS complete ordered set-code resolution across40 matching sets with server cap17.');

  const translatedPopulation = await fixture.seed({ count: 122, multilingual: true, finishes: 2,
    nativeName: 'ピカチュウ', englishName: 'Pikachu', translationOnly: true });
  // One Japanese printing also has a stored English name. It must appear once,
  // in the stored stream, rather than reappearing on a translation cursor.
  await db.exec('reset role');
  await fixture.insert('card_names', [{ id: id(999001), language_code: 'en', name_type: 'english_display',
    name: 'Pikachu', normalized_name: 'pikachu', printing_id: id(1001), variant_id: null,
    source_confidence: 1, updated_at: '2026-10-26T00:00:00Z' }]);
  await db.exec('set role service_role');
  const translated = transport({ cap: 17 });
  const translatedFirst = await translated.api.search({ q: 'Pikachu', limit: 17 });
  assert.equal(translatedFirst.results[0].matchedNameType, 'native');
  assert.equal(translatedFirst.results[1].matchedNameType, 'published_english_translation');
  assert.equal(translatedFirst.results[2].matchedNameType, 'native');
  assert.equal(translatedFirst.results[3].matchedNameType, 'published_english_translation');
  const translatedAll = await collect(translated.api, { q: 'Pikachu', limit: 17 });
  const expectedTranslated = translatedPopulation.variants.filter(v => ['en', 'ja'].includes(v.language_code));
  assert.deepEqual(new Set(identities(translatedAll.results)), new Set(expectedTranslated.map(v => v.id)));
  assert.equal(translatedAll.results.length, expectedTranslated.length);
  assert.ok(translatedAll.results.some(r => r.reason === 'exact_translated_name'));
  assert.ok(translatedAll.results.every(r => r.reason === 'exact_name' || r.reason === 'exact_translated_name'));
  exactVariantCards(translatedAll.results);
  for (const failure of ['translationFailure', 'translationStall']) {
    const optional = transport({ [failure]: true });
    const usable = await optional.api.search({ q: 'Pikachu', limit: 17 });
    assert.equal(usable.results.length, 17, 'optional translation failure must preserve stored-name facts');
    assert.equal(usable.pagination.continuationAvailable, false, 'a failed optional union cannot claim exhaustion');
    assert.equal(usable.pagination.nextCursor, null);
    if (failure === 'translationStall') assert.ok(optional.calls.some(c => c.signal?.aborted));
  }
  translated.state.translationFailure = true;
  await assert.rejects(translated.api.search({ q: 'Pikachu', limit: 17, cursor: translatedFirst.pagination.nextCursor }),
    e => e.status === 503 && e.code === 'search_pagination_unavailable');
  translated.state.translationFailure = false;
  const translatedRetry = await translated.api.search({ q: 'Pikachu', limit: 17, cursor: translatedFirst.pagination.nextCursor });
  assert.ok(translatedRetry.results.every(r => !identities(translatedFirst.results).includes(r.variantId)));
  console.log('PASS verified translation/stored-name round-robin across odd pages, cross-stream dedup, optional deadline/denial and cursor retry.');
  await fixture.seed({ count: 601, multilingual: true, finishes: 2 });

  const pageClient = transport(), query = { q: 'Fixturemon', language: 'en', limit: 50 };
  const first = await pageClient.api.search(query), cursor = first.pagination.nextCursor;
  assert.ok(cursor);
  for (const changes of [{ q: 'Othermon' }, { language: 'ja' }, { setId: id(101) }, { limit: 17 }]) {
    await assert.rejects(pageClient.api.search({ ...query, ...changes, cursor }), e => e.status === 400 && e.code === 'invalid_search_cursor');
  }
  for (const change of [{ pipeline: '0'.repeat(64) }, { strategy: 'unknown' }, { base: { after: { entityType: 'card', entityId: 'not-uuid' }, done: false } }]) {
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url')), ...change })).toString('base64url');
    await assert.rejects(pageClient.api.search({ ...query, cursor: changed }), e => e.status === 400);
  }
  assert.ok(SEARCH_PIPELINE_REVISION.length === 64);
  pageClient.state.missing = true;
  await assert.rejects(pageClient.api.search({ ...query, cursor }), e => e.status === 503 && e.code === 'search_pagination_unavailable');
  pageClient.state.missing = false;
  pageClient.state.fail = true;
  await assert.rejects(pageClient.api.search({ ...query, cursor }));
  pageClient.state.fail = false;
  const retry = await pageClient.api.search({ ...query, cursor });
  assert.ok(retry.results.every(r => !identities(first.results).includes(r.variantId)));
  await db.exec("reset role; update catalog.catalogue_versions set updated_at='2026-10-27T00:00:00Z'; set role service_role;");
  await assert.rejects(pageClient.api.search({ ...query, cursor }), e => e.status === 409 && e.code === 'search_catalogue_changed');
  const beforeAlgorithmChange = await pageClient.api.search(query);
  await db.exec('reset role; ' + proposal.replace('with\nselectors', '-- Local test-only algorithm definition change\nwith\nselectors') + '; set role service_role;');
  await assert.rejects(pageClient.api.search({ ...query, cursor: beforeAlgorithmChange.pagination.nextCursor }),
    e => e.status === 409 && e.code === 'search_catalogue_changed');
  await db.exec('reset role; ' + proposal + '; set role service_role;');
  console.log('PASS query/algorithm/strategy/key binding, missing-function and denied-page retry, revision-change rejection.');

  for (const corruption of ['duplicate', 'language', 'variant']) {
    const h = transport({ corrupt: corruption });
    await assert.rejects(h.api.search(query), e => e.status === 502 && e.code === 'invalid_search_page');
  }
  const stalled = transport({ stall: true }), req = Object.assign(new EventEmitter(), { headers: {} });
  const res = Object.assign(new EventEmitter(), { setHeader() {} });
  let pending;
  traceMiddleware()(req, res, () => publicCatalogueRead(req, res, () => { pending = stalled.api.search(query); }));
  const rejected = assert.rejects(pending);
  for (let i = 0; i < 10 && !stalled.pending.length; i++) await new Promise(setImmediate);
  req.emit('aborted'); await rejected;
  assert.ok(stalled.calls.some(c => c.name === SEARCH_IDENTITY_RPC && c.signal?.aborted));
  console.log('PASS malformed/foreign/duplicate identities fail closed; caller cancellation reaches actual SDK fetch.');

  for (const role of ['anon', 'authenticated']) {
    await db.exec('reset role; set role ' + role);
    await assert.rejects(fixture.page({ kind: 'name', normalized: 'fixturemon', nameTypes: ['native'] }), e => e.code === '42501');
  }
  await db.exec('reset role; set role service_role');
  assert.ok(findNativeCardNamesForEnglishQuery('ex').filter(m => m.language === 'ja').length > 80,
    'the verified static candidate map must not silently stop after 80 names');
  console.log('PASS service-only invoker grants; static candidate enumeration is not silently capped.');
} finally { await db.close(); }
