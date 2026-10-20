import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';
import * as retrieval from '../lib/performance';

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
type ReadDiagnostic = { source: 'canonical-facts' | 'artwork' | 'prices'; phase: 'page' | 'complete' | 'failed' };
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
  ownershipStatus?: 'loading' | 'success' | 'error';
} = {}) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let tree: any;
  const requests: { name: string; publish: (progress: Progress) => void; resolve: (progress: Progress) => void;
    diagnostic: (event: ReadDiagnostic) => void }[] = [];
  const priceObservers: ((phase: 'complete' | 'failed') => void)[] = [];
  let route = { id: '26', name: 'raichu', speciesId: '26', speciesName: 'raichu' };
  let auth = { user: { id: 'private-account-a' }, loading: false, error: null as string | null };
  let focusCleanup: (() => void) | undefined;
  const owned = new Set(['fixture-ja-set:printing-0']);
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
    'expo-router': { router: { push() {} }, useLocalSearchParams: () => route,
      useFocusEffect: (callback: () => (() => void)) => React.useEffect(() => {
        focusCleanup = callback(); return focusCleanup;
      }, [callback]) },
    'react-native': {
      ...Object.fromEntries(['FlatList', 'Image', 'Pressable', 'View'].map(name => [name, name])),
      Alert: { alert() {} }, useWindowDimensions: () => ({ width: 390 }),
      StyleSheet: { create: (styles: any) => Object.fromEntries(Object.entries(styles).map(([name, style]) => [name, { ...(style as object), fixtureStyleName: name }])) },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../components/RaritySymbol': { RaritySymbol: 'Rarity', RARITY_SYMBOL_CARD_OVERLAY: {} },
    '../../lib/pokedexCollection': {
      fetchCardsForPokemon: options.readCards ?? ((name: string, request: any) => new Promise<Progress>((resolve) => requests.push({ name, publish: request.onProgress, diagnostic: request.onDiagnostic, resolve }))),
      fetchOwnedPokedexCards: async () => new Map(), hydratePokedexCardArtwork: async () => [],
      formatPokedexName: (name: string) => name, setPokedexCardOwned: async () => {},
    },
    '../../lib/pokedexOwnershipState': { usePokedexOwnership: () => options.ownershipPending
      ? { values: null, canMutate: false, status: 'loading', busyKey: null, message: 'Loading ownership…' }
      : { values: owned, canMutate: true, status: options.ownershipStatus ?? 'success', busyKey: null, message: null } },
    '../../components/auth-context': { useAuth: () => auth },
    '../../lib/performance': retrieval,
    '../../lib/setDisplay': { getDisplaySetName: () => 'Fixture set' }, '../../lib/stackrSizing': { stackrCardImageSizes: { cardAspectRatio: 0.71 } },
    '../../lib/haptics': { stackrHaptics: { selection: async () => {}, cardPreview: async () => {} } },
    '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) },
    '../../lib/cardInspection': { CARD_INSPECTION_LONG_PRESS_MS: 300 }, '../../lib/useCataloguePriceOverlay': { useCataloguePriceOverlay: (rows: any[], overlay: any) => {
      priceObservers.push(overlay.onReadDiagnostic); return React.useMemo(() => rows.map(row => ({ ...row })), [rows]);
    } },
    '../../lib/optionalCatalogueEnrichment': { readOptionalCatalogueEnrichment },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, {
    exports, Set, Map, AbortController, console: { log() {} },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected screen dependency: ${name}`); return dependencies[name]; },
    fetch: async (url: string, init?: { signal?: AbortSignal }) => {
      assert.equal(url, `https://pokeapi.co/api/v2/pokemon/${route.id}`, 'metadata stays on the expected fixture route');
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
  return { render, flush, requests, metadataSignals, priceObservers, nodes, list, retry, track, text: () => renderedText(tree),
    tile: (item = cards[0]) => list().props.renderItem({ item }),
    route: (next: typeof route) => { route = next; }, blur: () => focusCleanup?.(),
    account: (id: string) => { retrieval.resetRetrievalObservations(); auth = { ...auth, user: { id } }; },
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

function fallbackService(options: { failFirstCanonical?: boolean; pendingPrices?: boolean; failArtwork?: boolean; missingImages?: boolean } = {}) {
  let canonicalReads = 0;
  let priceReads = 0;
  let artworkReads = 0;
  let releasePrices!: () => void;
  const priceWait = new Promise<void>(resolve => { releasePrices = resolve; });
  const results: Progress[] = [];
  const fallbackCards = cards.slice(0, 16).map(card => ({ ...card, name: 'Raichu' }));
  const canonicalCards = cards.map((card, index) => ({ cardId: `recovered-${index}`, defaultVariantId: `variant-${index}`,
    legacy: options.missingImages ? { ...card, image_small: null, image_large: null, image_urls: [] } : card }));
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
      fetchStackrPriceSnapshots: async () => { priceReads++; if (options.pendingPrices) await priceWait; return new Map(); },
      stackrCardToLegacyCard: (card: any) => ({ ...card.legacy, id: card.cardId, name: 'Raichu' }),
    },
    './stackrApiV1': { stackrApiClient: {
      pokemonCards: async () => {
        canonicalReads += 1;
        if (canonicalReads === 1 && options.failFirstCanonical !== false) throw new Error('Internal fixture transport failure');
        return { data: { cards: canonicalCards }, meta: {} };
      },
      assetManifest: async () => { artworkReads++; if (options.failArtwork) throw new Error('fixture artwork failure'); return { data: { assets: [] }, meta: {} }; },
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
    readCards: async (name: string, options: { onProgress: (progress: Progress) => void; onDiagnostic?: (event: ReadDiagnostic) => void }): Promise<Progress> => {
      const result = await exports.fetchCardsForPokemon(name, options);
      results.push(result);
      return result;
    },
    reads: () => canonicalReads, results, priceReads: () => priceReads, artworkReads: () => artworkReads, releasePrices,
  };
}

async function assertRetrievalStages() {
  retrieval.resetRetrievalObservations();
  let now = 0;
  const indexSource = readFileSync('app/(tabs)/pokedex.tsx', 'utf8');
  const syntax = ts.createSourceFile('pokedex.tsx', indexSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tap = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(syntax) === 'onPress' && node.initializer
      && ts.isJsxExpression(node.initializer) && node.initializer.expression
      && node.initializer.expression.getText(syntax).includes('startPokedexRetrieval')) tap = node.initializer.expression.getText(syntax);
    ts.forEachChild(node, visit);
  };
  visit(syntax); assert.ok(tap, 'exercise the real species tile action');
  const context: any = {
    item: { routeId: 26, routeName: 'raichu', speciesName: 'raichu', speciesId: 26 },
    startPokedexRetrieval: (key: string) => retrieval.startPokedexRetrieval(key, 'tap', () => now),
    router: { push: () => assert.equal(retrieval.exportRetrievalObservations().observations.at(-1)!.origin, 'tap', 'trace starts before navigation dispatch') },
  };
  runInNewContext(ts.transpileModule(`globalThis.tap = ${tap};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.tap(); now = 80;
  const h = harness({ ownershipPending: true }); h.render(); await h.flush();
  let observed = () => retrieval.exportRetrievalObservations().observations;
  assert.equal(observed().length, 1, 'detail consumes its matching tile trace');
  assert.equal(observed()[0].phasesMs['ownership-ready'], undefined);
  assert.equal(observed()[0].phasesMs['facts-ready'], undefined);
  now = 100;
  h.requests[0].diagnostic({ source: 'canonical-facts', phase: 'page' });
  h.requests[0].publish({ cards: cards.slice(0, 24), complete: false }); h.render(); await h.flush();
  assert.equal(observed()[0].phasesMs['facts-ready'], 100, 'accepted facts include navigation latency');
  assert.equal(observed()[0].phasesMs['facts-committed'], 100);
  assert.equal(observed()[0].source, 'network');
  assert.equal(observed()[0].phasesMs['visible-rows'], undefined);
  h.list().props.onViewableItemsChanged({ viewableItems: [{ item: { ...h.list().props.data[0] } }] });
  assert.equal(observed()[0].phasesMs['visible-rows'], undefined, 'an uncommitted same-ID row cannot satisfy viewability');
  now = 120; h.list().props.onViewableItemsChanged({ viewableItems: [{ item: h.list().props.data[0] }] });
  assert.equal(observed()[0].phasesMs['visible-rows'], 120, 'actual committed overlay rows may satisfy viewability');
  const image = renderedNodes(h.tile()).find(node => node.type === 'StackrImage');
  now = 150; image.props.onDiagnostic({ phase: 'loaded', rendition: 'thumbnail', attempt: 1, cache: 'disk', width: 240, height: 336 });
  assert.equal(observed()[0].phasesMs['thumbnail-displayed'], undefined, 'decoding does not imply display');
  now = 160; image.props.onDiagnostic({ phase: 'displayed', rendition: 'thumbnail', attempt: 1 });
  assert.equal(observed()[0].phasesMs['thumbnail-displayed'], 160);
  const oldPriceObserver = h.priceObservers.at(-1)!;
  now = 170; oldPriceObserver('complete');
  assert.equal(observed()[0].phasesMs['price-read-complete'], 170);
  assert.equal(observed()[0].phasesMs['prices-ready'], undefined, 'a completed read is not quote coverage');
  assert.equal(observed()[0].phasesMs['facts-settled'], undefined, 'images and price reads never settle facts');
  now = 180;
  const partial = { cards: cards.slice(0, 24), complete: false, error: new Error('page two fixture failure') };
  h.requests[0].publish(partial); h.requests[0].resolve(partial); await tick(); h.render(); await h.flush();
  assert.equal(observed()[0].phasesMs['facts-settled'], 180);
  assert.equal(observed()[0].outcome, 'partial');
  const beforeRetry = JSON.stringify(observed()[0]);
  h.retry().props.onPress();
  assert.equal(observed().at(-1)!.origin, 'retry', 'rendered Retry starts before the epoch update');
  h.render(); await h.flush();
  image.props.onDiagnostic({ phase: 'failed', rendition: 'detail', attempt: 2, terminal: true });
  oldPriceObserver('failed'); h.requests[0].diagnostic({ source: 'artwork', phase: 'complete' });
  assert.equal(JSON.stringify(observed()[0]), beforeRetry, 'old image/price/artwork completions cannot alter a superseded journey');
  assert.equal(observed().at(-1)!.images.failed, 0);
  assert.equal(observed().at(-1)!.phasesMs['facts-ready'], undefined, 'retained old rows are not relabelled as a fresh read');
  h.requests[1].diagnostic({ source: 'canonical-facts', phase: 'complete' });
  h.requests[1].publish({ cards, complete: true }); h.requests[1].resolve({ cards, complete: true });
  await tick(); h.render(); await h.flush();
  assert.equal(observed().at(-1)!.outcome, 'success');
  assert.deepEqual(observed().at(-1)!.failures, []);
  const oldRetryImage = renderedNodes(h.tile()).find(node => node.type === 'StackrImage');
  const closedRetry = JSON.stringify(observed().at(-1));
  h.route({ id: '27', name: 'sandshrew', speciesId: '27', speciesName: 'sandshrew' }); h.render();
  oldRetryImage.props.onDiagnostic({ phase: 'displayed', rendition: 'detail', attempt: 1 });
  assert.equal(JSON.stringify(observed().at(-1)), closedRetry, 'render invalidates an obsolete route before effects run');
  await h.flush();
  assert.equal(observed().at(-1)!.origin, 'screen-load');
  assert.equal(h.requests.at(-1)!.name, 'sandshrew');
  const beforeBlur = observed().length; h.blur();
  assert.equal(observed().at(-1)!.outcome, 'cancelled');
  const blurred = JSON.stringify(observed());
  h.requests.at(-1)!.diagnostic({ source: 'prices', phase: 'failed' });
  h.requests.at(-1)!.publish({ cards, complete: true });
  assert.equal(JSON.stringify(observed()), blurred, 'blur deactivates optional and factual callbacks without blocking existing content reads');
  h.unmount(); assert.equal(observed().length, beforeBlur);

  retrieval.resetRetrievalObservations();
  const account = harness(); account.render(); await account.flush();
  const request = account.requests[0];
  account.account('private-account-b'); account.render();
  request.diagnostic({ source: 'canonical-facts', phase: 'page' }); request.publish({ cards, complete: true });
  assert.equal(observed().length, 0, 'account reset prevents the old account journey entering the next export window');
  account.unmount();
  const dismissed = harness(); dismissed.render(); await dismissed.flush(); dismissed.unmount();
  const afterDismissal = JSON.stringify(observed());
  dismissed.requests[0].publish({ cards, complete: true }); dismissed.requests[0].diagnostic({ source: 'artwork', phase: 'failed' });
  assert.equal(JSON.stringify(observed()), afterDismissal, 'unmount prevents late source diagnostics');
  assert.doesNotMatch(JSON.stringify(observed()), /private-account|raichu|sandshrew|printing-|https:/);

  const service = fallbackService({ failFirstCanonical: false, pendingPrices: true, failArtwork: true, missingImages: true });
  const diagnostics: ReadDiagnostic[] = [];
  const result = await service.readCards('raichu', { onProgress() {}, onDiagnostic(event) { diagnostics.push(event); throw new Error('observer fixture failure'); } });
  await tick();
  assert.equal(result.cards.length, 30); assert.equal(result.complete, true, 'throwing observers and artwork failure cannot fail factual retrieval');
  assert.equal(service.priceReads(), 1); assert.equal(service.artworkReads(), 1);
  assert.ok(diagnostics.some(event => event.source === 'canonical-facts' && event.phase === 'complete'));
  assert.ok(diagnostics.some(event => event.source === 'artwork' && event.phase === 'failed'));
  assert.equal(diagnostics.some(event => event.source === 'prices'), false, 'pending prices do not delay factual settlement or invent completion');
  const factualSnapshot = JSON.stringify(result); service.releasePrices(); await tick(); await tick();
  assert.ok(diagnostics.some(event => event.source === 'prices' && event.phase === 'complete'));
  assert.equal(JSON.stringify(result), factualSnapshot, 'optional diagnostic completion does not mutate returned facts');
}

async function run() {
  await assertRetrievalStages();
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
