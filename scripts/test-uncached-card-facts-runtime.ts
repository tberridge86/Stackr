import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as inspection from '../lib/cardInspection';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';
import { copyPreferredSetArtworkReassignments } from '../lib/stackrPreferredSetArtwork';
import {
  defineTcgdexRuntimeImageOverlay, enforceTcgdexRuntimeImagePolicy,
  isTcgdexControlledCardReferenceSourceEnabled,
  resolveTcgdexControlledCardReference,
} from '../lib/tcgdexControlledCardReference';
import {
  getTcgdexControlledReferenceLookupIdentity, matchTcgdexProviderCardFromLiveSet,
  normalizeTcgdexCollectorIdentity,
} from '../lib/tcgdexControlledReferenceLookup';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function extract<T>(path: string, name: string, scope: Record<string, unknown>): T {
  const source = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Actual ${name} function is required`);
  const output = ts.transpileModule(`const tested = ${declaration.getText(tree).replace(/^export /, '')};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), `${output}; return tested;`)(...Object.values(scope)) as T;
}

const setId = '903d5baa-27c7-5690-b1d7-2395c770204a';
const normal = '00000000-0000-4000-8000-000000000001';
const selected = '00000000-0000-4000-8000-000000000002';
const reference = resolveTcgdexControlledCardReference({
  language: 'ja', providerCardId: 'M6-001', providerSetId: 'M6', localId: '001',
  provenance: 'tcgdex_live_or_ttl_cached_provider_card_record',
  providerImageBase: 'https://assets.tcgdex.net/ja/cards/M6/001',
});
assert.ok(reference, 'The actual controlled-reference policy must issue the fixture');
const lowReference = reference.uri;
assert.equal(enforceTcgdexRuntimeImagePolicy(lowReference), lowReference);

function pipeline(reference: string, missing = false, invalidVariant = false, deferFacts = false) {
  const facts = deferred<void>();
  const manifest = deferred<any[]>();
  const providerSet = deferred<any>();
  const providerCard = deferred<any>();
  let providerSetCalls = 0;
  let providerCardCalls = 0;
  const canonical = {
    cardId: reference, catalogueVersionId: 'version-ja', languageCode: 'ja',
    set: { setId, setCode: 'M6', nativeName: 'ストームエメラルダ' },
    collectorNumber: { value: '001' }, names: { native: 'ヘラクロス', englishDisplay: 'Heracross' },
    defaultVariantId: normal, variants: [{ variantId: normal }, { variantId: selected }],
  };
  const map = (value: any, assets: any[] = []) => ({
    id: value.cardId, name: value.names.englishDisplay, number: value.collectorNumber.value,
    language: value.languageCode, set: { id: setId, name: 'Storm Emeralda' },
    externalIds: { tcgdex: 'M6-001', stackrVariant: value.defaultVariantId },
    images: assets.length ? { small: assets[0].deliveryUrl } : {},
    raw_data: { id: 'M6-001', language: 'ja', localId: '001',
      set: { id: setId, tcgdex_id: 'M6', set_code: 'M6' },
      stackr: { cardId: value.cardId, defaultVariantId: value.defaultVariantId } },
  });
  const fetchStackrCard = extract<any>('lib/stackrDomainAdapter.ts', 'fetchStackrCard', {
    stackrApiClient: {}, shouldUseStackrApi: () => true, copyPreferredSetArtworkReassignments,
    resolveCachedStackrCard: async () => {
      if (deferFacts) await facts.promise;
      return missing ? null : ({ card: canonical, variantId: invalidVariant ? 'absent' : selected });
    },
    embeddedCardImageAssets: () => [], primaryCardImageAsset: () => null,
    stackrCardToLegacyCard: map, readOptionalCatalogueEnrichment,
    // Preserve the real helper's bounded optional-read contract at this fixture boundary.
    fetchStackrAssetsForPrinting: () => readOptionalCatalogueEnrichment(() => manifest.promise),
  });
  const attachLiveTcgdexCardReferences = extract<any>('lib/pokemonTcg.ts', 'attachLiveTcgdexCardReferences', {
    isTcgdexControlledCardReferenceSourceEnabled, defineTcgdexRuntimeImageOverlay,
    enforceTcgdexRuntimeImagePolicy, getTcgdexControlledReferenceLookupIdentity,
    matchTcgdexProviderCardFromLiveSet, normalizeTcgdexCollectorIdentity,
    normalizePokemonCardLanguage: (value: string) => value,
    fetchForeignPokemonSet: () => { providerSetCalls += 1; return providerSet.promise; },
    fetchForeignPokemonCard: () => { providerCardCalls += 1; return providerCard.promise; },
  });
  const fetchCardById = extract<any>('lib/pokemonTcg.ts', 'fetchCardById', {
    fetchStackrCard, fromStackrCard: (value: unknown) => value, attachLiveTcgdexCardReferences,
  });
  return { fetchStackrCard, fetchCardById, canonical, facts, manifest, providerSet, providerCard,
    providerCalls: () => [providerSetCalls, providerCardCalls] };
}

async function adapterContract() {
  const flow = pipeline('exact-printing');
  let early: any;
  let settled = false;
  const pending = flow.fetchStackrCard('exact-printing', { onCanonicalCard: (card: any) => { early = card; } })
    .then((value: any) => { settled = true; return value; });
  await tick();
  assert.equal(early?.id, 'exact-printing', 'Actual adapter must publish canonical facts before an unresolved image manifest');
  assert.equal(early.externalIds.stackrVariant, selected, 'Only the selected verified finish reaches the callback');
  assert.equal(flow.canonical.defaultVariantId, normal, 'Publication cannot mutate cached printing defaults');
  assert.equal(settled, false);
  flow.manifest.reject(new Error('Optional manifest unavailable'));
  assert.equal((await pending).id, early.id, 'Optional manifest failure retains the canonical model');
  for (const [missing, invalid] of [[true, false], [false, true]]) {
    let publications = 0;
    const rejected = pipeline('invalid-printing', missing, invalid);
    assert.equal(await rejected.fetchStackrCard('invalid-printing', { onCanonicalCard: () => { publications += 1; } }), null);
    assert.equal(publications, 0, 'Missing facts or an absent selected variant never become an early card');
  }
}

async function screenContract() {
  let params: { id: string; setId: string; editionHint?: string } = { id: 'printing-a', setId };
  let account: string | null = 'A';
  let observedCard: any;
  const priceReads: any[] = [];
  const flows: ReturnType<typeof pipeline>[] = [];
  const makeRead = (id: string, options: unknown) => {
    const flow = pipeline(id, id === 'missing', false, id === 'late-facts'); flows.push(flow);
    return flow.fetchCardById(id, options);
  };
  const native = {
    View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable', Image: 'Image',
    StyleSheet: { create: <T,>(value: T) => value }, Alert: { alert() {} },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
  const theme = { colors: new Proxy({}, { get: () => '#123456' }) };
  const dependencies: Record<string, any> = {
    '../../components/StackrFunctionalIcon': { StackrFunctionalIcon: 'Image' },
    react: React, 'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-router': { Stack: { Screen: 'StackScreen' }, router: { canGoBack: () => true, back() {}, replace() {}, push() {} }, useLocalSearchParams: () => params },
    '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' },
    '../../components/Text': { Text: 'Text' }, '../../components/StackrCardIdentity': { StackrCardIdentity: 'Identity' },
    '../../components/StackrControls': { StackrButton: 'Button' },
    '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) },
    '../../lib/cardInspection': inspection,
    '../../components/InteractiveCardInspectPressable': { CardDetailInspectSurface: 'InspectSurface' },
    '../../components/theme-context': { useTheme: () => ({ theme }) },
    '../../components/EditionAwareCardImage': 'EditionImage', '../../components/CardInspectionStage': { CardInspectionStage: 'Stage' },
    '../../components/PokeTraceMarketInsights': 'MarketInsights', '../../components/PricingV2Summary': 'Pricing',
    '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrBackButton': { StackrBackButton: 'Back' },
    '../../components/RaritySymbol': { RARITY_SYMBOL_CARD_OVERLAY: {}, RaritySymbol: 'Rarity' },
    '../../components/trade-context': { useTrade: () => ({ isWanted: () => false, toggleWishlistCard: async () => {}, myListings: [], marketplaceListings: [], refreshTrade: async () => {} }) },
    '../../components/app-mode-context': { useAppMode: () => ({ premiumSellerAccess: false }) },
    '../../components/auth-context': { useAuth: () => ({ user: account ? { id: account } : null }) },
    '../../lib/corocoroIssueArchive': { getCorocoroIssuesForCard: () => [], formatCorocoroIssueMonth: () => '' },
    '../../lib/editionImages': { getEditionVariantImageUrl: () => null }, '../../lib/marketplace': { deleteMarketplaceListing: async () => {} },
    '../../lib/stackrIcons': { stackrIcons: { chase: 1 } }, '../../lib/pokemonTcgCache': { getCachedCardSync: () => null },
    '../../lib/pokemonTcg': { fetchCardById: makeRead, normalizePokemonCardLanguage: (value: string) => value,
      mergeSetCardArtwork: () => assert.fail('Uncached provider imagery must keep its transient overlay instead of being spread through a merge') },
    '../../lib/stackrDomainAdapter': { enrichStackrCardArtworkFromFacts: () => assert.fail('Uncached facts already have their existing enrichment pipeline') },
    '../../lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: account ? { id: account } : null }, error: null }) } } },
    '../../lib/manualCollectionDraft': { createManualCollectionDraft: async () => null },
    '../../lib/setDisplay': { getDisplaySetLogoUrl: () => null }, '../../lib/localSetArtwork': { getLocalSetArtworkSourceForSet: () => null },
    '../../lib/pricing': { fetchPokeTraceCardPrice: async (identity: unknown) => {
      priceReads.push(identity);
      return { stackr_central: 12, stackr_low: 10, stackr_high: 15, ebay_count: 2 };
    } }, '../../lib/personalPriceRefresh': { refreshPersonalProviderEstimate: async () => null },
    '../../lib/stackrApiV1': { StackrApiV1Error: class extends Error {} },
    '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 0 }, stackrCardImageSizes: { cardAspectRatio: 0.715 } },
    '../../lib/foreignCardPresentation': { buildForeignCardPresentation: (value: any) => ({ name: value.name, setName: value.set?.name, cardNumber: value.number, languageLabel: value.language, details: {} }) },
    '../../lib/useCataloguePriceOverlay': { useCataloguePriceOverlay: (cards: any[]) => { observedCard = cards[0]; return cards; } },
  };
  const source = readFileSync('app/card/[id].tsx', 'utf8');
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, console, AbortController, Map, Set, Promise, Intl,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected Card Detail dependency ${name}`); return dependencies[name]; } });
  const Screen = module.exports.default as React.ComponentType;
  let renderer!: ReactTestRenderer;
  const flush = async () => { await act(async () => { await tick(); await tick(); }); };
  const update = async () => { await act(async () => { renderer.update(React.createElement(Screen)); await tick(); }); };
  const screenText = () => renderer.root.findAll((node) => String(node.type) === 'Text').flatMap((node) => node.props.children).join(' ');
  const finish = async (flow: ReturnType<typeof pipeline>, image = true) => {
    flow.manifest.resolve([]); await flush();
    flow.providerSet.resolve({ language: 'ja', providerSetId: 'M6', cards: [] }); await flush();
    flow.providerCard.resolve(image ? { language: 'ja', providerCardId: 'M6-001', localId: '001', imageSmall: lowReference,
      controlledReference: { sourceCode: 'tcgdex', providerCardId: 'M6-001', providerSetId: 'M6', localId: '001' } } : null);
    await flush();
  };
  try {
    await act(async () => { renderer = create(React.createElement(Screen)); await tick(); });
    assert.equal(observedCard?.id, 'printing-a', 'The actual uncached screen paints factual metadata before optional work');
    assert.equal(observedCard.externalIds.stackrVariant, selected);
    assert.equal(renderer.root.findAllByType('Loading' as any).length, 0, 'The main spinner clears before the manifest/provider resolve');
    assert.match(screenText(), /Loading artwork/);
    assert.deepEqual(flows[0].providerCalls(), [0, 0], 'Facts precede even the start of the provider fallback');
    assert.equal(priceReads.length, 1, 'Canonical facts start one automatic market read');
    assert.match(screenText(), /£12\.00/, 'A successful quote is already usable while optional artwork is pending');
    await finish(flows[0]);
    assert.equal(observedCard.images.small, lowReference, 'Later exact provider imagery remains available');
    assert.equal(Object.getOwnPropertyDescriptor(observedCard, 'images')?.enumerable, false,
      'Final publication preserves the memory-only provider image overlay');
    assert.equal(JSON.stringify(observedCard).includes(lowReference), false);
    assert.equal(renderer.root.findAllByType('Pricing' as any).length, 0, 'Initial details do not mount extra price evidence reads');
    assert.equal(renderer.root.findAllByType('MarketInsights' as any).length, 0);
    const evidenceToggle = () => renderer.root.findAllByType('Button' as any).find(node => /price evidence/i.test(node.props.accessibilityLabel ?? ''))!;
    await act(async () => evidenceToggle().props.onPress());
    assert.equal(renderer.root.findAllByType('Pricing' as any).length, 1, 'Evidence control reveals working pricing panel');
    assert.equal(renderer.root.findAllByType('MarketInsights' as any).length, 1);
    await act(async () => evidenceToggle().props.onPress());
    assert.equal(renderer.root.findAllByType('Pricing' as any).length, 0);
    assert.equal(priceReads.length, 1, 'An image-only update cannot reset pricing and read it again');
    assert.match(screenText(), /£12\.00/, 'An image-only update retains the useful quote');

    params = { id: 'printing-b', setId }; await update();
    assert.equal(observedCard.id, 'printing-b');
    assert.equal(priceReads.at(-1).identifier, 'printing-b', 'A genuine printing change still reads its own price');
    const obsoleteRoute = flows.at(-1)!;
    params = { id: 'printing-c', setId }; await update();
    const currentRoute = flows.at(-1)!;
    await finish(obsoleteRoute);
    assert.equal(observedCard.id, 'printing-c', 'An obsolete route cannot publish its late final image');
    assert.equal(observedCard.images.small, undefined);
    await finish(currentRoute, false);
    assert.equal(observedCard.id, 'printing-c');
    assert.match(screenText(), /No image/, 'An exhausted optional source leaves facts with an honest image state');

    params = { id: 'printing-account', setId }; await update();
    const obsoleteAccount = flows.at(-1)!;
    const readsBeforeAccount = priceReads.length;
    account = 'B'; await update();
    const newAccount = flows.at(-1)!;
    assert.notEqual(newAccount, obsoleteAccount, 'Account transitions own a new publication generation');
    assert.equal(priceReads.length, readsBeforeAccount + 1, 'The new account owns one fresh market read');
    await finish(obsoleteAccount);
    assert.equal(observedCard.images.small, undefined, 'A late image from the old account cannot repaint the current generation');
    await finish(newAccount);
    const readsBeforeEdition = priceReads.length;
    params = { id: 'printing-account', setId, editionHint: '1st_edition' };
    await update();
    assert.equal(priceReads.length, readsBeforeEdition, 'Edition-specific cards retain their existing automatic price restriction');
    params = { id: 'printing-account', setId }; await update();
    assert.equal(priceReads.length, readsBeforeEdition + 1, 'Returning to normal edition refreshes the automatic price identity');

    params = { id: 'late-facts', setId }; await update();
    const lateFacts = flows.at(-1)!;
    assert.equal(renderer.root.findAllByType('Loading' as any).length, 1, 'Essential facts still own the main spinner');
    params = { id: 'current-facts', setId }; await update();
    const currentFacts = flows.at(-1)!;
    lateFacts.facts.resolve(); await flush();
    assert.equal(observedCard.id, 'current-facts', 'The early callback also respects route cleanup');
    await finish(lateFacts);
    assert.equal(observedCard.id, 'current-facts');
    await finish(currentFacts, false);

    params = { id: 'printing-offline', setId }; await update();
    const failed = flows.at(-1)!;
    failed.manifest.reject(new Error('Optional manifest unavailable')); await flush();
    failed.providerSet.reject(new Error('Optional provider unavailable')); await flush();
    failed.providerCard.reject(new Error('Optional provider detail unavailable')); await flush();
    assert.equal(observedCard.id, 'printing-offline', 'Optional failures never erase already-published canonical facts');
    assert.match(screenText(), /No image/);

    params = { id: 'missing', setId }; await update();
    assert.equal(observedCard, undefined);
    assert.match(screenText(), /Card not found/, 'A genuinely absent essential card stays not found');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
}

void adapterContract().then(screenContract).then(() => {
  console.log('Uncached Card Detail publishes selected canonical facts before deferred manifest/provider work, retains source overlays and rejects stale route/account results.');
}).catch((error) => { console.error(error); process.exitCode = 1; });
