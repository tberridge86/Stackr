import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as ownership from '../lib/pokedexCollectionCore';

let clock = 100_000;
class FixtureDate extends Date { static now() { return clock; } }
let physical = true;
let ownershipFixture: Record<string, any[]> | null = null;
let failOwnershipPage = false;
const pages: [string, string | null, number][] = [];
const writes: string[] = [];
const filters: [string, unknown][] = [];
let artworkReads = 0;
let finishArtwork!: (response: any) => void;
let missing = false;
const artwork = new Promise<any>((resolve) => { finishArtwork = resolve; });
const factual = { cardId: 'card-a', defaultVariantId: 'variant-a' };
const assetRequests: Array<{ printingIds?: string[]; cursor?: string | null; limit?: number; assetType?: string }> = [];
const pokemonRequests: { name: string; cursor: string | null; limit: number }[] = [];
let pokemonResponses: Array<() => Promise<any>> = [async () => ({ data: { cards: [factual] }, meta: {} })];
let cardNameRows = new Map<string, any>();
let localSearchRows = new Map<string, any[]>();
const localSearchTerms: string[] = [];
const legacy = (id: string, images = false) => ({ id, name: 'Pikachu', language: 'en', set_id: 'set-a',
  raw_data: { set: { id: 'set-a', name: 'Native set' }, images: images
    ? { small: 'https://example.test/thumb.webp', large: 'https://example.test/detail.webp' } : {} } });
const query = (table: string) => {
  let after: string | null = null;
  let limit = 1000;
  let binderIds: string[] | null = null;
  const equalities: [string, unknown][] = [];
  const chain: any = {
    select: () => chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); equalities.push([key, value]); return chain; },
    is: (key: string, value: null) => { filters.push([key, value]); equalities.push([key, value]); return chain; },
    in: (column: string, values: string[]) => { if (column === 'binder_id') {
      assert.ok(values.length <= 100, 'Binder filters remain bounded'); binderIds = values;
    } else if (column === 'id') assert.ok(values.length <= 100, 'Binder mutation filters remain bounded'); return chain; },
    order: (column: string, options: any) => { assert.equal(column, 'id'); assert.equal(options.ascending, true); return chain; },
    limit: (size: number) => { limit = size; return chain; },
    gt: (column: string, value: string) => { assert.equal(column, 'id'); after = value; return chain; },
    update: () => { throw new Error('Pokédex markers must never change binder or physical inventory'); },
    upsert: (value: any) => { assert.equal(table, 'user_pokedex_cards'); assert.equal(value.user_id, 'owner-a'); writes.push(`${table}:upsert`); return chain; },
    delete: () => { writes.push(`${table}:delete`); return chain; },
    then: (resolve: (value: unknown) => unknown) => {
      pages.push([table, after, limit]);
      return Promise.resolve({
      data: ownershipFixture ? (ownershipFixture[table] ?? [])
        .filter((row) => (!after || row.id > after) && (!binderIds || binderIds.includes(row.binder_id))
          && equalities.every(([key, value]) => !(key in row) || row[key] === value)).slice(0, limit)
        : table === 'binders' ? [{ id: 'binder-a' }]
        : table === 'user_card_variants' ? physical ? [{ id: 'variant-a' }] : [] : [],
      error: failOwnershipPage && table === 'user_card_variants' && after?.endsWith('0499')
        ? new Error('Ownership page unavailable') : null,
    }).then(resolve); },
  };
  return chain;
};
const exports = {} as typeof import('../lib/pokedexCollection');
const mocks: Record<string, unknown> = {
  './cardSearch': { searchLocalPokemonCards: async (term: string) => {
    localSearchTerms.push(term);
    return localSearchRows.get(term) ?? [];
  } },
  './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }) }, from: query } },
  './pokemonDisplayNames': { getPreferredCardDisplayName: (input: any) => input.fallbackName ?? 'Pikachu', getEnglishCardDisplayName: (input: any) => input.englishDisplayName ?? null,
    getPreferredSetDisplayName: () => 'Native set', getEnglishSetDisplayName: () => null },
  './stackrDomainAdapter': {
    fetchStackrCardRows: async () => cardNameRows,
    stackrCardToLegacyCard: (card: any, assets: any[] = []) => {
      const variantIds = new Set([card.defaultVariantId, ...(card.variants ?? []).flatMap((variant: any) => [variant.variantId, variant.imageVariantId, variant.sameArtworkAsVariantId])]);
      return legacy(card.cardId, assets.some((asset) => asset.cardId === card.cardId || variantIds.has(asset.variantId)));
    },
    fetchStackrSetRows: async () => new Map([['set-a', { name: 'Native set', englishDisplayName: 'Approved set' }]]),
    fetchStackrPriceSnapshots: async () => new Map([['card-a', { market_central: 12 }]]),
  },
  './stackrApiV1': { stackrApiClient: { pokemonCards: async (name: string, request: { cursor: string | null; limit: number }) => {
    pokemonRequests.push({ name, ...request });
    const response = pokemonResponses.shift();
    if (!response) throw new Error('Unexpected Pokémon page request');
    return response();
  }, assetManifest: async (request: any) => {
    artworkReads += 1;
    assetRequests.push(request);
    if (request.printingIds?.length === 1 && request.printingIds[0] === 'card-a') return artwork;
    if (missing) return { data: { assets: [] }, meta: {} };
    const ids: string[] = request.printingIds ?? [];
    return { data: { assets: ids.map((cardId) => ({ assetId: `asset-${cardId}`, assetType: 'card_image', cardId: null, variantId: cardId.replace(/^card-/, 'variant-').replace(/^visible-/, 'visible-variant-'), deliveryUrl: `https://example.test/${cardId}.webp` })) }, meta: {} };
  } } },
  './pokedexCollectionCore': ownership,
};
runInNewContext(ts.transpileModule(readFileSync('lib/pokedexCollection.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, Date: FixtureDate, console,
  require: (name: string) => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; } });
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function testReviewedSpeciesAliasesAndOwnership() {
  const backendMatcher = {} as { matchesPokedexSpeciesName: (route: string, title: string) => boolean };
  runInNewContext(ts.transpileModule(readFileSync('backend/lib/pokedexCards.js', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: backendMatcher });
  const cases: [string, string, boolean][] = [
    ['pikachu', 'Pikachu ex', true], ['mr-mime', "Sabrina’s Mr. Mime", true],
    ['nidoran-f', 'Nidoran♀', true], ['nidoran-m', 'Nidoran♂', true],
    ['nidoran-f', 'Nidoran Female', true], ['nidoran-m', 'Nidoran Male', true],
    ['nidoran-f', 'Nidoran♂', false], ['nidoran-m', 'Nidoran♀', false],
    ['nidoran-f', 'Nidoran', false], ['nidoran-m', 'Nidoran', false],
    ['raichu', 'Raichu', true], ['raichu-alola', 'Alolan Raichu ex', true], ['raichu-alola', 'Raichu', false],
    ['raichu-alola', 'Raichu Alola', true], ['raichu-future', 'Alolan Raichu', false],
    ['deoxys-normal', 'Deoxys', true], ['deoxys-normal', 'Deoxys V', true],
    ['deoxys-normal', 'Deoxys Normal Forme', true], ['deoxys-normal', 'Deoxys Attack Forme', false],
    ['deoxys-normal', 'Speed Forme Deoxys', false], ['deoxys-normal', 'Deoxys Cosmic Forme', false],
    ['deoxys-normal', 'Cosmic Deoxys', false], ['deoxys-normal', 'Future Deoxys', false],
    ['deoxys-normal', 'Origin Deoxys V', false],
    ['deoxys-normal', 'Deoxys Future', false], ['deoxys-attack', 'Deoxys', false],
    ['deoxys-attack', 'Deoxys Attack Forme', true], ['deoxys-defense', 'Deoxys Defense Forme', true],
    ['giratina-altered', 'Giratina', false], ['wormadam-plant', 'Wormadam', false],
    ['deoxys-future', 'Deoxys', false], ['mew', 'Mewtwo', false], ['mew', 'Mew ex', true],
    ['ピカチュウ', 'ピカチュウ', true], ['皮卡丘', '皮卡丘', true], ['皮卡丘', '雷丘', false],
    ['pikachu', 'ピカチュウ', false], ['pikachu', '皮卡丘', false], ['future-species', 'Pikachu', false],
  ];
  for (const [route, title, expected] of cases) {
    assert.equal(exports.pokemonNameMatchesCardName(route, title), expected, `${route} / ${title}: mobile ownership matching`);
    assert.equal(backendMatcher.matchesPokedexSpeciesName(route, title), expected, `${route} / ${title}: backend/mobile parity`);
  }
  cardNameRows = new Map([
    ['female', { id: 'female', name: 'Nidoran♀', language: 'en' }],
    ['male', { id: 'male', name: 'Nidoran♂', language: 'en' }],
    ['alolan-ja', { id: 'alolan-ja', name: 'アローラライチュウ', english_display_name: 'Alolan Raichu', language: 'ja' }],
    ['alolan-zh', { id: 'alolan-zh', name: '阿羅拉雷丘', english_display_name: 'Alolan Raichu', language: 'zh-tw' }],
    ['default', { id: 'default', name: 'Deoxys', language: 'en' }],
  ]);
  ownershipFixture = {
    binders: [{ id: 'binder-a', user_id: 'owner-a' }],
    user_card_variants: [{ id: 'physical-female', card_id: 'female', set_id: 'set-a' }],
    binder_cards: [{ id: 'binder-male', binder_id: 'binder-a', card_id: 'male', set_id: 'set-a', owned: true }],
    user_pokedex_cards: ['alolan-ja', 'alolan-zh', 'default'].map((card_id) => ({ id: `marker-${card_id}`, card_id, set_id: 'set-a' })),
  };
  const names = await exports.fetchOwnedPokemonNameSet();
  for (const [route, expected] of [['nidoran-f', true], ['nidoran-m', true], ['raichu-alola', true],
    ['deoxys-normal', true], ['deoxys-attack', false], ['raichu-future', false]] as const) {
    assert.equal([...names].some((name) => exports.pokemonNameMatchesCardName(route, name)), expected,
      `${route}: actual owned-name service and list matcher must agree`);
  }
  ownershipFixture = null;
  cardNameRows = new Map();
  for (const [route, title] of [['raichu-alola', 'Alolan Raichu'], ['deoxys-normal', 'Deoxys']]) {
    localSearchTerms.length = 0;
    localSearchRows = new Map([[title, [{ id: 'legacy-alias', name: title, language: 'en' },
      { id: 'legacy-unrelated', name: route === 'raichu-alola' ? 'Raichu' : 'Deoxys Attack Forme', language: 'en' }]]]);
    pokemonResponses = [async () => { throw new Error('Older API has no species route'); }];
    const fallback = await exports.fetchCardsForPokemon(route);
    assert.ok(localSearchTerms.includes(title), `${route}: the legacy search consumer must use its reviewed title alias`);
    assert.deepEqual(Array.from(fallback.cards, (card) => card.id), ['legacy-alias'],
      `${route}: the legacy fallback must retain the alias while excluding other forms`);
    assert.equal(fallback.complete, false, 'a hard-capped legacy lookup remains explicitly incomplete');
  }
  localSearchRows = new Map();
  pokemonResponses = [async () => ({ data: { cards: [factual] }, meta: {} })];
}

function testScreenKnownNameDataflow() {
  const source = readFileSync('app/pokemon/[id].tsx', 'utf8');
  assert.match(source, /const nextPokemon = routePokemon \?\? await metadata;/,
    'A known route name selects card facts without awaiting PokeAPI metadata');
  assert.match(source, /void metadata\.then\(\(details\) =>/,
    'Metadata remains a late optional screen update for known routes');
  assert.match(source, /fetchCardsForPokemon\(nextPokemon\.name, \{ onProgress: applyCards \}\)/,
    'The screen consumes progressive factual card publications');
}

async function run() {
  await testReviewedSpeciesAliasesAndOwnership();
  testScreenKnownNameDataflow();
  await assert.rejects(exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: 'set-a' }, false), /collection card controls/);
  assert.equal(writes.length, 0, 'Physical ownership blocks all manual/binder removals');
  assert.ok(filters.some(([key, value]) => key === 'user_id' && value === 'owner-a'));
  pages.length = 0;
  ownershipFixture = Object.fromEntries(['binders', 'user_card_variants', 'binder_cards', 'user_pokedex_cards'].map((table) => [table,
    Array.from({ length: 1001 }, (_, i) => ({ id: `${table}-${String(i).padStart(4, '0')}`,
      card_id: `${table}-card-${i}`, set_id: 'set-a', binder_id: `binders-${String(i).padStart(4, '0')}`, owned: true })),
  ]));
  const owned = await exports.fetchOwnedPokedexCards();
  assert.equal(owned.size, 3003, 'All physical, binder and manual ownership pages are retained');
  for (const table of ['binders', 'user_card_variants', 'user_pokedex_cards']) {
    assert.deepEqual(pages.filter(([name]) => name === table).map(([, after, size]) => [after, size]),
      [[null, 500], [`${table}-0499`, 500], [`${table}-0999`, 500]], `${table} uses bounded stable cursors`);
  }
  assert.equal(pages.filter(([name]) => name === 'binder_cards').length, 11, 'Large binder filters split into 100-ID chunks');
  assert.ok(filters.some(([key, value]) => key === 'owned' && value === true));
  failOwnershipPage = true;
  await assert.rejects(exports.fetchOwnedPokedexCards(), /Ownership page unavailable/,
    'A failed later page cannot masquerade as a complete ownership result');
  failOwnershipPage = false;
  ownershipFixture.user_card_variants = [];
  ownershipFixture.binder_cards = ownershipFixture.binder_cards.map((row) => ({ ...row, card_id: 'card-a' }));
  await assert.rejects(exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: 'set-a' }, false), /collection card controls/);
  assert.equal(writes.length, 0, 'Binder inventory blocks marker removal before any writes');
  await exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: 'set-a' }, true);
  assert.deepEqual(Array.from(writes), ['user_pokedex_cards:upsert'], 'Mark collected changes only the manual marker');
  writes.length = 0;
  ownershipFixture.binder_cards = ownershipFixture.binder_cards.map((row) => ({ ...row, owned: false }));
  filters.length = 0;
  await exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: 'set-a' }, false);
  assert.deepEqual(Array.from(writes), ['user_pokedex_cards:delete'], 'Manual-only removal never changes binder rows');
  assert.ok(filters.some(([key, value]) => key === 'set_id' && value === 'set-a'));
  assert.ok(filters.some(([key, value]) => key === 'user_id' && value === 'owner-a'));
  writes.length = 0;
  filters.length = 0;
  await exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: null }, false);
  assert.ok(filters.some(([key, value]) => key === 'set_id' && value === null), 'Null-set markers have an explicit null identity filter');
  writes.length = 0;
  await assert.rejects(exports.setPokedexCardOwned({ id: 'card-a', name: 'Pikachu', set_id: null }, true), /verified set/);
  assert.equal(writes.length, 0, 'Unresolved set identity cannot create non-idempotent null-set markers');
  ownershipFixture = null;
  failOwnershipPage = false;
  const phases: any[] = [];
  const result = await exports.fetchCardsForPokemon('Pikachu', { onProgress: (phase) => phases.push(phase) });
  assert.equal(result.complete, true, 'Facts complete while artwork is still pending');
  await tick();
  assert.equal(phases.at(-1).cards[0].estimated_value, 12);
  assert.equal(phases.at(-1).cards[0].set_english_name, 'Approved set');
  finishArtwork({ data: { assets: [{ assetId: 'asset-card-a', assetType: 'card_image', cardId: null, variantId: 'variant-a', deliveryUrl: 'https://example.test/card-a.webp' }] }, meta: {} });
  await tick();
  assert.equal(phases.at(-1).cards[0].image_small, 'https://example.test/thumb.webp');
  assert.equal(phases.at(-1).cards[0].estimated_value, 12, 'Late thumbnails preserve earlier prices');
  assert.equal(phases.at(-1).cards[0].set_english_name, 'Approved set', 'Late thumbnails preserve earlier set names');

  const uncached = { id: 'card-b', name: 'Pikachu', canonical_card: { cardId: 'card-b', defaultVariantId: 'variant-b' } } as any;
  missing = true;
  await exports.hydratePokedexCardArtwork([uncached]);
  const reads = artworkReads;
  await exports.hydratePokedexCardArtwork([uncached]);
  assert.equal(artworkReads, reads, 'Missing artwork has a short negative cache');
  clock += 30_001; missing = false;
  const recovered = await exports.hydratePokedexCardArtwork([uncached]);
  assert.equal(artworkReads, reads + 1, 'A missing image is retryable after its short TTL');
  assert.equal(recovered[0].image_urls?.[0], 'https://example.test/thumb.webp', 'Visible image candidates prefer thumbnails');

  assetRequests.length = 0;
  const visible = Array.from({ length: 24 }, (_, index) => ({
    id: `visible-${index}`, name: 'Pikachu', set_id: `set-${index}`,
    canonical_card: { cardId: `visible-${index}`, defaultVariantId: `visible-variant-${index}` },
  })) as any[];
  const visibleHydrated = await exports.hydratePokedexCardArtwork(visible);
  assert.equal(assetRequests.length, 1, 'Visible cards from distinct sets use one printing batch, not per-set manifests');
  assert.deepEqual(Array.from(assetRequests[0].printingIds ?? []), visible.map((card) => card.canonical_card.cardId), 'The manifest request carries exactly the visible canonical printing IDs');
  assert.equal(assetRequests[0].assetType, 'card_image');
  assert.equal(assetRequests[0].limit, 100);
  assert.ok(visibleHydrated.every((card: any) => card.image_small), 'Variant-only assets hydrate their matching canonical facts');
  const pageOne = Array.from({ length: 24 }, (_, index) => ({ cardId: `page-one-${index}`, defaultVariantId: `variant-one-${index}` }));
  const pageTwo = [pageOne[0], { cardId: 'page-two-unique', defaultVariantId: 'variant-two-unique' }];
  let finishSecondPage!: (response: any) => void;
  const secondPage = new Promise<any>((resolve) => { finishSecondPage = resolve; });
  pokemonRequests.length = 0;
  pokemonResponses = [
    async () => ({ data: { cards: pageOne }, meta: { pagination: { nextCursor: 'opaque-next-page' } } }),
    async () => secondPage,
  ];
  const progressivePhases: any[] = [];
  const progressiveLoad = exports.fetchCardsForPokemon('Pikachu', { onProgress: (phase) => progressivePhases.push(phase) });
  await tick();
  assert.deepEqual(pokemonRequests.map((request) => [request.cursor, request.limit]),
    [[null, 24], ['opaque-next-page', 120]], 'The first factual species page is small; opaque continuation pages remain exhaustive');
  const firstFactualPublication = progressivePhases.find((phase) => phase.cards.length === 24 && !phase.complete);
  assert.ok(firstFactualPublication, 'The first 24 factual cards publish while the later page is pending');
  assert.equal(new Set(firstFactualPublication.cards.map((card: any) => card.id)).size, 24, 'The first page has canonical identities');
  finishSecondPage({ data: { cards: pageTwo }, meta: { pagination: { nextCursor: null } } });
  const progressiveResult = await progressiveLoad;
  assert.equal(progressiveResult.complete, true);
  assert.equal(progressiveResult.cards.length, 25, 'A duplicate from a later opaque page is deduplicated without dropping its unique neighbour');
  assert.ok(progressiveResult.cards.some((card) => card.id === 'page-two-unique'), 'The completed collection retains later-page cards');

  pokemonRequests.length = 0;
  pokemonResponses = [
    async () => ({ data: { cards: pageOne }, meta: { pagination: { nextCursor: 'opaque-failing-page' } } }),
    async () => { throw new Error('Later species page unavailable'); },
  ];
  const incompletePhases: any[] = [];
  const incomplete = await exports.fetchCardsForPokemon('Pikachu', { onProgress: (phase) => incompletePhases.push(phase) });
  assert.deepEqual(pokemonRequests.map((request) => [request.cursor, request.limit]),
    [[null, 24], ['opaque-failing-page', 120]], 'A failure still follows the opaque cursor with the full continuation limit');
  assert.equal(incomplete.complete, false, 'A failed later factual page must not claim a complete collection');
  assert.match(incomplete.error?.message ?? '', /Later species page unavailable/);
  assert.equal(incomplete.cards.length, 24, 'A failed continuation keeps the published first factual page');
  assert.ok(incompletePhases.some((phase) => !phase.complete && phase.cards.length === 24), 'The partial collection remains visible after a later-page failure');
  console.log('Pokédex loading passed: ownership reads all pages and rejects failures, physical inventory blocks marker removals, facts precede artwork, late images retain metadata, and missing thumbnails retry.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
