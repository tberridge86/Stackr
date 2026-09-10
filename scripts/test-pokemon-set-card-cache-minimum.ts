import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { cacheNonEmptyCatalogueRows, readNonEmptyCatalogueRows } from '../lib/resilientCatalogueRead';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

async function main() {
  let reads = 0;
  let firstRead: Deferred<any[]> | null = null;
  const threeCards = Array.from({ length: 3 }, (_, index) => ({ id: `partial-${index + 1}`, number: String(index + 1), name: `Partial ${index + 1}` }));
  const fullSet = Array.from({ length: 237 }, (_, index) => ({ id: `card-${index + 1}`, number: String(index + 1), name: `Card ${index + 1}` }));
  const dependencies: Record<string, unknown> = {
    'react-native': { Image: { prefetch: async () => true }, InteractionManager: { runAfterInteractions: (work: () => void) => work() } },
    './config': { PRICE_API_URL: null },
    './pokedataJapaneseSetIdentity': { resolvePokeDataJapaneseSetCode: () => null },
    './pokemonDisplayNames': {
      getEnglishCardDisplayName: () => null, getEnglishSetDisplayName: () => null, getLocalCardName: () => null,
      getPreferredCardDisplayName: ({ fallbackName }: any) => fallbackName, getLocalSetName: () => null,
      getPreferredSetDisplayName: ({ fallbackName }: any) => fallbackName,
    },
    './curatedPokemonCatalogue': { getCuratedPokemonCardById: () => null, getCuratedPokemonCardsForSet: () => [], getCuratedPokemonSets: () => [] },
    './supabase': { supabase: { from: () => ({ select: () => ({}) }) } },
    './stackrDomainAdapter': {
      clearStackrCatalogueCaches: () => {},
      fetchPreferredStackrCardsForReferences: async () => {
        reads += 1;
        if (reads === 1) {
          firstRead = deferred<any[]>();
          return firstRead.promise;
        }
        return fullSet;
      },
      fetchPreferredStackrSets: async () => [], fetchStackrCard: async () => null,
      fetchStackrCardsForSet: async () => [], fetchStackrSets: async () => [], fetchStackrSet: async () => null,
      searchStackrCards: async () => [],
    },
    './pokemonSetIdentity': { getPokemonSetLanguageFromPrefixedId: () => null, stripPokemonSetLanguagePrefix: (value: string) => value },
    './englishSetIdentity': { getEnglishSetReferenceAliases: () => [] },
    './resilientCatalogueRead': { cacheNonEmptyCatalogueRows, readNonEmptyCatalogueRows },
    './foreignPokemon': { fetchForeignPokemonCard: async () => null, fetchForeignPokemonSet: async () => null, invalidateForeignPokemonSetReferenceCache: () => {} },
    './tcgdexControlledCardReference': { defineTcgdexRuntimeImageOverlay: () => {}, enforceTcgdexRuntimeImagePolicy: () => null, isTcgdexControlledCardReferenceSourceEnabled: () => false },
    './tcgdexControlledReferenceLookup': { getTcgdexControlledReferenceLookupIdentity: () => null, matchTcgdexProviderCardFromLiveSet: () => null, normalizeTcgdexCollectorIdentity: () => null },
  };
  const source = fs.readFileSync('lib/pokemonTcg.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleBox: any = { exports: {} };
  vm.runInNewContext(compiled, { module: moduleBox, exports: moduleBox.exports, require: (name: string) => dependencies[name] ?? {} });
  const { fetchCardsForSet, invalidatePokemonCatalogueCardCaches } = moduleBox.exports as {
    fetchCardsForSet: (setId: string, options?: any) => Promise<any[]>;
    invalidatePokemonCatalogueCardCaches: () => void;
  };

  // A weak caller starts the read. A binder joins while it is in flight with
  // its known 237-card minimum, so the three real rows remain visible but are
  // never retained as the set cache.
  const weak = fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true });
  const strong = fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 });
  assert(firstRead, 'the weak read must begin before the stronger caller joins');
  firstRead.resolve(threeCards);
  assert.equal((await weak).length, 3);
  assert.equal((await strong).length, 3, 'real partial rows remain available to BinderDetail');

  const recovered = await fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 });
  assert.equal(recovered.length, 237, 'the stronger minimum forces an immediate retry after the three-card response');
  assert.equal(reads, 2);
  assert.equal((await fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 })).length, 237);
  assert.equal(reads, 2, 'the recovered complete set is cached');

  invalidatePokemonCatalogueCardCaches();
  console.log('Set-card cache keeps partial rows visible, never retains them for a 237-card binder, and caches recovery.');
}

void main();
