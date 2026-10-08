import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import express from 'express';
import { ApiError, createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';
import createV1Router from '../backend/routes/v1.js';
const setId = '11111111-1111-4111-8111-111111111111';

async function assertBatchAssetManifestPrintingFilter() {
  const printingId = '99999999-9999-4999-8999-999999999991';
  const otherPrintingId = '99999999-9999-4999-8999-999999999992';
  const events = [];
  const catalogue = createCatalogueV1Service({
    supabase: createReadOnlyCatalogueSupabase({
      asset_manifest: [
        { asset_id: '99999999-9999-4999-8999-999999999901', asset_type: 'card_image', printing_id: printingId, permission_status: 'approved', storage_key: 'approved/a.webp' },
        { asset_id: '99999999-9999-4999-8999-999999999902', asset_type: 'card_image', printing_id: otherPrintingId, permission_status: 'approved', storage_key: 'approved/b.webp' },
      ],
    }, events),
    assetBaseUrl: 'https://assets.stackr.test',
  });
  const page = await catalogue.assetManifest({ printingIds: printingId, limit: 500 });
  assert.deepEqual(page.assets.map((asset) => asset.cardId), [printingId], 'a batch request may return only its requested canonical printing identities');
  assert.deepEqual(events.filter((event) => event.tableName === 'asset_manifest' && event.operation === 'in')
    .map((event) => [event.column, event.values]), [['printing_id', [printingId]]], 'batch artwork must be one bounded printing_id select');
  await assert.rejects(
    () => catalogue.assetManifest({ printingIds: 'not-a-uuid' }),
    (error) => error instanceof ApiError && error.code === 'invalid_printing_ids',
  );
  await assert.rejects(
    () => catalogue.assetManifest({ printingIds: Array.from({ length: 101 }, () => printingId).join(',') }),
    (error) => error instanceof ApiError && error.code === 'invalid_printing_ids',
  );
  await assert.rejects(
    () => catalogue.assetManifest({ printingId, printingIds: otherPrintingId }),
    (error) => error instanceof ApiError && error.code === 'ambiguous_printing_filter',
  );
}

function createReadOnlyCatalogueSupabase(tables, queryEvents = []) {
  class Query {
    constructor(tableName, rows) {
      this.tableName = tableName;
      this.rows = rows;
      this.filters = [];
      this.limitValue = null;
      this.single = false;
    }

    select(columns = '*') { queryEvents.push({ tableName: this.tableName, operation: 'select', columns }); return this; }
    order(column, options = {}) { this.orderBy = { column, ascending: options.ascending !== false }; return this; }
    eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
    gt(column, value) { this.filters.push((row) => row[column] > value); return this; }
    ilike(column, value) {
      queryEvents.push({ tableName: this.tableName, operation: 'ilike', column, value });
      const pattern = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      const matcher = new RegExp(`^${pattern}$`, 'i');
      this.filters.push((row) => matcher.test(String(row[column] ?? '')));
      return this;
    }
    in(column, values) {
      queryEvents.push({ tableName: this.tableName, operation: 'in', column, values: [...values] });
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    gte(column, value) { this.filters.push((row) => Number(row[column]) >= Number(value)); return this; }
    limit(value) { this.limitValue = value; return this; }
    maybeSingle() { this.single = true; return this; }
    then(resolve, reject) {
      const filtered = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orderBy) filtered.sort((left, right) => {
        const order = String(left[this.orderBy.column] ?? '').localeCompare(String(right[this.orderBy.column] ?? ''));
        return this.orderBy.ascending ? order : -order;
      });
      const data = this.single ? (filtered[0] ?? null) : (this.limitValue == null ? filtered : filtered.slice(0, this.limitValue));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }
  return {
    schema(schema) {
      assert.equal(schema, 'api');
      return {
        from(name) {
          return new Query(name, tables[name] ?? []);
        },
      };
    },
  };
}

async function assertPokemonCardsPagination() {
  const makeId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const names = Array.from({ length: 251 }, (_, index) => ({
    id: makeId(index + 1), printing_id: makeId(index + 501), language_code: 'en',
    name_type: index === 0 ? 'native' : index === 1 ? 'translated' : 'english_display',
    name: `Pikachu ${index + 1}`, normalized_name: `pikachu ${index + 1}`,
  }));
  names[1].language_code = 'ja';
  const cards = names.map((name, index) => ({
    printing_id: name.printing_id, variant_id: makeId(index + 1001),
    canonical_key: `pokemon:en:${setId}:${index + 1}:normal`, game_code: 'pokemon', language_code: 'en',
    set_id: setId, set_code: 'PK', set_native_name: 'Pikachu fixtures', collector_number: String(index + 1),
    collector_number_sort_key: String(index + 1).padStart(5, '0'), card_native_name: name.name,
    card_english_display_name: name.name, variant_code: 'normal',
  }));
  const catalogue = createCatalogueV1Service({
    supabase: createReadOnlyCatalogueSupabase({ catalogue_card_names: names, catalogue_cards: cards }),
  });
  const seen = new Set(); let cursor = null; let pages = 0;
  do {
    const page = await catalogue.pokemonCards('Pikachu', { cursor, limit: 120 });
    for (const card of page.cards) {
      assert.ok(!seen.has(card.cardId), 'each canonical printing must appear on exactly one client page');
      seen.add(card.cardId);
    }
    cursor = page.pagination.nextCursor;
    pages += 1;
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(seen.size, 251);
  assert.ok(seen.has(names[0].printing_id), 'native English card names must remain discoverable');
  assert.ok(seen.has(names[1].printing_id), 'published translated foreign names must remain discoverable');
  assert.deepEqual((await catalogue.pokemonCards('Mew', { limit: 120 })).cards, [], 'token matching must not include Mewtwo');
}

async function assertPokemonCardTypesAndEmptyPageContinuation() {
  const ids = Array.from({ length: 4 }, (_, index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  const catalogue = createCatalogueV1Service({
    supabase: createReadOnlyCatalogueSupabase({
      catalogue_card_names: ids.map((id) => ({ id, printing_id: id, name: 'Pikachu', normalized_name: 'pikachu', name_type: 'english_display' })),
      catalogue_cards: ids.map((id, index) => ({
        printing_id: id, variant_id: id, game_code: 'pokemon', language_code: 'en', set_id: setId,
        card_native_name: index === 0 ? 'Trainer fixture' : 'Pikachu', card_english_display_name: 'Pikachu',
        supertype: ['Trainer', 'Energy', 'Pokémon', null][index], variant_code: 'normal',
      })),
    }),
  });
  const first = await catalogue.pokemonCards('Pikachu', { limit: 1 });
  assert.deepEqual(first.cards, [], 'a misleading published alias cannot turn a Trainer into a species card');
  assert.ok(first.pagination.nextCursor, 'an empty filtered page must retain its opaque continuation');
  const next = await catalogue.pokemonCards('Pikachu', { cursor: first.pagination.nextCursor, limit: 3 });
  assert.deepEqual(next.cards.map((card) => card.cardId).sort(), ids.slice(2), 'exclude explicit Energy cards while retaining Pokémon and legacy unclassified species cards');
}

async function assertPokemonGenderSymbolLookup() {
  const printingId = '44444444-4444-4444-8444-444444444444';
  const events = [];
  const catalogue = createCatalogueV1Service({
    supabase: createReadOnlyCatalogueSupabase({
      catalogue_card_names: [{
        id: 'nidoran-symbol', printing_id: printingId, name: 'Nidoran♀',
        // Older source normalization omitted the glyph. The broad candidate
        // retrieval must still reach this row before form matching restores it.
        normalized_name: 'nidoran', name_type: 'native', language: 'en',
      }],
      catalogue_cards: [{
        printing_id: printingId, card_concept_id: printingId, set_id: setId,
        game_code: 'pokemon', language: 'en', set_code: 'PK', set_native_name: 'Gender fixtures',
        collector_number: '1', collector_number_sort_key: '000001', card_native_name: 'Nidoran♀',
        card_english_display_name: 'Nidoran♀', variant_code: 'normal',
      }],
    }, events),
  });
  const cards = await catalogue.pokemonCards('Nidoran-f', { limit: 20 });
  assert.equal(cards.cards.length, 1);
  assert.equal(cards.cards[0].cardId, printingId);
  assert.ok(events.some((event) => event.tableName === 'catalogue_card_names'
    && event.operation === 'ilike' && event.value === '%nidoran%'),
  'gender routes must include the ungendered normalized candidate in the source lookup');
}

async function assertPokemonCardsRetainHighVariantPrintings() {
  const makeId = (index) => `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const crowdedPrintingId = '33333333-3333-4333-8333-333333333333';
  const otherPrintingId = '33333333-3333-4333-8333-333333333334';
  const names = [
    { id: makeId(1), printing_id: crowdedPrintingId, name: 'Pikachu', normalized_name: 'pikachu', name_type: 'english_display' },
    { id: makeId(2), printing_id: otherPrintingId, name: 'Pikachu', normalized_name: 'pikachu', name_type: 'english_display' },
  ];
  const crowdedVariants = Array.from({ length: 1001 }, (_, index) => ({
    printing_id: crowdedPrintingId, variant_id: makeId(index + 100), canonical_key: `pokemon:en:${setId}:crowded:${index}`,
    game_code: 'pokemon', language_code: 'en', set_id: setId, set_code: 'PK', set_native_name: 'Variant fixtures',
    collector_number: '1', collector_number_sort_key: '000001', card_native_name: 'Pikachu', card_english_display_name: 'Pikachu', variant_code: `variant-${index}`,
  }));
  const otherVariant = {
    printing_id: otherPrintingId, variant_id: makeId(2000), canonical_key: `pokemon:en:${setId}:other`,
    game_code: 'pokemon', language_code: 'en', set_id: setId, set_code: 'PK', set_native_name: 'Variant fixtures',
    collector_number: '2', collector_number_sort_key: '000002', card_native_name: 'Pikachu', card_english_display_name: 'Pikachu', variant_code: 'normal',
  };
  const catalogue = createCatalogueV1Service({
    supabase: createReadOnlyCatalogueSupabase({ catalogue_card_names: names, catalogue_cards: [...crowdedVariants, otherVariant] }),
  });
  const page = await catalogue.pokemonCards('Pikachu', { limit: 20 });
  const crowded = page.cards.find((card) => card.cardId === crowdedPrintingId);
  assert.equal(page.cards.length, 2, 'all matched printings survive a high-variant neighbour');
  assert.equal(crowded?.variants.length, 1001, 'all variants for a matched printing are read before name-source pagination advances');
}

async function withV1Server(service, run) {
  const app = express();
  app.use('/v1', createV1Router({ service }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function assertPokemonRouteEnvelope() {
  const calls = [];
  const service = {
    pokemonCards(name, query) {
      calls.push({ name, query });
      return Promise.resolve({ cards: [], pagination: { limit: 120, nextCursor: null } });
    },
  };
  await withV1Server(service, async (origin) => {
    const response = await fetch(`${origin}/v1/pokemon/Pikachu/cards?limit=120`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.cards, []);
    assert.equal(body.meta.pagination.limit, 120);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'Pikachu');
  assert.equal(calls[0].query.limit, '120', 'the Express v1 route must forward the query unchanged to the canonical service');
}

async function assertAssetManifestIdentityRpc() {
  const printingId = '99999999-9999-4999-8999-999999999991';
  const versionId = '88888888-8888-4888-8888-888888888881';
  const assetA = '77777777-7777-4777-8777-777777777771';
  const assetB = '77777777-7777-4777-8777-777777777772';
  const calls = [];
  const rpcRows = [assetA, assetB].map((asset_row_id) => ({
    asset_id: asset_row_id, asset_row_id, catalogue_version_id: versionId,
    asset_type: 'card_image', printing_id: printingId, permission_status: 'approved',
    storage_key: `cards/${asset_row_id}.webp`,
  }));
  const assetSupabase = {
    schema(schema) {
      assert.equal(schema, 'api');
      return {
        rpc(name, args) {
          assert.equal(name, 'card_image_manifest_for_identities');
          calls.push(args);
          return Promise.resolve({ data: args.p_after_asset_id ? [rpcRows[1]] : rpcRows, error: null });
        },
      };
    },
  };
  const catalogue = createCatalogueV1Service({ supabase: assetSupabase, assetSupabase, assetIdentityRpc: true });
  const first = await catalogue.assetManifest({ assetType: 'card_image', printingIds: printingId, limit: 1 });
  assert.deepEqual(first.assets.map((asset) => asset.cardId), [printingId]);
  assert.deepEqual(calls[0].p_variant_ids, []);
  assert.deepEqual(calls[0].p_printing_ids, [printingId]);
  const cursor = JSON.parse(Buffer.from(first.pagination.nextCursor, 'base64url').toString('utf8'));
  const second = await catalogue.assetManifest({ assetType: 'card_image', printingIds: printingId, limit: 1, cursor: first.pagination.nextCursor });
  assert.equal(second.assets[0].assetId, assetB);
  assert.equal(calls[1].p_after_version_id, cursor.catalogueVersionId);
  assert.equal(calls[1].p_after_asset_id, cursor.assetRowId);
  await assert.rejects(
    () => catalogue.assetManifest({ assetType: 'card_image', printingIds: printingId, cursor: Buffer.from('{}').toString('base64url') }),
    (error) => error instanceof ApiError && error.code === 'invalid_cursor',
  );
}


await assertBatchAssetManifestPrintingFilter();
await assertPokemonCardsPagination();
await assertPokemonCardTypesAndEmptyPageContinuation();
await assertPokemonGenderSymbolLookup();
await assertPokemonCardsRetainHighVariantPrintings();
await assertPokemonRouteEnvelope();
await assertAssetManifestIdentityRpc();
console.log("Pokédex pagination, complete variants, strict species, and asset batch tests passed.");

const invalidIdEvents = [];
const invalidIdService = createCatalogueV1Service({ supabase: createReadOnlyCatalogueSupabase({}, invalidIdEvents) });
await assert.rejects(() => invalidIdService.assetManifest({ printingId: "not-a-uuid" }), (error) => error instanceof ApiError && error.code === "invalid_printing_id");
assert.equal(invalidIdEvents.length, 0, "invalid single identities must fail before any catalogue read");

const publishedReaderEvents = [];
const publishedReaderId = '44444444-4444-4444-8444-444444444444';
const publishedReader = createReadOnlyCatalogueSupabase({
  catalogue_card_names: [{ id: publishedReaderId, printing_id: publishedReaderId, name: 'Pikachu', normalized_name: 'pikachu', name_type: 'native' }],
  catalogue_cards: [{ printing_id: publishedReaderId, variant_id: publishedReaderId, game_code: 'pokemon', language_code: 'en', set_id: setId, card_native_name: 'Pikachu', variant_code: 'normal' }],
}, publishedReaderEvents);
const dedicatedReaderService = createCatalogueV1Service({
  supabase: { schema() { throw new Error('species search must use its existing published-search reader'); } },
  searchSupabase: publishedReader,
});
assert.equal((await dedicatedReaderService.pokemonCards('Pikachu', { limit: 120 })).cards[0].cardId, publishedReaderId);
assert.deepEqual([...new Set(publishedReaderEvents.map(e => e.tableName))].sort(), ['catalogue_card_names', 'catalogue_cards'], 'the search reader must access only explicitly published API views');
