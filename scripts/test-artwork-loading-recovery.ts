import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments, mergePreferredSetArtwork } from '../lib/stackrPreferredSetArtwork';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
assert.match(card, /foundInCache && found/);
assert.match(card, /enrichStackrCardArtworkFromFacts\(\[canonicalFacts\], artworkAbort\.signal\)/);
assert.match(card, /mergeSetCardArtwork\(\[current as CanonicalPokemonCard\], enriched\)/);
assert.match(card, /artworkLoading \? 'Loading artwork…' : 'No image'/);
assert.match(card, /if \(!mounted \|\| artworkAbort\.signal\.aborted\) return/);
assert.match(card, /artworkAbort\.abort\(\)/, 'route cleanup aborts optional canonical artwork recovery');

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
let params: { id?: string; setId?: string } = { id: 'card-a', setId: 'set-a' };
const cards: Record<string, any> = {
  'card-a': { id: 'card-a', name: 'Cached A', number: '1', language: 'en', set: { id: 'set-a', name: 'Fixture' }, raw_data: {} },
  'card-b': { id: 'card-b', name: 'Cached B', number: '2', language: 'en', set: { id: 'set-b', name: 'Fixture' }, raw_data: {} },
  'card-c': { id: 'card-c', name: 'Cached C', number: '3', language: 'en', set: { id: 'set-c', name: 'Fixture' }, raw_data: {} },
};
for (const value of Object.values(cards)) value.raw_data.stackr = { canonical: true, cardId: value.id,
  catalogueVersionId: 'fixture-version', defaultVariantId: `${value.id}-normal`,
  variants: [{ variantId: `${value.id}-normal`, canonicalId: `${value.id}:normal`, variantCode: 'normal', finishCode: 'normal' }] };
const cachedFact: any = { cardId: 'card-d', catalogueVersionId: 'fixture-version', game: 'pokemon', languageCode: 'en',
  set: { setId: 'set-d' }, collectorNumber: { value: '4' }, defaultVariantId: 'card-d-normal', variants: [
    { variantId: 'card-d-first', canonicalId: 'card-d:first_edition', variantCode: 'first_edition', finishCode: 'first_edition', imageVariantId: 'card-d-normal', image: null },
    { variantId: 'card-d-normal', canonicalId: 'card-d:normal', variantCode: 'normal', finishCode: 'normal', imageVariantId: 'card-d-normal',
      image: { assetId: 'immutable-d', assetType: 'card_image', game: 'pokemon', cardId: 'card-d', variantId: 'card-d-normal', permissionStatus: 'approved', deliveryUrl: 'https://approved.invalid/old-d.jpg' } },
  ] };
function displayCard(fact: any) {
  const artwork = resolveCardArtwork(fact);
  const display = { id: fact.cardId, name: 'Cached D', number: '4', language: 'en', set: { id: 'set-d', name: 'Fixture' },
    images: { small: artwork.small, large: artwork.large }, raw_data: { stackr: { canonical: true, cardId: fact.cardId,
      catalogueVersionId: fact.catalogueVersionId, defaultVariantId: fact.defaultVariantId, variants: fact.variants },
    images: { small: artwork.small, large: artwork.large }, presentation: { artwork, selected_image_variant_id: artwork.sourceVariantId } } };
  copyPreferredSetArtworkReassignments(fact, display.raw_data);
  return display;
}
cards['card-d'] = displayCard(cachedFact);
const reassignedFact = structuredClone(cachedFact);
reassignedFact.variants[0].image = { ...cachedFact.variants[1].image, variantId: 'card-d-first' };
reassignedFact.variants[1].image = null;
const correctedCard = displayCard(mergePreferredSetArtwork([cachedFact], [reassignedFact])[0]);
const pokemonSource = ts.createSourceFile('pokemonTcg.ts', readFileSync('lib/pokemonTcg.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const mergeFunctions = pokemonSource.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['setCardArtworkIdentity', 'mergeSetCardArtwork'].includes(node.name?.text ?? ''));
const mergeModule = { exports: {} as any };
runInNewContext(ts.transpileModule(mergeFunctions.map(node => node.getText(pokemonSource)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mergeModule, exports: mergeModule.exports, copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments });
let owner: string | null = null;
const artworkRequests: { signal?: AbortSignal; response: ReturnType<typeof deferred<any[]>> }[] = [];
const theme = { colors: new Proxy({}, { get: () => '#123456' }) };
const native = { View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Image: 'Image', StyleSheet: { create: <T,>(value: T) => value }, Alert: { alert() {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
const dependencies: Record<string, any> = {
  react: React, 'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'expo-router': { Stack: { Screen: 'StackScreen' }, router: { canGoBack: () => true, back() {}, replace() {}, push() {} }, useLocalSearchParams: () => params },
  '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' }, '../../components/Text': { Text: 'Text' }, '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) }, '../../components/InteractiveCardInspectPressable': { CardDetailInspectSurface: 'InspectSurface' }, '../../components/theme-context': { useTheme: () => ({ theme }) }, '../../components/StackrCardIdentity': { StackrCardIdentity: 'Identity' }, '../../components/StackrControls': { StackrButton: 'Button' }, '../../components/EditionAwareCardImage': 'EditionImage', '../../components/CardInspectionStage': { CardInspectionStage: 'Stage' }, '../../components/PokeTraceMarketInsights': 'MarketInsights', '../../components/PricingV2Summary': 'Pricing', '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrBackButton': { StackrBackButton: 'Back' }, '../../components/RaritySymbol': { RARITY_SYMBOL_CARD_OVERLAY: {}, RaritySymbol: 'Rarity' },
  '../../components/trade-context': { useTrade: () => ({ isWanted: () => false, toggleWishlistCard: async () => {}, myListings: [], marketplaceListings: [], refreshTrade: async () => {} }) }, '../../components/app-mode-context': { useAppMode: () => ({ premiumSellerAccess: false }) }, '../../components/auth-context': { useAuth: () => ({ user: owner ? { id: owner } : null }) },
  '../../lib/corocoroIssueArchive': { getCorocoroIssuesForCard: () => [], formatCorocoroIssueMonth: () => '' }, '../../lib/editionImages': { getEditionVariantImageUrl: () => null }, '../../lib/marketplace': { deleteMarketplaceListing: async () => {} }, '../../lib/stackrIcons': { stackrIcons: { chase: 1 } }, '../../lib/pokemonTcgCache': { getCachedCardSync: (_setId: string, cardId: string) => cards[cardId] ?? null },
  '../../lib/pokemonTcg': { fetchCardById: async () => null, normalizePokemonCardLanguage: (value: string) => value, mergeSetCardArtwork: mergeModule.exports.mergeSetCardArtwork },
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
  await act(async () => renderer.unmount());
}

async function imagefulCacheRuntime() {
  artworkRequests.splice(0); owner = 'owner-a'; params = { id: 'card-d', setId: 'set-d' };
  const Screen = compileCardScreen(); let renderer!: ReactTestRenderer;
  const hasOldImage = () => renderer.root.findAll(node => String(node.type) === 'EditionImage' && node.props.uri === 'https://approved.invalid/old-d.jpg').length > 0;
  await act(async () => { renderer = create(React.createElement(Screen)); await tick(); });
  assert.ok(hasOldImage(), 'cached canonical artwork retains its immediate first paint during recheck');
  assert.equal(artworkRequests.length, 1, 'imageful canonical cached artwork receives one bounded background recheck');
  artworkRequests[0].response.resolve([correctedCard]); await act(async () => { await tick(); });
  assert.equal(hasOldImage(), false, 'positive reassignment clears the old normal image in the actual route');
  assert.match(screenText(renderer), /No image/);
  await act(async () => renderer.unmount());

  for (const outcome of ['empty', 'failed'] as const) {
    const index = artworkRequests.length;
    await act(async () => { renderer = create(React.createElement(Screen)); await tick(); });
    if (outcome === 'empty') artworkRequests[index].response.resolve([]); else artworkRequests[index].response.reject(new Error('Synthetic optional failure'));
    await act(async () => { await tick(); });
    assert.ok(hasOldImage(), `${outcome} recheck preserves existing cached artwork`);
    await act(async () => renderer.unmount());
  }

  const first = artworkRequests.length;
  await act(async () => { renderer = create(React.createElement(Screen)); await tick(); });
  owner = 'owner-b'; await act(async () => { renderer.update(React.createElement(Screen)); await tick(); });
  owner = 'owner-a'; await act(async () => { renderer.update(React.createElement(Screen)); await tick(); });
  assert.equal(artworkRequests[first].signal?.aborted, true);
  assert.equal(artworkRequests[first + 1].signal?.aborted, true);
  artworkRequests[first].response.resolve([correctedCard]); artworkRequests[first + 1].response.resolve([correctedCard]);
  await act(async () => { await tick(); });
  assert.ok(hasOldImage(), 'old account A response stays invalid after A → B → A');
  artworkRequests[first + 2].response.resolve([correctedCard]); await act(async () => { await tick(); });
  assert.equal(hasOldImage(), false);
  await act(async () => renderer.unmount());

  const oldRoute = artworkRequests.length;
  await act(async () => { renderer = create(React.createElement(Screen)); await tick(); });
  params = { id: 'card-c', setId: 'set-c' }; await act(async () => { renderer.update(React.createElement(Screen)); await tick(); });
  assert.equal(artworkRequests[oldRoute].signal?.aborted, true);
  artworkRequests[oldRoute].response.resolve([correctedCard]); await act(async () => { await tick(); });
  assert.equal(renderer.root.findByType('Identity' as any).props.name, 'Cached C');
  await act(async () => renderer.unmount());
  artworkRequests.at(-1)!.response.resolve([]); await act(async () => { await tick(); });
}

void cardRuntime().then(imagefulCacheRuntime).then(() => console.log('Set and Card Detail artwork recovery controls and actual cached-image reassignment, failure, account/route supersession and abort transitions passed.')).catch((error) => { console.error(error); process.exitCode = 1; });
