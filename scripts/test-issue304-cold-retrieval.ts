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

async function testPokedexLanguageFanout() {
  const pending = new Map<string, { resolve: (rows: any[]) => void; promise: Promise<any[]> }>();
  const requestedLanguages: string[] = [];
  const searchLocalPokemonCards = (_term: string, options: any) => {
    requestedLanguages.push(options.language);
    let resolve!: (rows: any[]) => void;
    const promise = new Promise<any[]>((done) => { resolve = done; });
    pending.set(options.language, { resolve, promise });
    return promise;
  };
  const source = fs.readFileSync('lib/pokedexCollection.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    console,
    require: (name: string) => ({
      './cardSearch': { searchLocalPokemonCards },
      './supabase': { supabase: {} },
      './pokemonDisplayNames': { getPreferredSetDisplayName: () => 'Set' },
      './stackrDomainAdapter': { fetchStackrCardRows: async () => new Map(), fetchStackrSetRows: async () => new Map() },
    } as Record<string, any>)[name] ?? {},
  });

  const canonicalSnapshots: any[][] = [];
  const resultPromise = exports.fetchCardsForPokemon('pikachu', {
    onCanonicalCards: (cards: any[]) => canonicalSnapshots.push(cards),
  });
  await tick();
  assert.deepEqual(requestedLanguages, ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'], 'Pokédex starts every supported language shard without serial waits');

  for (const language of requestedLanguages) {
    const row = {
      id: `${language}-pikachu`,
      name: 'Pikachu',
      language,
      number: '1',
      set_id: `${language}-set`,
      raw_data: { set: { id: `${language}-set`, name: 'Set' }, images: {} },
    };
    const request = pending.get(language)!;
    request.resolve([row]);
  }

  const cards = await resultPromise;
  assert.equal(cards.length, 5, 'Pokédex preserves cards from every successful language shard');
  assert.ok(canonicalSnapshots.length >= 1, 'Pokédex exposes canonical cards before optional enrichment is required');
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
  const routeSearch = detail.indexOf('const routeCardsPromise');
  const metadataFetch = detail.indexOf('fetch(\`https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\${id}\`)', routeSearch);
  assert.ok(routeSearch >= 0 && metadataFetch > routeSearch, 'Pokédex card retrieval begins before external species metadata');
  assert.match(detail, /cardsError/);
  assert.match(detail, /setRetryEpoch/, 'Pokédex exposes a bounded user retry after connectivity failure');

  const search = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
  const cachePromise = search.indexOf('readCachedCanonicalSearch(primary, selectedLanguage)');
  const canonicalSearch = search.indexOf('searchLocalPokemonCards<any>(primary', cachePromise);
  assert.ok(cachePromise >= 0 && canonicalSearch > cachePromise, 'Search starts its cold-cache read before canonical network results settle');
  assert.match(search, /requestId !== requestRef\.current/, 'late search results remain guarded by request identity');
}

await testPersistedSearchCache();
await testPokedexLanguageFanout();
testScreenOrdering();
console.log('Issue #304 cold retrieval checks passed: persisted Search/Binders, parallel Pokédex shards, retry and stale-request guards.');
