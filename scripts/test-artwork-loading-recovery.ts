import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

const set = readFileSync('app/set/[id].tsx', 'utf8');
assert.match(set, /const \[artworkLoading, setArtworkLoading\] = useState\(false\)/);
assert.match(set, /setLoading\(true\);\s*setArtworkLoading\(false\);/, 'each Set Detail request clears an aborted request’s pending artwork state before facts load');
assert.match(set, /enrichStackrCardArtworkFromFacts\(fetchedCards/);
assert.match(set, /fallback=\{artworkLoading && !card\.images\?\.small && !card\.images\?\.large/);
assert.match(set, /mergeSetCardArtwork\(current, progress\)/);
assert.match(set, /isCurrent\(\) && !artworkAbort\.signal\.aborted\) setArtworkLoading\(false\)/);

const card = readFileSync('app/card/[id].tsx', 'utf8');
assert.match(card, /getCachedCardSync\(paramSetId, cardId\)/);
assert.match(card, /setLoading\(true\);\s*setArtworkLoading\(false\);/, 'each Card Detail request clears a previous pending artwork state before cache lookup');
assert.match(card, /foundInCache && found && !found\.images\?\.small && !found\.images\?\.large/);
assert.match(card, /enrichStackrCardArtworkFromFacts\(\[canonicalFacts\], artworkAbort\.signal\)/);
assert.match(card, /mergeSetCardArtwork\(\[current as CanonicalPokemonCard\], enriched\)/);
assert.match(card, /artworkLoading \? 'Loading artwork…' : 'No image'/);
assert.match(card, /if \(!mounted \|\| artworkAbort\.signal\.aborted\) return/);
assert.match(card, /artworkAbort\.abort\(\)/, 'route cleanup aborts optional canonical artwork recovery');

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
let params: { id?: string; setId?: string } = { id: 'card-a', setId: 'set-a' };
const cards: Record<string, any> = {
  'card-a': { id: 'card-a', name: 'Cached A', number: '1', language: 'en', set: { id: 'set-a', name: 'Fixture' }, raw_data: {} },
  'card-b': { id: 'card-b', name: 'Cached B', number: '2', language: 'en', set: { id: 'set-b', name: 'Fixture' }, raw_data: {} },
  'card-c': { id: 'card-c', name: 'Cached C', number: '3', language: 'en', set: { id: 'set-c', name: 'Fixture' }, raw_data: {} },
};
const artworkRequests: { signal?: AbortSignal; response: ReturnType<typeof deferred<any[]>> }[] = [];
const theme = { colors: new Proxy({}, { get: () => '#123456' }) };
const native = { View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Image: 'Image', StyleSheet: { create: <T,>(value: T) => value }, Alert: { alert() {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
const dependencies: Record<string, any> = {
  react: React, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'expo-router': { Stack: { Screen: 'StackScreen' }, router: { canGoBack: () => true, back() {}, replace() {}, push() {} }, useLocalSearchParams: () => params },
  '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' }, '../../components/Text': { Text: 'Text' }, '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) }, '../../components/InteractiveCardInspectPressable': { CardDetailInspectSurface: 'InspectSurface' }, '../../components/theme-context': { useTheme: () => ({ theme }) }, '../../components/StackrCardIdentity': { StackrCardIdentity: 'Identity' }, '../../components/StackrControls': { StackrButton: 'Button' }, '../../components/EditionAwareCardImage': 'EditionImage', '../../components/CardInspectionStage': { CardInspectionStage: 'Stage' }, '../../components/PokeTraceMarketInsights': 'MarketInsights', '../../components/PricingV2Summary': 'Pricing', '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrBackButton': { StackrBackButton: 'Back' }, '../../components/RaritySymbol': { RARITY_SYMBOL_CARD_OVERLAY: {}, RaritySymbol: 'Rarity' },
  '../../components/trade-context': { useTrade: () => ({ isWanted: () => false, toggleWishlistCard: async () => {}, myListings: [], marketplaceListings: [], refreshTrade: async () => {} }) }, '../../components/app-mode-context': { useAppMode: () => ({ premiumSellerAccess: false }) }, '../../components/auth-context': { useAuth: () => ({ user: null }) },
  '../../lib/corocoroIssueArchive': { getCorocoroIssuesForCard: () => [], formatCorocoroIssueMonth: () => '' }, '../../lib/editionImages': { getEditionVariantImageUrl: () => null }, '../../lib/marketplace': { deleteMarketplaceListing: async () => {} }, '../../lib/stackrIcons': { stackrIcons: { chase: 1 } }, '../../lib/pokemonTcgCache': { getCachedCardSync: (_setId: string, cardId: string) => cards[cardId] ?? null },
  '../../lib/pokemonTcg': { fetchCardById: async () => null, normalizePokemonCardLanguage: (value: string) => value, mergeSetCardArtwork: (current: any[], incoming: any[]) => current.map((value) => { const exact = incoming.find((candidate) => candidate.id === value.id); return exact?.images ? { ...value, images: exact.images } : value; }) },
  '../../lib/stackrDomainAdapter': { enrichStackrCardArtworkFromFacts: (_facts: any[], signal?: AbortSignal) => { const response = deferred<any[]>(); artworkRequests.push({ signal, response }); return response.promise; } }, '../../lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } } }, '../../lib/manualCollectionDraft': { createManualCollectionDraft: async () => null }, '../../lib/setDisplay': { getDisplaySetLogoUrl: () => null }, '../../lib/localSetArtwork': { getLocalSetArtworkSourceForSet: () => null }, '../../lib/pricing': { fetchPokeTraceCardPrice: async () => null }, '../../lib/personalPriceRefresh': { refreshPersonalProviderEstimate: async () => null }, '../../lib/stackrApiV1': { StackrApiV1Error: class extends Error {} }, '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 0 }, stackrCardImageSizes: { cardAspectRatio: 0.715 } }, '../../lib/foreignCardPresentation': { buildForeignCardPresentation: (value: any) => ({ name: value.name, setName: value.set?.name, cardNumber: value.number, languageLabel: value.language, details: {} }) }, '../../lib/useCataloguePriceOverlay': { useCataloguePriceOverlay: (value: any[]) => value },
};

function compileCardScreen() {
  const module = { exports: {} as Record<string, unknown> };
  const output = ts.transpileModule(card, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module, exports: module.exports, React, Promise, Map, Set, Array, String, Number, Boolean, Object, RegExp, Math, console, AbortController,
    require: (name: string) => { assert.ok(name in dependencies, `Card Detail unexpectedly imports ${name}`); return dependencies[name]; },
  });
  return module.exports.default as React.ComponentType;
}
function screenText(renderer: ReactTestRenderer) { return renderer.root.findAll((node) => String(node.type) === 'Text').flatMap((node) => node.props.children).join(' '); }

async function cardRuntime() {
  const CardDetailScreen = compileCardScreen(); let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(CardDetailScreen)); await tick(); });
  assert.equal(artworkRequests.length, 1, 'a cached metadata-only card starts one bounded canonical artwork recovery');
  assert.match(screenText(renderer), /Loading artwork/, 'the real Card Detail screen publishes cached metadata with an explicit pending-artwork label');

  params = { id: 'card-b', setId: 'set-b' }; await act(async () => { renderer.update(React.createElement(CardDetailScreen)); await tick(); });
  assert.equal(artworkRequests[0].signal?.aborted, true, 'changing the route aborts the old optional artwork request');
  artworkRequests[0].response.resolve([{ ...cards['card-a'], images: { small: 'old-a.png' } }]); await act(async () => { await tick(); });
  assert.ok(!renderer.root.findAll((node) => String(node.type) === 'EditionImage' && node.props.uri === 'old-a.png').length, 'late artwork from the old route cannot repaint the new card');
  assert.equal(artworkRequests.length, 2, 'the new cached card owns a separate artwork request');
  artworkRequests[1].response.resolve([]); await act(async () => { await tick(); });
  assert.match(screenText(renderer), /No image/, 'an exhausted canonical recovery leaves the honest unavailable-artwork state');

  params = { id: 'card-c', setId: 'set-c' }; await act(async () => { renderer.update(React.createElement(CardDetailScreen)); await tick(); });
  artworkRequests[2].response.resolve([{ ...cards['card-c'], images: { small: 'exact-c.png', large: 'exact-c-large.png' } }]); await act(async () => { await tick(); });
  const exact = renderer.root.findAll((node) => String(node.type) === 'EditionImage' && node.props.uri === 'exact-c.png');
  assert.equal(exact.length, 1, 'the real Card Detail screen replaces only the current cached card with its exact enriched artwork');
}

void cardRuntime().then(() => console.log('Set and Card Detail artwork recovery controls and runtime transitions passed.')).catch((error) => { console.error(error); process.exitCode = 1; });
