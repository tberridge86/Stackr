import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function testPersistedSearchCache() {
  const store = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
  };
  const source = fs.readFileSync('lib/searchCardResultCache.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => name === '@react-native-async-storage/async-storage'
      ? { __esModule: true, default: storage }
      : {},
  });

  const rows = Array.from({ length: 60 }, (_, index) => ({ id: `card-${index}`, language: 'ja' }));
  await exports.writeCachedCanonicalSearch('M5 002', 'ja', rows, 1_000);
  assert.equal((await exports.readCachedCanonicalSearch('M5 002', 'ja', 2_000)).length, 48, 'canonical cold cache stays bounded');
  assert.equal(await exports.readCachedCanonicalSearch('M5 002', 'en', 2_000), null, 'language shards never share cached rows');
  assert.equal(await exports.readCachedCanonicalSearch('M5 002', 'ja', 1_000 + 24 * 60 * 60 * 1000 + 1), null, 'stale search cache is not presented as current');
}

async function testPokedexCanonicalPaging() {
  const requestedPages: Array<{ name: string; cursor: string | null; limit: number }> = [];
  const firstPage = Array.from({ length: 24 }, (_, index) => ({ cardId: `card-${index}`, defaultVariantId: `variant-${index}` }));
  let finishSecondPage!: (value: any) => void;
  const secondPage = new Promise<any>((resolve) => { finishSecondPage = resolve; });
  const source = fs.readFileSync('lib/pokedexCollection.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    console,
    require: (name: string) => ({
      './cardSearch': { searchLocalPokemonCards: async () => { throw new Error('Canonical paging must not use language fanout'); } },
      './supabase': { supabase: {} },
      './pokemonDisplayNames': { getPreferredCardDisplayName: () => 'Pikachu', getEnglishCardDisplayName: () => 'Pikachu', getPreferredSetDisplayName: () => 'Set', getEnglishSetDisplayName: () => 'Set' },
      './stackrDomainAdapter': {
        stackrCardToLegacyCard: (card: any) => ({ id: card.cardId, name: 'Pikachu', number: '1', language: 'en', set: { id: 'set-a', name: 'Set' }, raw_data: { set: { id: 'set-a', name: 'Set' }, images: {} } }),
        enrichStackrCardArtworkFromFacts: async () => [], fetchStackrCardRows: async () => new Map(), fetchStackrSetRows: async () => new Map(), fetchStackrPriceSnapshots: async () => new Map(),
      },
      './stackrApiV1': { stackrApiClient: { pokemonCards: async (name: string, query: any) => {
        requestedPages.push({ name, cursor: query.cursor, limit: query.limit });
        return requestedPages.length === 1
          ? { data: { cards: firstPage }, meta: { pagination: { nextCursor: 'opaque-next' } } }
          : secondPage;
      } } },
      './pokedexCollectionCore': { buildOwnedPokedexCards: () => new Map(), canRemovePokedexOwnershipMarker: () => true },
    } as Record<string, any>)[name] ?? {},
  });

  const canonicalSnapshots: any[] = [];
  const resultPromise = exports.fetchCardsForPokemon('pikachu', {
    onProgress: (progress: any) => canonicalSnapshots.push(progress),
  });
  await tick();
  assert.deepEqual(requestedPages, [
    { name: 'pikachu', cursor: null, limit: 24 },
    { name: 'pikachu', cursor: 'opaque-next', limit: 120 },
  ], 'Pokédex starts a bounded all-language canonical page and follows its opaque cursor');
  assert.ok(canonicalSnapshots.some((progress) => progress.cards.length === 24 && !progress.complete),
    'The first canonical page is published while the later page remains pending');
  finishSecondPage({ data: { cards: [firstPage[0], { cardId: 'card-later', defaultVariantId: 'variant-later' }] }, meta: { pagination: { nextCursor: null } } });
  const result = await resultPromise;
  assert.equal(result.complete, true, 'A fully paged canonical result is explicitly complete');
  assert.equal(result.cards.length, 25, 'Later canonical pages deduplicate identities without losing their unique cards');
  assert.ok(result.cards.some((card: any) => card.id === 'card-later'));
}

function testScreenOrdering() {
  const binder = fs.readFileSync('app/(tabs)/binder.tsx', 'utf8');
  const loadStart = binder.indexOf('const load = useCallback');
  const cacheRead = binder.indexOf('readPersistedBinderOverview(accountId)', loadStart);
  const sessionRead = binder.indexOf('supabase.auth.getSession()', loadStart);
  assert.ok(loadStart >= 0 && cacheRead > loadStart && sessionRead > cacheRead, 'binder paints the account-keyed persisted overview before the refresh auth round trip');
  assert.match(binder, /BINDER_OVERVIEW_CACHE_PREFIX/);
  assert.match(binder, /encodeURIComponent\(userId\)/, 'binder cache is account scoped');

  const detail = fs.readFileSync('app/pokemon/[id].tsx', 'utf8');
  const routeIdentity = detail.indexOf('const routePokemon: PokemonData | null = routeName');
  const metadataFetch = detail.indexOf('fetch(\`https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\${id}\`)', routeIdentity);
  const canonicalCards = detail.indexOf('fetchCardsForPokemon(nextPokemon.name, { onProgress: applyCards })', routeIdentity);
  assert.ok(routeIdentity >= 0 && metadataFetch > routeIdentity && canonicalCards > metadataFetch,
    'A known route identity starts canonical cards without awaiting external species metadata');
  assert.match(detail, /const nextPokemon = routePokemon \?\? await metadata;/);
  assert.match(detail, /cardsError/);
  assert.match(detail, /setRetryEpoch/, 'Pokédex exposes a bounded user retry after connectivity failure');

  const search = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
  const cachePromise = search.indexOf('readCachedCanonicalSearch(primary, selectedLanguage)');
  const canonicalSearch = search.indexOf('searchLocalPokemonCards<any>(primary', cachePromise);
  assert.ok(cachePromise >= 0 && canonicalSearch > cachePromise, 'Search starts its cold-cache read before canonical network results settle');
  assert.match(search, /requestId !== requestRef\.current/, 'late search results remain guarded by request identity');
}

async function main() {
  await testPersistedSearchCache();
  await testPokedexCanonicalPaging();
  testScreenOrdering();
  console.log('Issue #304 cold retrieval checks passed: persisted Search/Binders, progressive canonical Pokédex paging, retry and stale-request guards.');
}

void main();
