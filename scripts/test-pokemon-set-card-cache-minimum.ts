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
  const firstRead = deferred<any[]>();
  const threeCards = Array.from({ length: 3 }, (_, index) => ({ id: `partial-${index + 1}`, number: String(index + 1), name: `Partial ${index + 1}` }));
  const fullSet = Array.from({ length: 237 }, (_, index) => ({ id: `card-${index + 1}`, number: String(index + 1), name: `Card ${index + 1}` }));
  const dependencies: Record<string, unknown> = {
    'react-native': { Image: { prefetch: async () => true }, InteractionManager: { runAfterInteractions: (work: () => void) => work() } },
    './config': { PRICE_API_URL: null },
    './publishedSetLogoFallbacks': { getPublishedSetLogoFallback: () => undefined },
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
  const { fetchCardsForSet, getExactPokemonSetCardTotal, invalidatePokemonCatalogueCardCaches, mergeSetCardArtwork } = moduleBox.exports as {
    fetchCardsForSet: (setId: string, options?: any) => Promise<any[]>;
    getExactPokemonSetCardTotal: (set: any) => number | null;
    invalidatePokemonCatalogueCardCaches: () => void;
    mergeSetCardArtwork: (current: any[], incoming: any[]) => any[];
  };

  // A weak caller starts the read. A binder joins while it is in flight with
  // its known 237-card minimum, so the three real rows remain visible but are
  // never retained as the set cache.
  const weak = fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true });
  const strong = fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 });
  assert.equal(reads, 1, 'the weak read must begin before the stronger caller joins');
  firstRead.resolve(threeCards);
  assert.equal((await weak).length, 3);
  assert.equal((await strong).length, 3, 'real partial rows remain available to BinderDetail');

  const recovered = await fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 });
  assert.equal(recovered.length, 237, 'the stronger minimum forces an immediate retry after the three-card response');
  assert.equal(reads, 2);
  assert.equal((await fetchCardsForSet('swsh7', { language: 'en', preferCanonicalApi: true, minimumCardCount: 237 })).length, 237);
  assert.equal(reads, 2, 'the recovered complete set is cached');
  assert.equal(getExactPokemonSetCardTotal({ id: 'sv8pt5', language: 'en', printedTotal: 131, total: 180 }), 180,
    'facts-only Set Detail uses canonical total rather than a smaller printed count');
  assert.equal(getExactPokemonSetCardTotal({ id: 'unverified', language: 'en', printedTotal: 131, total: 0 }), null,
    'a printed count alone is not passed to the exact facts reader as a complete-set count');

  const fact = {
    id: 'card-1', name: 'Fact name', number: '1', language: 'en', set: { id: 'set-1', name: 'Facts' },
    images: {}, pricing: { displayPrice: 99 },
    raw_data: { number: '1', set: { id: 'set-1' }, stackr: {
      cardId: 'card-1', catalogueVersionId: 'version-1', defaultVariantId: 'variant-1',
      variants: [{ variantId: 'variant-1', canonicalId: 'pokemon:en:set-1:1:normal', finishCode: 'normal' }],
    } },
  };
  const artwork = {
    ...fact, name: 'Wrong replacement name', images: { small: 'https://approved.example/small.webp', large: 'https://approved.example/large.webp' },
    raw_data: { ...fact.raw_data, presentation: { artwork: { sourceVariantId: 'variant-1' }, selected_image_variant_id: 'variant-1' } },
  };
  assert.equal(mergeSetCardArtwork([fact], [])[0], fact,
    'facts remain visible while optional artwork is unresolved or fails');
  const painted = mergeSetCardArtwork([fact], [artwork])[0];
  assert.equal(painted.images.small, artwork.images.small, 'a later exact identity can paint approved artwork');
  assert.equal(painted.name, fact.name, 'artwork cannot replace factual card fields');
  assert.equal(painted.pricing.displayPrice, fact.pricing.displayPrice, 'artwork cannot replace prices');
  for (const wrong of [
    { ...artwork, language: 'ja' },
    { ...artwork, set: { ...artwork.set, id: 'set-2' } },
    { ...artwork, number: '2', raw_data: { ...artwork.raw_data, number: '2' } },
    { ...artwork, raw_data: { ...artwork.raw_data, stackr: { ...artwork.raw_data.stackr, catalogueVersionId: 'version-2' } } },
    { ...artwork, raw_data: { ...artwork.raw_data, stackr: { ...artwork.raw_data.stackr, defaultVariantId: 'variant-2', variants: [{ variantId: 'variant-2', canonicalId: 'pokemon:en:set-1:1:holo', finishCode: 'holo' }] } } },
  ]) assert.equal(mergeSetCardArtwork([fact], [wrong])[0], fact,
    'wrong language, set, printing, catalogue version, or selected finish cannot overwrite a newer factual row');

  invalidatePokemonCatalogueCardCaches();
  console.log('Set-card cache keeps partial rows visible, never retains them for a 237-card binder, caches recovery, and merges only exact artwork identities.');
}

void main();
