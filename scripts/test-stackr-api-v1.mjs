import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import createV1Router from '../backend/routes/v1.js';
import {
  ApiError,
  createCatalogueV1Service,
  normalizeSearchText,
  parseCursor,
  searchFixtureCatalogue,
  toCardSummary,
} from '../backend/lib/stackrApiV1.js';

const setId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const manifestEtag = '"stackr-v1-test-manifest"';

async function assertEnglishPresentationProjection() {
  const card = toCardSummary([{
    variant_id: variantId,
    canonical_key: 'pokemon:ja:11111111-1111-4111-8111-111111111111:157/165:normal',
    game_code: 'pokemon',
    language_code: 'ja',
    language_english_name: 'Japanese',
    language_native_name: '日本語',
    set_id: setId,
    set_code: 'SV2a',
    set_native_name: 'ポケモンカード151',
    set_english_display_name: 'Pokemon Card 151',
    printing_id: cardId,
    collector_number: '157/165',
    collector_number_sort_key: '000157/000165',
    card_native_name: 'リザードンex',
    card_english_display_name: 'リザードンex',
    concept_english_display_name: 'Charizard ex',
    supertype: 'Pokemon',
    subtypes: ['Stage 2', 'ex'],
    artist: '5ban Graphics',
    rarity_code: 'sr',
    rarity_label: 'Super Rare',
    variant_code: 'normal',
    variant_label: 'Normal',
    finish_code: 'normal',
    finish_label: 'Normal',
    artwork_key: 'sv2a-charizard-ex',
  }]);
  assert.equal(card.names.englishDisplay, 'Charizard ex');
  assert.equal(card.names.englishDisplaySource, 'concept');
  assert.equal(card.names.native, 'リザードンex');
  assert.deepEqual(card.details, {
    supertype: 'Pokemon',
    subtypes: ['Stage 2', 'ex'],
    artist: '5ban Graphics',
  });

  const migration = await readFile(
    new URL('../supabase/manual/20260824073736_expose_english_card_presentation.sql', import.meta.url),
    'utf8',
  );
  for (const predicate of [
    /with \(security_invoker = true\)/,
    /cv\.status = 'published'/,
    /cv\.deprecated_at is null/,
    /v\.deprecated_at is null/,
    /p\.deprecated_at is null/,
    /s\.deprecated_at is null/,
    /cc\.default_english_name as concept_english_display_name/,
  ]) {
    assert.match(migration, predicate);
  }
}

const fixture = {
  cards: [
    {
      cardId,
      variantId,
      canonicalId: 'pokemon:ja:11111111-1111-4111-8111-111111111111:157/165:normal',
      setId,
      setCode: 'SV2a',
      collectorNumber: '157/165',
      nativeName: 'リザードンex',
      englishDisplayName: 'Charizard ex',
      languageCode: 'ja',
      variantCode: 'normal',
    },
  ],
  names: [
    { nameType: 'native', name: 'リザードンex', cardId, variantId },
    { nameType: 'english_display', name: 'Charizard ex', cardId, variantId },
    { nameType: 'alias', name: 'Lizardon ex', cardId, variantId },
  ],
  externalIds: [
    { externalId: 'tcgdex:ja:sv2a:157', cardId, variantId },
  ],
};

async function assertPublishedCatalogueSources() {
  const source = await readFile(new URL('../backend/lib/stackrApiV1.js', import.meta.url), 'utf8');
  assert.match(source, /table\(supabase, 'api', 'published_catalogue_versions'\)/);
  assert.match(source, /table\(supabase, 'api', 'catalogue_languages'\)/);
  assert.match(source, /table\(supabase, 'api', 'catalogue_series'\)/);
  assert.match(source, /table\(supabase, 'api', 'catalogue_external_identifiers'\)/);
  assert.doesNotMatch(
    source,
    /table\(supabase, 'ingest', 'external_identifiers'\)/,
    'v1 search must use published external identifier snapshots, not live ingest records',
  );
}

async function assertAssetManifestServerClientIsolation() {
  const route = await readFile(new URL('../backend/routes/v1.js', import.meta.url), 'utf8');
  const selectorStart = route.indexOf('function getSupabaseServerKeyCandidate()');
  const selectorEnd = route.indexOf('\nfunction getSupabaseAdmin()', selectorStart);
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart, 'server-only Supabase key selector is missing');
  const selector = route.slice(selectorStart, selectorEnd);
  assert.match(
    selector,
    /\['SUPABASE_SECRET_KEY',[\s\S]+\['SUPABASE_SERVICE_ROLE_KEY'/,
    'the modern server secret must be preferred over the legacy service-role key',
  );
  assert.doesNotMatch(
    selector,
    /SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY/,
    'the asset client must never fall back to a public Supabase key',
  );

  const defaultServiceStart = route.indexOf('function defaultService()');
  const defaultServiceEnd = route.indexOf('\nfunction defaultPricingService()', defaultServiceStart);
  assert.ok(defaultServiceStart >= 0 && defaultServiceEnd > defaultServiceStart, 'default v1 service wiring is missing');
  const defaultService = route.slice(defaultServiceStart, defaultServiceEnd);
  assert.match(
    defaultService,
    /createCatalogueV1Service\(\{\s*supabase: getCatalogueSupabase\(\),\s*searchSupabase: getSearchSupabase\(\),\s*assetSupabase: getAssetSupabase\(\),\s*\}\)/,
    'server-key clients must be scoped to searchSupabase and assetSupabase only',
  );
  assert.doesNotMatch(
    defaultService,
    /supabase:\s*get(?:Search|Asset)Supabase\(/,
    'the default catalogue client must remain public-key scoped',
  );

  const searchService = await readFile(new URL('../backend/lib/stackrApiV1.js', import.meta.url), 'utf8');
  assert.match(searchService, /const searchSupabase = options\.searchSupabase \?\? supabase;/);
  const searchStart = searchService.indexOf('    async search(input = {}) {');
  const searchEnd = searchService.indexOf('\n  };', searchStart);
  assert.ok(searchStart >= 0 && searchEnd > searchStart, 'v1 search service is missing');
  const search = searchService.slice(searchStart, searchEnd);
  assert.match(search, /searchSetCodeCollector\(searchSupabase, parsed, limit, language\)/);
  assert.doesNotMatch(search, /searchSetCodeCollector\(supabase, parsed, limit, language\)/);

  const manifestView = await readFile(
    new URL('../supabase/migrations/20260810071807_add_stable_asset_manifest_cursor.sql', import.meta.url),
    'utf8',
  );
  for (const predicate of [
    /with \(security_invoker = true\)/,
    /cv\.status = 'published'/,
    /cv\.deprecated_at is null/,
    /a\.asset_visibility = 'public_catalogue'/,
    /a\.publicly_servable/,
    /a\.permission_status = 'approved'/,
    /a\.rights_status = 'approved'/,
    /a\.retention_status = 'active'/,
    /a\.deleted_at is null/,
    /a\.storage_provider <> 'unavailable'/,
  ]) {
    assert.match(manifestView, predicate, `asset manifest containment predicate is missing: ${predicate}`);
  }
}

async function assertSearchServerClientIsolation() {
  const publishedViews = await readFile(
    new URL('../supabase/migrations/20260801120000_language_catalogue_publication_snapshots.sql', import.meta.url),
    'utf8',
  );
  for (const predicate of [
    /create or replace view api\.catalogue_cards[\s\S]*?where cv\.status = 'published'[\s\S]*?v\.deprecated_at is null[\s\S]*?p\.deprecated_at is null/,
    /create or replace view api\.catalogue_card_names[\s\S]*?where n\.deprecated_at is null[\s\S]*?cv\.status = 'published'/,
    /create or replace view api\.catalogue_external_identifiers[\s\S]*?where cv\.status = 'published'[\s\S]*?cv\.deprecated_at is null/,
    /create or replace view api\.catalogue_sets[\s\S]*?where cv\.status = 'published'[\s\S]*?s\.deprecated_at is null/,
  ]) {
    assert.match(publishedViews, predicate, 'a server-key search view is missing its published-catalogue containment predicate');
  }

  const operations = [];
  let catalogueClientUsed = false;
  const supabase = {
    schema() {
      catalogueClientUsed = true;
      throw new Error('The public catalogue client must not execute search reads.');
    },
  };
  const row = {
    variant_id: variantId,
    canonical_key: 'pokemon:ja:11111111-1111-4111-8111-111111111111:157/165:normal',
    game_code: 'pokemon',
    language_code: 'ja',
    language_english_name: 'Japanese',
    language_native_name: '日本語',
    set_id: setId,
    set_code: 'SV2a',
    set_native_name: 'ポケモンカード151',
    set_english_display_name: 'Pokémon Card 151',
    printing_id: cardId,
    collector_number: '157/165',
    collector_number_sort: 157,
    collector_number_sort_key: '000000000157',
    card_native_name: 'リザードンex',
    card_english_display_name: 'Charizard ex',
    variant_code: 'normal',
  };
  const searchSupabase = {
    schema(schema) {
      assert.equal(schema, 'api');
      return {
        from(table) {
          const filters = [];
          const query = {
            select() { return this; },
            eq(column, value) { filters.push(['eq', column, value]); return this; },
            in(column, value) { filters.push(['in', column, value]); return this; },
            ilike(column, value) { filters.push(['ilike', column, value]); return this; },
            limit(value) { filters.push(['limit', value]); return this; },
            then(resolve, reject) {
              operations.push({ table, filters });
              const data = table === 'catalogue_sets'
                ? [{ set_id: setId, set_code: 'SV2a', language_code: 'ja' }]
                : table === 'catalogue_cards'
                  ? [row]
                  : [];
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
  const catalogue = createCatalogueV1Service({ supabase, searchSupabase });
  const result = await catalogue.search({ q: 'SV2a 157', language: 'ja', limit: 1 });
  assert.equal(catalogueClientUsed, false);
  assert.equal(result.results[0].reason, 'exact_set_code_collector_number');
  const cardSearch = operations.find((operation) => operation.table === 'catalogue_cards');
  assert.deepEqual(cardSearch?.filters.find(([name, column]) => name === 'in' && column === 'set_id'), ['in', 'set_id', [setId]]);
  assert.deepEqual(cardSearch?.filters.find(([name, column]) => name === 'eq' && column === 'collector_number'), ['eq', 'collector_number', '157']);
  assert.equal(operations.some((operation) => operation.table === 'catalogue_external_identifiers'), false);
}

async function assertAssetManifestCursorQuery() {
  const catalogueVersionId = '66666666-6666-4666-8666-666666666666';
  const firstAssetRowId = '77777777-7777-4777-8777-777777777777';
  const secondAssetRowId = '88888888-8888-4888-8888-888888888888';
  const operations = [];
  const rows = [firstAssetRowId, secondAssetRowId].map((assetRowId) => ({
    asset_id: assetRowId,
    asset_type: 'card_image',
    catalogue_version_id: catalogueVersionId,
    asset_row_id: assetRowId,
    permission_status: 'approved',
    storage_key: `catalogue/${assetRowId}.webp`,
  }));
  const query = {
    select(columns) { operations.push(['select', columns]); return this; },
    order(column, options) { operations.push(['order', column, options]); return this; },
    limit(value) { operations.push(['limit', value]); return this; },
    eq(column, value) { operations.push(['eq', column, value]); return this; },
    or(value) { operations.push(['or', value]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  let catalogueClientUsed = false;
  const supabase = {
    schema() {
      catalogueClientUsed = true;
      throw new Error('The public catalogue client must not execute asset manifest reads.');
    },
  };
  const assetSupabase = {
    schema(schema) {
      assert.equal(schema, 'api');
      return {
        from(table) {
          assert.equal(table, 'asset_manifest');
          return query;
        },
      };
    },
  };
  const catalogue = createCatalogueV1Service({
    supabase,
    assetSupabase,
    assetBaseUrl: 'https://api.stackrtcg.com',
  });
  const first = await catalogue.assetManifest({ limit: 1 });
  assert.equal(catalogueClientUsed, false);
  assert.equal(first.assets.length, 1);
  assert.deepEqual(parseCursor(first.pagination.nextCursor), {
    catalogueVersionId,
    assetRowId: firstAssetRowId,
  });
  assert.deepEqual(operations.filter(([name]) => name === 'order'), [
    ['order', 'catalogue_version_id', { ascending: true }],
    ['order', 'asset_row_id', { ascending: true }],
  ]);

  operations.length = 0;
  await catalogue.assetManifest({ limit: 1, cursor: first.pagination.nextCursor });
  assert.deepEqual(operations.find(([name]) => name === 'or'), [
    'or',
    `catalogue_version_id.gt.${catalogueVersionId},and(catalogue_version_id.eq.${catalogueVersionId},asset_row_id.gt.${firstAssetRowId})`,
  ]);
  await assert.rejects(
    () => catalogue.assetManifest({ cursor: Buffer.from('{}').toString('base64url') }),
    (error) => error instanceof ApiError && error.code === 'invalid_cursor',
  );
}

const service = {
  async health() {
    return {
      status: 'ok',
      service: 'stackr-api',
      apiVersion: '1',
      generatedAt: '2026-07-28T00:00:00.000Z',
    };
  },
  async ready() {
    return {
      status: 'ready',
      checks: {
        supabase: 'ok',
        latestChangeSequence: 7,
      },
      generatedAt: '2026-07-28T00:00:00.000Z',
    };
  },
  async manifest() {
    return {
      currentCatalogueVersion: 'test-catalogue-v1',
      catalogueVersionId: '44444444-4444-4444-8444-444444444444',
      minCompatibleAppSchemaVersion: '1',
      latestChangeSequence: 7,
      availableLanguageShards: [
        {
          languageCode: 'ja',
          bcp47Code: 'ja-JP',
          nativeName: '日本語',
          englishName: 'Japanese',
          shardPath: '/v1/sets?language=ja',
          deltaPath: '/v1/catalog/delta?language=ja',
        },
      ],
      assetBaseUrl: 'https://assets.stackr.app',
      modelIndexVersion: 'fixture-index-v1',
      generatedAt: '2026-07-28T00:00:00.000Z',
      etag: manifestEtag,
    };
  },
  async delta() {
    return {
      sinceChangeSequence: 0,
      changes: [
        {
          sequence: 7,
          operation: 'insert',
          entityType: 'card-printing',
          entityId: cardId,
          entityKey: 'pokemon:ja:sv2a:157/165:normal',
          changedAt: '2026-07-28T00:00:00.000Z',
          summary: { table: 'catalog.card_printings' },
        },
      ],
      pagination: {
        limit: 1,
        nextCursor: 'eyJjaGFuZ2VTZXF1ZW5jZSI6N30',
      },
    };
  },
  async languages() {
    return {
      languages: [
        {
          code: 'ja',
          bcp47Code: 'ja-JP',
          englishName: 'Japanese',
          nativeName: '日本語',
          scriptCode: 'Jpan',
          sortOrder: 20,
        },
      ],
    };
  },
  async series() {
    return {
      series: [
        {
          seriesId: '55555555-5555-4555-8555-555555555555',
          game: 'pokemon',
          languageCode: 'ja',
          nativeName: 'スカーレット&バイオレット',
          englishDisplayName: 'Scarlet & Violet',
          seriesCode: 'sv',
          releaseDate: '2023-01-20',
          endDate: null,
          displayOrder: 1,
          updatedAt: '2026-07-28T00:00:00.000Z',
        },
      ],
      pagination: { limit: 50, nextCursor: null },
    };
  },
  async sets() {
    return {
      sets: [stackrSet()],
      pagination: { limit: 50, nextCursor: null },
    };
  },
  async set(id) {
    if (id !== setId) throw new ApiError(404, 'set_not_found', 'Set was not found.');
    return { set: stackrSet() };
  },
  async setCards(id) {
    if (id !== setId) throw new ApiError(404, 'set_not_found', 'Set was not found.');
    return {
      cards: [stackrCard()],
      pagination: { limit: 120, nextCursor: null },
    };
  },
  async card(id) {
    if (id !== cardId && id !== variantId) throw new ApiError(404, 'card_not_found', 'Card was not found.');
    return { card: stackrCard() };
  },
  async cardVariants() {
    return {
      cardId,
      variants: stackrCard().variants,
    };
  },
  async search(input = {}) {
    const q = String(input.q ?? '').trim();
    if (q.length < 2) throw new ApiError(400, 'invalid_search_query', 'Search query must contain at least two characters.');
    const limit = Number(input.limit ?? 20);
    return {
      query: q,
      normalizedQuery: normalizeSearchText(q),
      results: searchFixtureCatalogue(q, fixture, {
        language: input.language,
        setId: input.setId,
        limit,
      }),
      pagination: { limit, nextCursor: null },
    };
  },
};

function stackrSet() {
  return {
    setId,
    game: 'pokemon',
    languageCode: 'ja',
    language: {
      englishName: 'Japanese',
      nativeName: '日本語',
    },
    seriesId: '55555555-5555-4555-8555-555555555555',
    seriesNativeName: 'スカーレット&バイオレット',
    seriesEnglishDisplayName: 'Scarlet & Violet',
    setCode: 'SV2a',
    nativeName: 'ポケモンカード151',
    englishDisplayName: 'Pokemon Card 151',
    releaseDate: '2023-06-16',
    printedTotal: 165,
    total: 210,
    regionCode: 'JP',
    updatedAt: '2026-07-28T00:00:00.000Z',
    sourceUpdatedAt: '2026-07-28T00:00:00.000Z',
  };
}

function stackrCard() {
  return {
    cardId,
    game: 'pokemon',
    languageCode: 'ja',
    language: {
      englishName: 'Japanese',
      nativeName: '日本語',
    },
    set: {
      setId,
      setCode: 'SV2a',
      nativeName: 'ポケモンカード151',
      englishDisplayName: 'Pokemon Card 151',
    },
    collectorNumber: {
      value: '157/165',
      prefix: null,
      sort: 157,
      suffix: null,
      sortKey: '000157/000165',
    },
    names: {
      native: 'リザードンex',
      englishDisplay: 'Charizard ex',
    },
    rarity: {
      code: 'sr',
      label: 'Super Rare',
    },
    defaultVariantId: variantId,
    variants: [
      {
        variantId,
        canonicalId: 'pokemon:ja:11111111-1111-4111-8111-111111111111:157/165:normal',
        variantCode: 'normal',
        variantLabel: 'Normal',
        finishCode: 'normal',
        finishLabel: 'Normal',
        artworkKey: 'sv2a-charizard-ex',
        nativeImageStatus: 'missing',
        sameArtworkAsVariantId: null,
        imageVariantId: variantId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
}

async function withServer(run) {
  await assertPublishedCatalogueSources();

  const app = express();
  app.use('/v1', createV1Router({ service }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function readJson(response) {
  return await response.json();
}

await assertAssetManifestCursorQuery();
await assertAssetManifestServerClientIsolation();
await assertSearchServerClientIsolation();

await assertEnglishPresentationProjection();

await withServer(async (baseUrl) => {
  const health = await fetch(`${baseUrl}/health`, {
    headers: { 'X-Request-Id': 'test-request-id' },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-stackr-api-version'), '1');
  const healthBody = await readJson(health);
  assert.equal(healthBody.data.status, 'ok');
  assert.equal(healthBody.meta.requestId, 'test-request-id');

  const manifest = await fetch(`${baseUrl}/catalog/manifest`);
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('etag'), manifestEtag);
  assert.match(manifest.headers.get('cache-control') ?? '', /public/);
  const manifestBody = await readJson(manifest);
  assert.equal(manifestBody.data.currentCatalogueVersion, 'test-catalogue-v1');
  assert.equal(manifestBody.data.etag, manifestEtag);

  const notModified = await fetch(`${baseUrl}/catalog/manifest`, {
    headers: { 'If-None-Match': manifestEtag },
  });
  assert.equal(notModified.status, 304);

  const delta = await fetch(`${baseUrl}/catalog/delta?since=0&limit=1`);
  assert.equal(delta.status, 200);
  const deltaBody = await readJson(delta);
  assert.equal(deltaBody.data.changes[0].operation, 'insert');
  assert.equal(deltaBody.meta.pagination.nextCursor, 'eyJjaGFuZ2VTZXF1ZW5jZSI6N30');

  const languages = await fetch(`${baseUrl}/languages`);
  assert.equal(languages.status, 200);
  assert.equal((await readJson(languages)).data.languages[0].code, 'ja');

  const sets = await fetch(`${baseUrl}/sets`);
  assert.equal(sets.status, 200);
  assert.equal((await readJson(sets)).data.sets[0].setCode, 'SV2a');

  const set = await fetch(`${baseUrl}/sets/${setId}`);
  assert.equal(set.status, 200);
  assert.equal((await readJson(set)).data.set.setId, setId);

  const cards = await fetch(`${baseUrl}/sets/${setId}/cards`);
  assert.equal(cards.status, 200);
  assert.equal((await readJson(cards)).data.cards[0].collectorNumber.value, '157/165');

  const card = await fetch(`${baseUrl}/cards/${cardId}`);
  assert.equal(card.status, 200);
  assert.equal((await readJson(card)).data.card.defaultVariantId, variantId);

  const variants = await fetch(`${baseUrl}/cards/${cardId}/variants`);
  assert.equal(variants.status, 200);
  assert.equal((await readJson(variants)).data.variants[0].variantCode, 'normal');

  const setCollectorSearch = await fetch(`${baseUrl}/search?q=${encodeURIComponent('SV2a 157')}`);
  assert.equal(setCollectorSearch.status, 200);
  const setCollectorSearchBody = await readJson(setCollectorSearch);
  assert.equal(setCollectorSearchBody.data.results[0].reason, 'exact_set_code_collector_number');

  const nativeSearch = await fetch(`${baseUrl}/search?q=${encodeURIComponent('リザードンex')}&language=ja`);
  assert.equal(nativeSearch.status, 200);
  assert.equal((await readJson(nativeSearch)).data.results[0].reason, 'exact_name');

  const aliasSearch = await fetch(`${baseUrl}/search?q=${encodeURIComponent('Lizardon ex')}&language=ja`);
  assert.equal(aliasSearch.status, 200);
  assert.equal((await readJson(aliasSearch)).data.results[0].reason, 'exact_alias');

  const invalidSearch = await fetch(`${baseUrl}/search?q=x`);
  assert.equal(invalidSearch.status, 400);
  assert.equal(invalidSearch.headers.get('cache-control'), 'no-store');
  assert.equal((await readJson(invalidSearch)).error.code, 'invalid_search_query');
});

const openApi = await readFile(new URL('../docs/stackr-api/openapi.v1.yaml', import.meta.url), 'utf8');
for (const path of [
  '/health',
  '/ready',
  '/catalog/manifest',
  '/catalog/delta',
  '/languages',
  '/series',
  '/sets',
  '/sets/{setId}',
  '/sets/{setId}/cards',
  '/cards/{cardId}',
  '/cards/{cardId}/variants',
  '/cards/{variantId}/price',
  '/cards/{variantId}/price-history',
  '/market/movers',
  '/market/opportunities',
  '/search',
  '/assets/manifest',
  '/assets/scans/presigned-upload',
  '/assets/scans/upload',
  '/recognition/identify',
  '/recognition/embed',
  '/recognition/feedback',
  '/admin/catalogue/cache/activate',
  '/admin/catalogue-ingestion/{command}',
  '/admin/assets/migrate-existing',
]) {
  assert.match(openApi, new RegExp(`^  ${path.replace(/[{}]/g, '\\$&')}:`, 'm'));
}
assert.match(openApi, /^openapi: 3\.1\.0/m);
assert.doesNotMatch(openApi, /\/rest\/v1/);
assert.match(openApi, /exact_set_code_collector_number/);
assert.match(openApi, /If-None-Match/);
assert.match(openApi, /\/assets\/manifest:[\s\S]+#\/components\/parameters\/Cursor/);

const client = await readFile(new URL('../lib/stackrApiV1.ts', import.meta.url), 'utf8');
const domainAdapter = await readFile(new URL('../lib/stackrDomainAdapter.ts', import.meta.url), 'utf8');
for (const method of [
  'health',
  'ready',
  'catalogManifest',
  'catalogDelta',
  'languages',
  'series',
  'sets',
  'set',
  'setCards',
  'card',
  'cardVariants',
  'cardPrice',
  'cardPriceHistory',
  'marketMovers',
  'marketOpportunities',
  'search',
  'recognitionIdentify',
  'recognitionEmbed',
  'recognitionFeedback',
]) {
  assert.match(client, new RegExp(`\\b${method}\\(`));
}
assert.match(client, /'X-Stackr-Device-Id': deviceId/);
assert.match(client, /Authorization: `Bearer \$\{accessToken\}`/);
assert.match(client, /assetManifest\([\s\S]+cursor\?: string \| null/);
assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|RECOGNITION_SERVICE_SECRET|BACKEND_ORIGIN_KEY/);
assert.match(domainAdapter, /client\.assetManifest\(\{ assetType, cursor, limit: 500 \}\)/);
assert.match(domainAdapter, /client\.assetManifest\(\{ setId, cursor, limit: 500 \}\)/);
assert.doesNotMatch(domainAdapter, /client\.assetManifest\(\{[^}]*limit:\s*1000/);
assert.match(openApi, /\/assets\/manifest:[\s\S]+#\/components\/parameters\/Cursor[\s\S]+#\/components\/parameters\/Limit/);
assert.match(openApi, /Limit:\s+[\s\S]*?name: limit[\s\S]*?maximum: 500/);

console.log('Stackr API v1 integration tests passed.');
