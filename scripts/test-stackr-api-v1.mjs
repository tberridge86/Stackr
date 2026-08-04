import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import createV1Router from '../backend/routes/v1.js';
import {
  ApiError,
  normalizeSearchText,
  searchFixtureCatalogue,
} from '../backend/lib/stackrApiV1.js';

const setId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const manifestEtag = '"stackr-v1-test-manifest"';

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

const client = await readFile(new URL('../lib/stackrApiV1.ts', import.meta.url), 'utf8');
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
assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|RECOGNITION_SERVICE_SECRET|BACKEND_ORIGIN_KEY/);

console.log('Stackr API v1 integration tests passed.');
