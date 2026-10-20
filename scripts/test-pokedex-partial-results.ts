import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';

// Execute the complete screen with fixture hooks/sources. FlatList's empty
// component is inspected only when its real data is empty; a hidden empty
// retry must never satisfy the populated-continuation regression.
const path = 'app/pokemon/[id].tsx';
const baseline = process.env.PDX_PARTIAL_BASELINE === '1';
const source = baseline
  ? execFileSync('git', ['show', `9bdd2355799fd6e69a8ac14aa59c205481159b63:${path}`], { encoding: 'utf8' })
  : readFileSync(path, 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
type Progress = { cards: any[]; complete: boolean; error?: Error | null };
const cards = Array.from({ length: 30 }, (_, index) => ({
  id: `printing-${index}`, set_id: 'fixture-ja-set', name: 'Fixture Raichu', number: String(index + 1),
  canonical_card: { cardId: `canonical-${index}` },
  raw_data: { language: 'ja', stackr: { cardId: `non-authoritative-${index}` } },
  image_small: `https://fixture.invalid/${index}-grid.png`, image_large: `https://fixture.invalid/${index}-detail.png`,
  image_urls: [`https://fixture.invalid/${index}-grid.png`, `https://fixture.invalid/${index}-detail.png`, `https://fixture.invalid/${index}-original.png`],
}));

function renderedNodes(value: any): any[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(renderedNodes);
  const props = value.props ?? {};
  return [value, ...renderedNodes(props.children), ...renderedNodes(props.ListHeaderComponent),
    ...(value.type === 'FlatList' && props.data.length === 0 ? renderedNodes(props.ListEmptyComponent) : [])];
}
const renderedText = (value: any) => renderedNodes(value).filter(node => node.type === 'Text')
  .flatMap(node => node.props.children.flat(Infinity)).join(' ');

function harness(options: {
  readCards?: (name: string, options: { onProgress: (progress: Progress) => void }) => Promise<Progress>;
  ownershipPending?: boolean;
  metadataPending?: boolean;
} = {}) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let tree: any;
  const requests: { name: string; publish: (progress: Progress) => void; resolve: (progress: Progress) => void }[] = [];
  const metadataSignals: AbortSignal[] = [];
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((item, index) => item === b[index]);
  const memo = (factory: () => any, deps: any[]) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const React: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value: any) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo: memo, useCallback: (callback: any, deps: any[]) => memo(() => callback, deps),
    useEffect: (callback: any, deps: any[]) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const prior = slots[index]; const slot = slots[index] = { deps, cleanup: prior?.cleanup };
        effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
      }
    },
  };
  const theme = { colors: new Proxy({}, { get: () => '#123456' }) };
  const dependencies: Record<string, any> = {
    react: React, '../../components/theme-context': { useTheme: () => ({ theme }) },
    '../../components/Text': { Text: 'Text' }, '../../components/StackrImage': { StackrImage: 'StackrImage' },
    '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Spinner' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push() {} }, useLocalSearchParams: () => ({ id: '26', name: 'raichu', speciesId: '26', speciesName: 'raichu' }) },
    'react-native': {
      ...Object.fromEntries(['FlatList', 'Image', 'Pressable', 'View'].map(name => [name, name])),
      Alert: { alert() {} }, useWindowDimensions: () => ({ width: 390 }),
      StyleSheet: { create: (styles: any) => Object.fromEntries(Object.entries(styles).map(([name, style]) => [name, { ...(style as object), fixtureStyleName: name }])) },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../components/RaritySymbol': { RaritySymbol: 'Rarity', RARITY_SYMBOL_CARD_OVERLAY: {} },
    '../../lib/pokedexCollection': {
      fetchCardsForPokemon: options.readCards ?? ((name: string, request: any) => new Promise<Progress>((resolve) => requests.push({ name, publish: request.onProgress, resolve }))),
      fetchOwnedPokedexCards: async () => new Map(), hydratePokedexCardArtwork: async () => [],
      formatPokedexName: (name: string) => name, setPokedexCardOwned: async () => {},
    },
    '../../lib/pokedexOwnershipState': { usePokedexOwnership: () => options.ownershipPending
      ? { values: null, canMutate: false, status: 'loading', busyKey: null, message: 'Loading ownership…' }
      : { values: new Set(['fixture-ja-set:printing-0']), canMutate: true, status: 'ready', busyKey: null, message: null } },
    '../../lib/setDisplay': { getDisplaySetName: () => 'Fixture set' }, '../../lib/stackrSizing': { stackrCardImageSizes: { cardAspectRatio: 0.71 } },
    '../../lib/haptics': { stackrHaptics: { selection: async () => {}, cardPreview: async () => {} } },
    '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) },
    '../../lib/cardInspection': { CARD_INSPECTION_LONG_PRESS_MS: 300 }, '../../lib/useCataloguePriceOverlay': { useCataloguePriceOverlay: (rows: any[]) => rows },
    '../../lib/optionalCatalogueEnrichment': { readOptionalCatalogueEnrichment },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, {
    exports, Set, Map, AbortController, console: { log() {} },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected screen dependency: ${name}`); return dependencies[name]; },
    fetch: async (url: string, init?: { signal?: AbortSignal }) => {
      assert.equal(url, 'https://pokeapi.co/api/v2/pokemon/26', 'metadata stays on the expected fixture route');
      if (init?.signal) metadataSignals.push(init.signal);
      if (options.metadataPending) return new Promise(() => {});
      return { ok: true, json: async () => ({ id: 26, name: 'raichu', types: [] }) };
    },
  });
  const render = () => { cursor = 0; tree = exports.default(); return tree; };
  const flush = async () => { const pending = effects; effects = []; pending.forEach(run => run()); await tick(); render(); };
  const nodes = () => renderedNodes(tree);
  const list = () => nodes().find(node => node.type === 'FlatList');
  const retry = () => nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Retry loading Pokémon cards');
  const track = () => nodes().find(node => node.type === 'View' && node.props.style?.fixtureStyleName === 'progressTrack');
  return { render, flush, requests, metadataSignals, nodes, list, retry, track, text: () => renderedText(tree),
    tile: (item = cards[0]) => list().props.renderItem({ item }),
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

function fallbackService() {
  let canonicalReads = 0;
  const results: Progress[] = [];
  const fallbackCards = cards.slice(0, 16).map(card => ({ ...card, name: 'Raichu' }));
  const canonicalCards = cards.map((card, index) => ({ cardId: `recovered-${index}`, defaultVariantId: `variant-${index}`, legacy: card }));
  const dependencies: Record<string, any> = {
    './cardSearch': { searchLocalPokemonCards: async () => fallbackCards },
    './supabase': { supabase: {} },
    './pokemonDisplayNames': {
      getPreferredCardDisplayName: (input: any) => input.fallbackName,
      getEnglishCardDisplayName: () => null,
      getPreferredSetDisplayName: () => 'Fixture set', getEnglishSetDisplayName: () => null,
    },
    './stackrDomainAdapter': {
      fetchStackrCardRows: async () => new Map(), fetchStackrSetRows: async () => new Map(),
      fetchStackrPriceSnapshots: async () => new Map(),
      stackrCardToLegacyCard: (card: any) => ({ ...card.legacy, id: card.cardId, name: 'Raichu' }),
    },
    './stackrApiV1': { stackrApiClient: {
      pokemonCards: async () => {
        canonicalReads += 1;
        if (canonicalReads === 1) throw new Error('Internal fixture transport failure');
        return { data: { cards: canonicalCards }, meta: {} };
      },
      assetManifest: async () => ({ data: { assets: [] }, meta: {} }),
    } },
    './pokedexCollectionCore': {},
  };
  const exports: any = {};
  const servicePath = 'lib/pokedexCollection.ts';
  const serviceSource = process.env.PDX_FALLBACK_BASELINE === '1'
    ? execFileSync('git', ['show', `HEAD:${servicePath}`], { encoding: 'utf8' })
    : readFileSync(servicePath, 'utf8');
  runInNewContext(ts.transpileModule(serviceSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Set, Map, Date,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected collection dependency: ${name}`); return dependencies[name]; },
  });
  return {
    readCards: async (name: string, options: { onProgress: (progress: Progress) => void }): Promise<Progress> => {
      const result = await exports.fetchCardsForPokemon(name, options);
      results.push(result);
      return result;
    },
    reads: () => canonicalReads, results,
  };
}

async function run() {
  const initial = harness({ ownershipPending: true }); initial.render(); await initial.flush();
  assert.match(initial.text(), /Loading cards…/, 'A pending first factual read is presented as loading, not an empty catalogue.');
  assert.doesNotMatch(initial.text(), /0 cards loaded|No cards found/);
  assert.match(initial.text(), /Loading ownership…/, 'Private ownership loading remains independent of catalogue loading.');
  assert.equal(initial.track(), undefined); initial.unmount();

  const service = fallbackService();
  const fallback = harness({ readCards: service.readCards }); fallback.render(); await fallback.flush(); await tick(); fallback.render();
  assert.equal(fallback.list().props.data.length, 16, 'The real collection fallback keeps useful legacy cards after canonical failure.');
  assert.match(fallback.text(), /16 cards loaded/); assert.match(fallback.text(), /partial card list/);
  assert.match(fallback.text(), /complete card list could not be loaded/, 'The actual fallback result carries the existing retryable error field.');
  assert.doesNotMatch(fallback.text(), /Internal fixture transport failure/, 'The user receives a safe factual recovery message.');
  assert.ok(fallback.retry(), 'A real canonical-failure fallback exposes the existing screen Retry.');
  assert.equal(fallback.track(), undefined, 'A fallback is never a complete collection denominator.');
  const fallbackSnapshot = JSON.stringify(service.results[0]);
  fallback.retry().props.onPress(); fallback.render(); await fallback.flush(); await tick(); fallback.render();
  assert.equal(service.reads(), 2, 'Actual Retry restarts the canonical collection read.');
  assert.equal(fallback.list().props.data.length, 30); assert.ok(fallback.track());
  assert.equal(fallback.retry(), undefined); assert.doesNotMatch(fallback.text(), /partial card list|could not be loaded/);
  assert.equal(JSON.stringify(service.results[0]), fallbackSnapshot, 'Later success never mutates the previously returned partial snapshot.');
  fallback.unmount();

  const h = harness(); h.render(); await h.flush();
  assert.equal(h.requests[0].name, 'raichu', 'The selected species remains the catalogue query.');
  const partial = { cards: cards.slice(0, 24), complete: false, error: new Error('Second page failed') };
  h.requests[0].publish(partial); h.requests[0].resolve(partial); await tick(); h.render();
  assert.equal(h.list().props.data.length, 24, 'Useful first-page cards remain visible after the second page fails.');
  assert.match(h.text(), /24 cards loaded/);
  assert.match(h.text(), /partial card list/);
  assert.match(h.text(), /Second page failed/);
  assert.ok(h.retry(), 'A populated list must expose Retry; its hidden empty component cannot count.');
  assert.equal(h.track(), undefined, 'A partial prefix cannot show a completed-total ownership bar.');
  h.retry().props.onPress(); h.render(); await h.flush();
  assert.equal(h.requests.length, 2, 'The actual Retry action starts a new screen request.');
  assert.equal(h.list().props.data.length, 24, 'Retry preserves usable cards while awaiting new facts.');
  h.requests[0].publish({ cards: [], complete: true }); h.render();
  assert.equal(h.list().props.data.length, 24, 'A late callback from the superseded request cannot clear retained cards.');
  const complete = { cards, complete: true }; h.requests[1].publish(complete); h.requests[1].resolve(complete); await tick(); h.render();
  assert.equal(h.list().props.data.length, 30); assert.match(h.text(), /1 \/ 30/);
  assert.ok(h.track(), 'Complete results restore the established ownership bar.');
  assert.equal(h.retry(), undefined); assert.doesNotMatch(h.text(), /Second page failed|partial card list/);
  const image = renderedNodes(h.tile()).find(node => node.type === 'StackrImage');
  assert.ok(image, 'Only the TCG tile uses the established shared image boundary.');
  assert.equal(image.props.uri, cards[0].image_small); assert.equal(image.props.fullUri, cards[0].image_large);
  assert.deepEqual([...image.props.uriCandidates], cards[0].image_urls);
  assert.match(image.props.cacheKey, /^pokedex:canonical-0:/, 'Canonical printing identity takes priority over legacy raw metadata.');
  const changedImage = renderedNodes(h.tile({ ...cards[0], image_urls: ['https://fixture.invalid/new-grid.png'] })).find(node => node.type === 'StackrImage');
  assert.equal(changedImage.props.cacheKey, image.props.cacheKey, 'Rendition URL changes do not change the printing key.');
  assert.equal(image.props.contentFit, 'contain'); assert.equal(image.props.accessibilityLabel, 'Fixture Raichu card image');
  assert.equal(h.nodes().filter(node => node.type === 'Image').length, 2, 'Hero and sprite keep their existing image paths.');
  h.unmount();

  const pending = harness(); pending.render(); await pending.flush(); pending.requests[0].publish({ cards: cards.slice(0, 24), complete: false }); pending.render();
  assert.match(pending.text(), /24 cards loaded/); assert.match(pending.text(), /partial card list/);
  assert.doesNotMatch(pending.text(), /Loading more matching/); assert.equal(pending.track(), undefined); pending.unmount();
  const empty = harness(); empty.render(); await empty.flush(); empty.requests[0].resolve({ cards: [], complete: true }); await tick(); empty.render();
  assert.equal(empty.list().props.data.length, 0); assert.match(empty.text(), /No cards found/); assert.match(empty.text(), /0 \/ 0/);
  assert.equal(empty.retry(), undefined); empty.unmount();
  const cancelledMetadata = harness({ metadataPending: true }); cancelledMetadata.render(); await cancelledMetadata.flush();
  assert.equal(cancelledMetadata.requests.length, 1, 'real optional metadata cannot block a known species factual request');
  assert.equal(cancelledMetadata.metadataSignals.length, 1, 'the real helper supplies its bounded child signal to the fixture fetch');
  assert.equal(cancelledMetadata.metadataSignals[0].aborted, false);
  cancelledMetadata.unmount(); await tick();
  assert.equal(cancelledMetadata.metadataSignals[0].aborted, true, 'unmount aborts pending metadata through the real helper');
  console.log('Pokédex actual screen passed: populated partial/error/retry, honest progress, stale callbacks, complete/empty and exact image props.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
