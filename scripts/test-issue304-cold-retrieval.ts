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
        fetchStackrCardRows: async () => new Map(), fetchStackrSetRows: async () => new Map(), fetchStackrPriceSnapshots: async () => new Map(),
      },
      './stackrApiV1': { stackrApiClient: { assetManifest: async () => ({ data: { assets: [] }, meta: {} }), pokemonCards: async (name: string, query: any) => {
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

function testPokedexTabStagedLoadingSource() {
  const pokedex = fs.readFileSync('app/(tabs)/pokedex.tsx', 'utf8');
  assert.match(pokedex, /const POKEDEX_INITIAL_LIST_LIMIT = 151;/,
    'the main Pokédex has a bounded first factual page');
  assert.match(pokedex, /export async function loadPokedexRemote/,
    'the tab delegates its cold path to a runtime-testable staged loader');
  assert.match(pokedex, /Could not load the full Pokédex\. Showing the Pokémon loaded so far\./,
    'a failed continuation reports partial data honestly');
  assert.match(pokedex, /onPress=\{\(\) => setReloadEpoch\(\(current\) => current \+ 1\)\}/,
    'the partial/error state offers an explicit retry');
}

function loadPokedexTabModule() {
  const source = fs.readFileSync('app/(tabs)/pokedex.tsx', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  const mocks: Record<string, unknown> = {
    react: { __esModule: true, default: {} },
    'react-native': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: {} },
    'expo-router': {},
    'react-native-safe-area-context': {},
    '@expo/vector-icons': {},
    '../../components/theme-context': {},
    '../../components/StackrLoadingIndicator': {},
    '../../components/Text': {},
    '../../components/FeatureTipModal': {},
    '../../lib/pokedexCollection': {},
    '../../components/StackrBackdrop': {},
    '../../components/StackrScreen': {},
    '../../lib/stackrIcons': { stackrIcons: { pokedex: {} } },
  };
  vm.runInNewContext(compiled, {
    exports,
    console,
    require: (name: string) => mocks[name] ?? {},
  });
  return exports as {
    loadPokedexRemote: (fetcher: (url: string) => Promise<any>, options: any) => Promise<'complete' | 'stale'>;
  };
}

const pokedexPage = (start: number, count: number) => Array.from({ length: count }, (_, index) => {
  const id = start + index;
  return { name: `pokemon-${id}`, url: `https://pokeapi.co/api/v2/pokemon/${id}/` };
});

async function testPokedexTabColdPathRuntime() {
  const { loadPokedexRemote } = loadPokedexTabModule();
  const firstPage = pokedexPage(1, 151);
  const continuation = pokedexPage(152, 1199);
  const calls: string[] = [];
  let resolveContinuation!: (response: any) => void;
  const continuationPending = new Promise<any>((resolve) => { resolveContinuation = resolve; });
  const fetcher = async (url: string) => {
    calls.push(url);
    if (calls.length === 1) return { ok: true, status: 200, json: async () => ({ count: 1350, results: firstPage }) };
    return continuationPending;
  };
  let active = true;
  const partials: any[][] = [];
  const completes: any[][] = [];
  const cached: any[][] = [];
  const load = loadPokedexRemote(fetcher, {
    hasCachedPokemon: false,
    isActive: () => active,
    publishPartial: (entries: any[]) => partials.push(entries),
    publishComplete: (entries: any[]) => completes.push(entries),
    persistComplete: async (entries: any[]) => { cached.push(entries); },
    setLoadingMore: () => {},
  });
  await tick();
  assert.equal(partials.length, 1, 'the first 151 rows publish while the continuation is pending');
  assert.equal(partials[0].length, 151);
  assert.equal(completes.length, 0, 'a partial page is not treated as complete');
  assert.equal(cached.length, 0, 'a partial page is never cached');
  assert.match(calls[0], /offset=0&limit=151/);
  assert.match(calls[1], /offset=151&limit=1199/);
  resolveContinuation({ ok: true, status: 200, json: async () => ({ count: 1350, results: continuation }) });
  assert.equal(await load, 'complete');
  assert.equal(completes[0].length, 1350, 'the completed continuation merges into a full list');
  assert.equal(cached[0].length, 1350, 'only the validated full list reaches cache');

  const savedComplete = completes[0];
  const failedWrites: any[][] = [];
  await assert.rejects(loadPokedexRemote(async (url: string) => (
    url.includes('offset=0')
      ? { ok: true, status: 200, json: async () => ({ count: 1350, results: firstPage }) }
      : { ok: false, status: 503, json: async () => ({}) }
  ), {
    hasCachedPokemon: true,
    isActive: () => true,
    publishPartial: () => assert.fail('saved full results must not be replaced by a partial refresh'),
    publishComplete: () => assert.fail('a failed continuation cannot publish a complete refresh'),
    persistComplete: async (entries: any[]) => { failedWrites.push(entries); },
    setLoadingMore: () => {},
  }), /PokeAPI returned 503/);
  assert.equal(failedWrites.length, 0, 'a failed continuation cannot overwrite the saved complete cache');
  assert.equal(savedComplete.length, 1350, 'the caller retains the previously saved complete data on failure');

  const retryWrites: any[][] = [];
  const retryResult = await loadPokedexRemote(async (url: string) => (
    url.includes('offset=0')
      ? { ok: true, status: 200, json: async () => ({ count: 1350, results: firstPage }) }
      : { ok: true, status: 200, json: async () => ({ count: 1350, results: continuation }) }
  ), {
    hasCachedPokemon: false,
    isActive: () => true,
    publishPartial: () => {},
    publishComplete: () => {},
    persistComplete: async (entries: any[]) => { retryWrites.push(entries); },
    setLoadingMore: () => {},
  });
  assert.equal(retryResult, 'complete', 'a retry can replace the partial attempt with a validated full list');
  assert.equal(retryWrites[0].length, 1350, 'the successful retry persists the merged full list');

  const truncatedWrites: any[][] = [];
  await assert.rejects(loadPokedexRemote(async (url: string) => (
    url.includes('offset=0')
      ? { ok: true, status: 200, json: async () => ({ count: 1350, results: firstPage }) }
      : { ok: true, status: 200, json: async () => ({ count: 1350, results: continuation.slice(0, 8) }) }
  ), {
    hasCachedPokemon: false,
    isActive: () => true,
    publishPartial: () => {},
    publishComplete: () => assert.fail('a truncated continuation cannot become a complete list'),
    persistComplete: async (entries: any[]) => { truncatedWrites.push(entries); },
    setLoadingMore: () => {},
  }), /truncated Pokémon continuation/);
  assert.equal(truncatedWrites.length, 0, 'malformed/truncated continuation data is never cached');

  let staleContinuation!: (response: any) => void;
  const stalePending = new Promise<any>((resolve) => { staleContinuation = resolve; });
  active = true;
  const staleComplete: any[][] = [];
  const staleCache: any[][] = [];
  const staleLoad = loadPokedexRemote(async (url: string) => (
    url.includes('offset=0')
      ? { ok: true, status: 200, json: async () => ({ count: 1350, results: firstPage }) }
      : stalePending
  ), {
    hasCachedPokemon: false,
    isActive: () => active,
    publishPartial: () => {},
    publishComplete: (entries: any[]) => staleComplete.push(entries),
    persistComplete: async (entries: any[]) => { staleCache.push(entries); },
    setLoadingMore: () => {},
  });
  await tick();
  active = false;
  staleContinuation({ ok: true, status: 200, json: async () => ({ count: 1350, results: continuation }) });
  assert.equal(await staleLoad, 'stale', 'an unmounted/superseded continuation reports stale');
  assert.equal(staleComplete.length, 0, 'an unmounted/superseded load does not publish a final list');
  assert.equal(staleCache.length, 0, 'an unmounted/superseded load does not write cache');
}

function testSearchSetFactsFirst() {
  const search = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
  assert.match(search, /fetchAllSets\(\{ language, includeAssets: false \}\)/,
    'set ranking reads facts only instead of globally enumerating set artwork');
}

async function main() {
  await testPersistedSearchCache();
  await testPokedexCanonicalPaging();
  testScreenOrdering();
  testPokedexTabStagedLoadingSource();
  await testPokedexTabColdPathRuntime();
  testSearchSetFactsFirst();
  console.log('Issue #304 cold retrieval checks passed: persisted Search/Binders, progressive canonical Pokédex paging, retry and stale-request guards.');
}

void main();
