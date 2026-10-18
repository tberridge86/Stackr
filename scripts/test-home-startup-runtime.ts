import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as homeCache from '../lib/homeCollectionCache';
import * as prepared from '../lib/preparedCollectionValuation';
import * as pricingState from '../lib/collectionPricingState';
import * as stablePrices from '../lib/stableCollectionPrices';
import * as cardReferences from '../lib/scanCardReferenceHydration';
import { getHomeCardDisplayMetadata } from '../lib/homeCardDisplayMetadata';
import { resolveTcgdexControlledCardReference } from '../lib/tcgdexControlledCardReference';
import type { fetchHomeSavedCollection } from '../lib/homeSavedCollection';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const emptySaved = (): Awaited<ReturnType<typeof fetchHomeSavedCollection>> => ({ binders: [], ownedRows: [], cardsByBinder: new Map() });
const summary = (value: number) => ({ total: value, totalUnits: 1, pricedUnits: 1,
  exactPricedUnits: 1, generalEstimateUnits: 0, unpricedUnits: 0, staleUnits: 0,
  latestCalculatedAt: '2026-10-12T12:00:00Z', state: 'fresh' });
const snapshot = (userId: string, value: number, overrides: Record<string, unknown> = {}) => homeCache.serializeHomeCollectionCache(userId, {
  pricingContractVersion: 4, collectionTotal: value, collectionPricingSummary: summary(value),
  ownedCardCount: 1, collectionValueReads: [], chartData: [], ...overrides,
});

// Run the real Home hooks, loaders and effects; replace only the visual JSX tree
// with observable state. Native views and external services are mocked, not the
// startup coordinator, cache restore or collection loading functions under test.
const homeSource = readFileSync('features/home/HubScreen.tsx', 'utf8');
const renderStart = homeSource.indexOf('  return (', homeSource.indexOf('// MAIN RENDER'));
assert.ok(renderStart > 0);
const source = homeSource.slice(0, renderStart) + `
  return React.createElement('HomeState', { collectionTotal, collectionPricingSummary,
    ownedCardCount, activeBinder, chartData, collectionPricingWarning, collectionValueError,
    collectionValueLoading, homeDataError, chaseLoading, chaseError, activityLoading, activityError,
    recentActivity, chaseCards, reloadChase: loadChaseCards, reloadActivity: loadRecentActivity,
    restore: applyCachedHomeCollection, refresh: loadCollectionValue });
}
`;
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const deadlineSource = ts.transpileModule(readFileSync('lib/personalDataRead.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authSource = readFileSync('components/auth-context.tsx', 'utf8');
const authDenialModule = { exports: {} as Record<string, any> };
vm.runInNewContext(ts.transpileModule(authSource.slice(
  authSource.indexOf('function isStaleAuthError('), authSource.indexOf('export function getCachedReadSession('),
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
{ module: authDenialModule, exports: authDenialModule.exports });

async function harness(options: {
  owner?: string;
  cache?: (userId: string) => Promise<string | null>;
  saved?: (userId: string) => Promise<ReturnType<typeof emptySaved>>;
  initialSession?: Promise<any>;
  sessionRead?: (owner: string) => Promise<any>;
  authRead?: (call: number, owner: string) => Promise<any>;
  strictMode?: boolean;
  valuation?: () => Promise<any>;
  localSetting?: (key: string) => Promise<string | null>;
  customNameArt?: () => Promise<string | null>;
  chaseRows?: (owner: string) => Promise<any[]>;
  chaseRead?: (table: string, owner: string) => Promise<any>;
  activityRows?: (owner: string) => Promise<any[]>;
  cards?: (ids: string[], call: number, owner: string) => Promise<Map<string, any>>;
  prices?: (ids: string[], call: number, owner: string) => Promise<Map<string, any>>;
  references?: (cards: any[], budget: number) => Promise<any[]>;
} = {}) {
  let owner = options.owner ?? 'owner-a', focused = true, authCalls = 0, now = 0, nextTimer = 0;
  let cardCalls = 0, priceCalls = 0, stateWrites = 0;
  let listener: ((event: string, session: any) => void) | null = null;
  const timers = new Map<number, { due: number; action: () => void }>();
  const interactions: { action: () => void; cancelled: boolean }[] = [];
  const reads: string[] = [], savedReads: string[] = [], tableReads: string[] = [], mintyReads: string[] = [];
  const preloads: { owner: string; snapshot: unknown; isCurrent: () => boolean }[] = [];
  const warmedViews: { owner: string; binders: unknown[]; isCurrent: () => boolean; completeSavedCardsByBinder?: Map<string, unknown[]> }[] = [];
  const warnings: unknown[][] = [];
  const fakeSetTimeout = (action: () => void, delay = 0) => {
    const id = ++nextTimer; timers.set(id, { due: now + delay, action }); return id;
  };
  const deadlineModule = { exports: {} as Record<string, any> };
  vm.runInNewContext(deadlineSource, { module: deadlineModule, exports: deadlineModule.exports,
    setTimeout: fakeSetTimeout, clearTimeout: (id: number) => timers.delete(id), AbortController });
  const authResult = (id: string) => ({ data: { user: id ? { id } : null }, error: null });
  const supabase = {
    auth: {
      getSession: async () => options.initialSession ?? (options.sessionRead ? options.sessionRead(owner) : { data: { session: owner ? { user: { id: owner }, expires_at: Date.now() / 1000 + 3600 } : null }, error: null }),
      getUser: async () => { authCalls++; if (options.authRead) return options.authRead(authCalls, owner); return authResult(owner); },
      onAuthStateChange: (next: typeof listener) => { listener = next; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
    },
    from(table: string) {
      tableReads.push(table);
      const filters = new Map<string, unknown>();
      let columns = '';
      const query: any = new Proxy({}, { get(_target, name) {
        if (name === 'then') return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const isChaseRead = (table === 'user_card_flags' && filters.get('flag_type') === 'wishlist')
            || (table === 'binder_card_showcases' && filters.get('showcase_type') === 'chase')
            || (table === 'market_watchlist' && columns === 'id, card_id, set_id, created_at');
          if (isChaseRead && options.chaseRead) return options.chaseRead(table, String(filters.get('user_id'))).then(resolve, reject);
          const rows = table === 'user_card_flags' && filters.get('flag_type') === 'wishlist'
            ? options.chaseRows?.(String(filters.get('user_id'))) ?? Promise.resolve([]) : Promise.resolve([]);
          return rows.then(data => resolve({ data, error: null }), reject);
        };
        if (name === 'select') return (value: string) => { columns = value; return query; };
        if (name === 'eq') return (key: string, value: unknown) => { filters.set(key, value); return query; };
        return () => query;
      } });
      return query;
    },
  };
  const feedback = { hiddenInsightIds: [], showLessTopics: {}, showMoreTopics: {} };
  const deps: Record<string, any> = {
    react: { ...React, useState<T,>(initial: T) {
      const [value, setValue] = React.useState(initial);
      return [value, (next: React.SetStateAction<T>) => { stateWrites++; setValue(next); }];
    } },
    'react-native': { useWindowDimensions: () => ({ width: 390 }), InteractionManager: {
      runAfterInteractions(action: () => void) { const task = { action, cancelled: false }; interactions.push(task); return { cancel() { task.cancelled = true; } }; },
    } },
    'expo-router': { router: {}, useFocusEffect(callback: () => void | (() => void)) {
      const active = focused;
      React.useEffect(() => active ? callback() : undefined, [callback, active]);
    } },
    '@react-native-async-storage/async-storage': { getItem: async (key: string) => {
      if (!key.startsWith('stackr:home-collection-cache:v2:')) return options.localSetting?.(key) ?? null;
      const id = decodeURIComponent(key.split(':').at(-1)!); reads.push(id);
      return options.cache ? options.cache(id) : snapshot(id, id === 'owner-a' ? 111 : 222);
    }, removeItem: async () => {}, setItem: async () => {} },
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: {} }, isDark: false }) },
    '../../components/app-mode-context': { useAppMode: () => ({ hydrated: false, hasChosenMode: true, premiumSellerAccess: { allowed: false } }) },
    '../../components/auth-context': { useAuth: () => ({ user: owner ? { id: owner } : null }),
      isKnownAuthDenial: authDenialModule.exports.isKnownAuthDenial },
    '../../components/profile-context': { useProfile: () => ({ profile: null }) },
    '../../components/HomeCommandCenter': { HOME_TOKENS: { layout: {} } },
    '../../lib/supabase': { supabase },
    '../../lib/personalDataRead': deadlineModule.exports,
    '../../lib/homeCollectionCache': homeCache,
    '../../lib/binderLibraryCache': { writePersistedBinderOverview: async (id: string, value: unknown, guard: { isCurrent: () => boolean }) => {
      if (guard.isCurrent()) preloads.push({ owner: id, snapshot: value, isCurrent: guard.isCurrent });
    } },
    '../../lib/collectionSummaryInvalidation': { getCollectionSummaryVersion: () => 0 },
    '../../lib/binderReopenRuntime': { preloadBinderReopenViews: async (rows: unknown[], id: string, isCurrent: () => boolean, options?: { completeSavedCardsByBinder?: Map<string, unknown[]> }) => {
      if (isCurrent()) warmedViews.push({ owner: id, binders: rows, isCurrent, ...options });
    } },
    '../../lib/preparedCollectionValuation': prepared,
    '../../lib/collectionPricingState': pricingState,
    '../../lib/stableCollectionPrices': stablePrices,
    '../../lib/homeSavedCollection': { savedBinderCatalogueTotal: (_binder: unknown, cards: unknown[]) => cards.length,
      fetchHomeSavedCollection: async (id: string, callbacks?: { onBindersReady?: (rows: unknown[]) => void }) => {
      savedReads.push(id);
      const result = options.saved ? await options.saved(id) : emptySaved();
      callbacks?.onBindersReady?.(result.binders);
      return result;
    } },
    '../../lib/homeActivity': { readRecentHomeActivityRows: async (_client: unknown, id: string) => options.activityRows?.(id) ?? [] },
    '../../lib/customBinderNameArt': { getCustomBinderNameArtKeyForBinder: options.customNameArt ?? (async () => null) },
    '../../lib/binders': { fetchBinders: async () => [], fetchBinderCards: async () => [] },
    '../../lib/stackrDomainAdapter': {
      fetchStackrCardRows: async (ids: string[]) => options.cards?.(ids, ++cardCalls, owner) ?? new Map(),
      fetchStackrPriceSnapshots: async (ids: string[]) => options.prices?.(ids, ++priceCalls, owner) ?? new Map(),
    },
    '../../lib/scanCardReferenceHydration': cardReferences,
    '../../lib/pokemonTcg': { getPokemonCardImageUrls: () => ({}),
      attachLiveTcgdexCardReferences: options.references ?? (async (cards: any[]) => cards) },
    '../../lib/cardArtworkPresentation': { getCardArtworkPresentation: () => null },
    '../../lib/homeCardDisplayMetadata': { getHomeCardDisplayMetadata },
    '../../lib/gate0CommerceCopy': { sanitizeGate0CommerceCopy: (copy: string | null, fallback: string | null) => copy ?? fallback },
    '../../lib/mintyPreferences': { useMintyPreferences: () => ({ settings: {}, save: async () => {} }) },
    '../../lib/mintyInsights': { DEFAULT_MINTY_FEEDBACK_PROFILE: feedback, DEFAULT_MINTY_PERSONALISATION_SETTINGS: {},
      buildMintyHomeInsight: () => ({}), sanitizeMintyInsightForGate0: (value: unknown) => value,
      isGate0CommerceActivity: () => false },
    '../../lib/mintyInsightService': { loadMintyInsight: async () => { mintyReads.push(owner); return {}; } },
    '../../lib/stackrSizing': { getStackrHomeWordmarkWidth: () => 100 },
    '../../lib/stackrApiV1': { stackrApiClient: { collectionValuation: options.valuation ?? (async () => ({ data: { state: 'ready', summary: {
      total: owner === 'owner-a' ? 333 : 444, currency: 'GBP', totalUnits: 1, pricedUnits: 1, freshUnits: 1,
      olderPriceUnits: 0, unpricedUnits: 0, distinctPriceIdentities: 1, pending: 0, retrying: 0, unsupported: 0, unresolved: 0, noProviderQuote: 0, binders: [], calculatedAt: '2026-10-12T12:00:00Z',
      oldestSourceAt: '2026-10-12T12:00:00Z', latestSourceAt: '2026-10-12T12:00:00Z',
    } } })) } },
  };
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports,
    require(name: string) {
      if (name in deps) return deps[name];
      // Unused UI and event-only imports are intentionally inert; an unexpected
      // executed dependency fails rather than providing an artificial success.
      return {};
    },
    setTimeout: fakeSetTimeout, clearTimeout: (id: number) => timers.delete(id),
    setInterval: () => 999, clearInterval: () => {},
    console: { log: (...args: unknown[]) => warnings.push(args) },
  });
  const Screen = module.exports.default;
  let root!: ReactTestRenderer;
  const screen = () => options.strictMode ? React.createElement(React.StrictMode, {}, React.createElement(Screen)) : React.createElement(Screen);
  const settle = async () => { await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); }); };
  const tick = async (elapsed = 0) => {
    now += elapsed;
    await act(async () => {
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.action(); }
      for (let i = 0; i < 25; i++) await Promise.resolve();
    });
  };
  await act(async () => { root = create(screen()); });
  await settle(); await tick();
  return {
    reads, savedReads, tableReads, mintyReads, preloads, warmedViews, warnings, settle, tick,
    stateWrites: () => stateWrites,
    state: () => root.root.findByType('HomeState' as any).props,
    async auth(id: string, event = 'SIGNED_IN') { owner = id; await act(async () => { listener?.(event, id ? { user: { id }, expires_at: Date.now() / 1000 + 3600 } : null); }); await tick(); },
    async focus(value: boolean) { focused = value; await act(async () => { root.update(screen()); }); },
    async interactions() { await act(async () => { for (const task of interactions.splice(0)) if (!task.cancelled) task.action(); }); },
    async close() { await act(async () => root.unmount()); },
  };
}

// Synthetic private rows exercise the real Home loaders. They identify no
// printing from the owner's video and establish no live catalogue coverage.
const fixtureReference = 'home-fixture-variant';
const fixtureSet = 'home-fixture-set';
const fixtureName = 'テストカード';
const unvalidatedImage = 'https://assets.tcgdex.net/ja/cards/home-fixture/007/high.webp';
const fixtureCard = () => ({
  id: 'home-fixture-printing', name: fixtureName, number: '007', set_id: fixtureSet, language: 'ja',
  image_small: unvalidatedImage, image_large: unvalidatedImage,
  raw_data: { english_display_name: 'Home fixture', images: { small: unvalidatedImage, large: unvalidatedImage },
    stackr: { cardId: 'home-fixture-printing' }, set: { id: fixtureSet, name: '合成テストセット' } },
});
const fixtureCards = () => new Map([[fixtureReference, fixtureCard()]]);
const fixtureChase = () => [{ card_id: fixtureReference, set_id: fixtureSet }];
const fixtureActivity = () => [{ id: 'home-fixture-event', title: 'Added Unknown item', card_id: fixtureReference,
  set_id: fixtureSet, created_at: '2026-10-18T12:00:00Z', type: 'binder_add' }];
const fixturePrice = (value: number) => new Map([[fixtureReference, {
  card_id: 'home-fixture-printing', variant_id: fixtureReference, market_central: value, currency: 'GBP',
  evidence_status: 'market_estimate', snapshot_at: '2026-10-18T12:00:00Z',
}]]);
const validatedFixtureImages = (cards: any[]) => {
  const reference = resolveTcgdexControlledCardReference({ language: 'ja', providerCardId: 'home-fixture-007',
    providerSetId: 'home-fixture', localId: '007', providerImageBase: 'https://assets.tcgdex.net/ja/cards/home-fixture/007',
    provenance: 'tcgdex_live_or_ttl_cached_provider_card_record' });
  assert.ok(reference);
  return cards.map(card => ({ ...card, images: { small: reference.uri, large: reference.uri } }));
};

async function homeDisplayRecovery() {
  const savedRows = deferred<any[]>(), facts = deferred<Map<string, any>>();
  const provider = deferred<void>(), prices = deferred<Map<string, any>>();
  const progressive = await harness({ cache: async () => null,
    chaseRows: () => savedRows.promise, activityRows: async () => fixtureActivity(),
    cards: () => facts.promise, prices: () => prices.promise,
    references: async cards => { await provider.promise; return validatedFixtureImages(cards); },
  });
  await progressive.interactions(); await progressive.tick(180);
  assert.equal(progressive.state().recentActivity.length, 1, 'raw activity publishes before catalogue facts');
  assert.equal(progressive.state().recentActivity[0].cardName, null);
  savedRows.resolve(fixtureChase()); await progressive.settle();
  assert.equal(progressive.state().chaseCards.length, 0, 'a pending facts read must not invent card metadata');
  facts.resolve(fixtureCards()); await progressive.settle();
  assert.equal(progressive.state().chaseCards[0]?.name, fixtureName,
    'usable chase facts must publish while controlled provider references and snapshots are independently held');
  assert.equal(progressive.state().chaseLoading, false, 'optional reads cannot keep usable chase facts loading');
  assert.equal(progressive.state().recentActivity[0].cardName, fixtureName,
    'activity names must publish before optional provider references');
  for (const card of [progressive.state().chaseCards[0], progressive.state().recentActivity[0]]) {
    assert.equal(card.englishName, 'Home fixture');
    assert.equal(card.cardId, fixtureReference);
    assert.equal(card.setId, fixtureSet);
    assert.ok(!card.imageUrl, 'unvalidated TCGdex artwork must remain suppressed during facts-first publication');
  }
  assert.equal(progressive.state().chaseCards[0].estimatedValue, null);
  prices.resolve(fixturePrice(42)); await progressive.settle();
  assert.equal(progressive.state().chaseCards[0].estimatedValue, 42, 'stored snapshots publish while provider art remains held');
  provider.resolve(); await progressive.settle();
  assert.match(progressive.state().chaseCards[0].imageUrl, /\/low\.webp$/);
  assert.match(progressive.state().recentActivity[0].imageUrl, /\/low\.webp$/);
  assert.equal(progressive.state().chaseCards[0].estimatedValue, 42, 'later artwork retains the exact-reference snapshot');
  assert.equal(progressive.state().chaseError, null);
  assert.deepEqual(progressive.warnings, []);
  await progressive.close();

  for (const failure of ['price', 'artwork'] as const) {
    const pendingFacts = deferred<Map<string, any>>(), pendingPrice = deferred<Map<string, any>>();
    const pendingArtwork = deferred<void>();
    const failed = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
      cards: () => pendingFacts.promise, prices: () => pendingPrice.promise,
      references: async cards => { await pendingArtwork.promise; return validatedFixtureImages(cards); },
    });
    await failed.interactions(); await failed.tick(180);
    if (failure === 'price') {
      pendingPrice.reject(new Error('Synthetic snapshot failure')); await failed.settle();
      assert.match(failed.state().chaseError, /Could not refresh/);
    }
    pendingFacts.resolve(fixtureCards()); await failed.settle();
    assert.equal(failed.state().chaseCards[0].name, fixtureName);
    if (failure === 'artwork') {
      pendingPrice.resolve(fixturePrice(42)); await failed.settle();
      pendingArtwork.reject(new Error('Synthetic artwork failure'));
    } else {
      pendingArtwork.resolve();
    }
    await failed.settle();
    assert.equal(failed.state().chaseCards[0].name, fixtureName);
    assert.equal(failed.state().recentActivity[0].cardName, fixtureName, 'optional failure retains activity facts instead of raw-event placeholders');
    assert.equal(failed.state().chaseLoading, false);
    assert.equal(failed.state().chaseCards[0].estimatedValue, failure === 'price' ? null : 42);
    assert.match(failed.state().chaseError, /Could not refresh/, 'publishing facts cannot clear an optional-read failure');
    await failed.close();
  }

  const timedArtwork = deferred<void>(), timedPrice = deferred<Map<string, any>>();
  const timed = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
    cards: async () => fixtureCards(), prices: () => timedPrice.promise,
    references: async cards => { await timedArtwork.promise; return validatedFixtureImages(cards); },
  });
  await timed.interactions(); await timed.tick(180);
  assert.equal(timed.state().chaseCards[0].name, fixtureName);
  await timed.tick(10_000);
  assert.match(timed.state().chaseError, /Could not refresh/);
  assert.equal(timed.state().recentActivity[0].cardName, fixtureName);
  const timedWrites = timed.stateWrites();
  timedArtwork.resolve(); timedPrice.resolve(fixturePrice(99)); await timed.settle();
  assert.equal(timed.stateWrites(), timedWrites, 'late timed-out optional reads cannot publish');
  assert.equal(timed.state().chaseCards[0].estimatedValue, null);
  assert.ok(!timed.state().chaseCards[0].imageUrl);
  await timed.close();

  const lateFacts = deferred<Map<string, any>>();
  let lateProviderCalls = 0;
  const factsTimeout = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
    cards: () => lateFacts.promise, references: async cards => { lateProviderCalls++; return cards; },
  });
  await factsTimeout.interactions(); await factsTimeout.tick(180); await factsTimeout.tick(10_000);
  assert.equal(factsTimeout.state().chaseLoading, false);
  assert.match(factsTimeout.state().chaseError, /Could not refresh/);
  assert.equal(factsTimeout.state().chaseCards.length, 0);
  assert.equal(factsTimeout.state().recentActivity.length, 1, 'failed facts do not hide already usable raw activity');
  const factsWrites = factsTimeout.stateWrites();
  lateFacts.resolve(fixtureCards()); await factsTimeout.settle();
  assert.equal(factsTimeout.stateWrites(), factsWrites, 'late facts cannot publish after their read deadline');
  assert.equal(lateProviderCalls, 0, 'timed-out facts cannot start unnecessary provider work');
  await factsTimeout.close();

  let refreshRound = 0;
  const retryPrice = deferred<Map<string, any>>();
  const retained = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(),
    prices: async () => refreshRound ? retryPrice.promise : fixturePrice(42),
  });
  await retained.interactions(); await retained.tick(180);
  assert.equal(retained.state().chaseCards[0].estimatedValue, 42);
  refreshRound = 1;
  await act(async () => { void retained.state().reloadChase(); }); await retained.settle();
  assert.equal(retained.state().chaseCards[0].estimatedValue, 42, 'same-reference facts retain the prior estimate while its snapshot refresh is held');
  retryPrice.reject(new Error('Synthetic retry failure')); await retained.settle();
  assert.equal(retained.state().chaseCards[0].estimatedValue, 42);
  assert.match(retained.state().chaseError, /Could not refresh/);
  await retained.close();

  let printingRound = 0;
  const changedPrice = deferred<Map<string, any>>();
  const changed = await harness({ chaseRows: async () => fixtureChase(),
    cards: async () => printingRound ? new Map([[fixtureReference, { ...fixtureCard(), set_id: 'different-synthetic-set' }]]) : fixtureCards(),
    prices: async () => printingRound ? changedPrice.promise : fixturePrice(42),
  });
  await changed.interactions(); await changed.tick(180);
  printingRound = 1;
  await act(async () => { void changed.state().reloadChase(); }); await changed.settle();
  assert.equal(changed.state().chaseCards[0].setId, 'different-synthetic-set');
  assert.equal(changed.state().chaseCards[0].estimatedValue, null, 'a changed printing cannot inherit the prior estimate');
  changedPrice.resolve(new Map()); await changed.settle(); await changed.close();

  for (const heldAt of ['facts', 'optional'] as const) {
    let round = 0;
    const staleFacts = deferred<Map<string, any>>(), stalePrice = deferred<Map<string, any>>(), staleArtwork = deferred<void>();
    const currentName = 'Current synthetic card';
    const superseded = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
      cards: async () => round ? new Map([[fixtureReference, { ...fixtureCard(), name: currentName }]]) : staleFacts.promise,
      prices: async () => round ? fixturePrice(88) : stalePrice.promise,
      references: async cards => { if (cards[0]?.name === fixtureName) await staleArtwork.promise; return cards; },
    });
    await superseded.interactions(); await superseded.tick(180);
    if (heldAt === 'optional') { staleFacts.resolve(fixtureCards()); await superseded.settle(); }
    round = 1;
    await act(async () => { void superseded.state().reloadChase(); void superseded.state().reloadActivity(); });
    await superseded.settle();
    assert.equal(superseded.state().chaseCards[0].name, currentName);
    assert.equal(superseded.state().chaseCards[0].estimatedValue, 88);
    const writes = superseded.stateWrites();
    staleFacts.resolve(fixtureCards()); stalePrice.resolve(fixturePrice(1)); staleArtwork.resolve(); await superseded.settle();
    assert.equal(superseded.stateWrites(), writes, `superseded ${heldAt} cannot publish state`);
    assert.equal(superseded.state().recentActivity[0].cardName, currentName);
    await superseded.close();
  }

  let accountRound = 0;
  const oldAccountArtwork = deferred<void>(), oldAccountPrices = deferred<Map<string, any>>();
  const account = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
    cards: async () => new Map([[fixtureReference, { ...fixtureCard(), name: accountRound ? `Synthetic account round ${accountRound}` : fixtureName }]]),
    prices: async () => accountRound ? fixturePrice(80 + accountRound) : oldAccountPrices.promise,
    references: async cards => { if (cards[0]?.name === fixtureName) await oldAccountArtwork.promise; return cards; },
  });
  await account.interactions(); await account.tick(180);
  accountRound = 1; await account.auth('owner-b');
  assert.equal(account.state().chaseCards.length, 0, 'account changes clear the prior private chase rows');
  await account.interactions(); await account.tick(180);
  accountRound = 2; await account.auth('owner-a'); await account.interactions(); await account.tick(180);
  assert.equal(account.state().chaseCards[0].name, 'Synthetic account round 2');
  assert.equal(account.state().chaseCards[0].estimatedValue, 82);
  const accountWrites = account.stateWrites();
  oldAccountArtwork.resolve(); oldAccountPrices.resolve(fixturePrice(1)); await account.settle();
  assert.equal(account.stateWrites(), accountWrites, 'old A requests remain invalid after A → B → A');
  assert.equal(account.state().recentActivity[0].cardName, 'Synthetic account round 2');
  await account.close();

  for (const heldAt of ['facts', 'optional'] as const) {
    const unmountedFacts = deferred<Map<string, any>>(), unmountedArtwork = deferred<void>(), unmountedPrice = deferred<Map<string, any>>();
    const unmounted = await harness({ chaseRows: async () => fixtureChase(), activityRows: async () => fixtureActivity(),
      cards: () => unmountedFacts.promise, prices: () => unmountedPrice.promise,
      references: async cards => { await unmountedArtwork.promise; return validatedFixtureImages(cards); },
    });
    await unmounted.interactions(); await unmounted.tick(180);
    if (heldAt === 'optional') { unmountedFacts.resolve(fixtureCards()); await unmounted.settle(); }
    await unmounted.close();
    const unmountedWrites = unmounted.stateWrites();
    unmountedFacts.resolve(fixtureCards()); unmountedArtwork.resolve(); unmountedPrice.resolve(fixturePrice(99)); await unmounted.settle();
    assert.equal(unmounted.stateWrites(), unmountedWrites, `unmounted Home cannot receive late ${heldAt} setters`);
  }

  let accessDenied = false;
  const denied = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(), prices: async () => fixturePrice(42),
    authRead: async (_call, id) => accessDenied
      ? { data: { user: null }, error: { status: 401, message: 'Synthetic denial' } }
      : { data: { user: { id } }, error: null },
  });
  await denied.interactions(); await denied.tick(180);
  assert.equal(denied.state().chaseCards.length, 1);
  accessDenied = true;
  await act(async () => { await denied.state().reloadChase(); });
  assert.equal(denied.state().chaseCards.length, 0, 'known access denial revokes private chase rows');
  assert.match(denied.state().chaseError, /access could not be confirmed/i);
  accessDenied = false;
  await act(async () => { await denied.state().reloadChase(); });
  assert.equal(denied.state().chaseCards[0].estimatedValue, 42, 'an explicit authorised retry recovers the current facts and snapshot');
  assert.equal(denied.state().chaseError, null);
  await denied.close();
  console.log('Home progressive display passed: facts-first, controlled images, independent snapshots, optional failures/deadlines, retained estimate scope, supersession, A → B → A and unmount.');
}

async function homeChaseDenialRecovery() {
  const denial = (status: number) => Object.assign(new Error('Synthetic access denial'), { status });
  for (const status of [401, 403]) {
    for (const mode of ['response', 'rejection'] as const) {
      for (const table of ['user_card_flags', 'market_watchlist', 'binder_card_showcases']) {
        let revoked = false;
        const denied = await harness({ cards: async () => fixtureCards(), prices: async () => fixturePrice(42),
          chaseRead: async requestedTable => {
            if (revoked && requestedTable === table) {
              if (mode === 'rejection') throw denial(status);
              // PostgREST puts HTTP status on the response, outside its error.
              return { data: null, status, error: { code: '42501', message: `permission denied for table ${table}`, details: '', hint: '' } };
            }
            return { data: requestedTable === 'user_card_flags' ? fixtureChase() : [], status: 200, error: null };
          },
        });
        await denied.interactions(); await denied.tick(180);
        assert.equal(denied.state().chaseCards[0].estimatedValue, 42);
        revoked = true;
        await act(async () => { await denied.state().reloadChase(); });
        assert.equal(denied.state().chaseCards.length, 0, `${table} ${status} ${mode} must revoke retained private chase cards`);
        assert.equal(denied.state().chaseLoading, false);
        assert.match(denied.state().chaseError, /access could not be confirmed/i);
        revoked = false;
        await act(async () => { await denied.state().reloadChase(); });
        assert.equal(denied.state().chaseCards[0].estimatedValue, 42, 'an authorised new request recovers after saved-row denial');
        assert.equal(denied.state().chaseError, null);
        await denied.close();
      }
    }

    for (const mode of ['response', 'rejection'] as const) {
      let rejectAuth = false;
      const authDenied = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(), prices: async () => fixturePrice(42),
        authRead: async (_call, id) => {
          if (!rejectAuth) return { data: { user: { id } }, error: null };
          if (mode === 'rejection') throw denial(status);
          return { data: { user: null }, error: denial(status) };
        },
      });
      await authDenied.interactions(); await authDenied.tick(180);
      rejectAuth = true;
      await act(async () => { await authDenied.state().reloadChase(); });
      assert.equal(authDenied.state().chaseCards.length, 0, `auth ${status} ${mode} revokes retained chase facts`);
      assert.match(authDenied.state().chaseError, /access could not be confirmed/i);
      await authDenied.close();
    }

    for (const deniedRead of ['price', 'artwork'] as const) {
      let refresh = false;
      const pendingPrice = deferred<Map<string, any>>(), pendingArtwork = deferred<void>();
      const optional = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(),
        prices: async () => refresh ? pendingPrice.promise : fixturePrice(42),
        references: async cards => { if (refresh) await pendingArtwork.promise; return cards; },
      });
      await optional.interactions(); await optional.tick(180);
      refresh = true;
      await act(async () => { void optional.state().reloadChase(); }); await optional.settle();
      assert.equal(optional.state().chaseCards[0].estimatedValue, 42, 'current facts paint before optional denial');
      if (deniedRead === 'price') pendingPrice.reject(denial(status)); else pendingArtwork.reject(denial(status));
      await optional.settle();
      assert.equal(optional.state().chaseCards.length, 0, `post-facts ${deniedRead} ${status} revokes private chase data`);
      assert.match(optional.state().chaseError, /access could not be confirmed/i);
      const writes = optional.stateWrites();
      if (deniedRead === 'price') pendingArtwork.resolve(); else pendingPrice.resolve(fixturePrice(99));
      await optional.settle();
      assert.equal(optional.stateWrites(), writes, 'late optional completion cannot repopulate a denied request');
      refresh = false;
      await act(async () => { await optional.state().reloadChase(); });
      assert.equal(optional.state().chaseCards[0].estimatedValue, 42);
      assert.equal(optional.state().chaseError, null);
      await optional.close();
    }
  }

  const lateFacts = deferred<Map<string, any>>(), deniedPrice = deferred<Map<string, any>>();
  const beforeFacts = await harness({ chaseRows: async () => fixtureChase(), cards: () => lateFacts.promise, prices: () => deniedPrice.promise });
  await beforeFacts.interactions(); await beforeFacts.tick(180);
  deniedPrice.reject(denial(403)); await beforeFacts.settle();
  const beforeFactsWrites = beforeFacts.stateWrites();
  lateFacts.resolve(fixtureCards()); await beforeFacts.settle();
  assert.equal(beforeFacts.stateWrites(), beforeFactsWrites, 'late facts cannot repopulate a request denied before its facts arrived');
  assert.equal(beforeFacts.state().chaseCards.length, 0);
  await beforeFacts.close();

  const ordinaryFailure = deferred<Map<string, any>>(), laterDenial = deferred<void>();
  const race = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(), prices: () => ordinaryFailure.promise,
    references: async cards => { await laterDenial.promise; return cards; },
  });
  await race.interactions(); await race.tick(180);
  ordinaryFailure.reject(new Error('Synthetic temporary snapshot failure')); await race.settle();
  assert.equal(race.state().chaseCards[0].name, fixtureName, 'ordinary errors retain facts');
  laterDenial.reject(denial(403)); await race.settle();
  assert.equal(race.state().chaseCards.length, 0, 'a later denial still revokes when another optional read already failed');
  await race.close();

  let savedRound = 0;
  const lateSavedDenial = deferred<any>();
  const savedRace = await harness({ cards: async () => fixtureCards(), prices: async () => fixturePrice(42),
    chaseRead: async table => {
      if (savedRound) {
        if (table === 'user_card_flags') throw new Error('Synthetic temporary saved-row failure');
        if (table === 'market_watchlist') return lateSavedDenial.promise;
      }
      return { data: table === 'user_card_flags' ? fixtureChase() : [], status: 200, error: null };
    },
  });
  await savedRace.interactions(); await savedRace.tick(180);
  savedRound = 1;
  await act(async () => { await savedRace.state().reloadChase(); });
  assert.equal(savedRace.state().chaseCards[0].estimatedValue, 42, 'ordinary saved-query rejection retains the previous estimate');
  lateSavedDenial.resolve({ data: null, status: 403, error: { code: '42501', message: 'permission denied for table market_watchlist' } });
  await savedRace.settle();
  assert.equal(savedRace.state().chaseCards.length, 0, 'late saved-query denial revokes after an earlier ordinary query failure');
  assert.match(savedRace.state().chaseError, /access could not be confirmed/i);
  await savedRace.close();

  let jwtDenied = false;
  const jwt = await harness({ chaseRows: async () => fixtureChase(), cards: async () => fixtureCards(), prices: async () => fixturePrice(42),
    authRead: async (_call, id) => ({ data: { user: jwtDenied ? null : { id } },
      error: jwtDenied ? { code: 'bad_jwt', message: 'Synthetic JWT denial' } : null }),
  });
  await jwt.interactions(); await jwt.tick(180); jwtDenied = true;
  await act(async () => { await jwt.state().reloadChase(); });
  assert.equal(jwt.state().chaseCards.length, 0, 'the production JWT denial classifier remains authoritative without HTTP status');
  await jwt.close();
  console.log('Home Chase denial recovery passed: real-shaped 401/403 table responses, rejections, thrown auth, post-facts denial, late callbacks and authorised retry.');
}

async function main() {
  await homeChaseDenialRecovery();
  await homeDisplayRecovery();
  const savedCustom = async (): Promise<ReturnType<typeof emptySaved>> => ({ ...emptySaved(), binders: [{
    id: '00000000-0000-4000-8000-000000000001', user_id: 'owner-a', name: 'Saved custom binder',
    color: '#000', type: 'custom', is_public: false, source_set_id: null, created_at: '2026-10-12T12:00:00Z',
  }], cardsByBinder: new Map([['00000000-0000-4000-8000-000000000001', []]]) });
  for (const waitFor of ['master-setting', 'custom-art'] as const) {
    const localRead = deferred<string | null>();
    const localOptions = waitFor === 'master-setting'
      ? { localSetting: () => localRead.promise }
      : { customNameArt: () => localRead.promise };
    const waiting = await harness({ cache: async () => null, saved: savedCustom, ...localOptions });
    assert.equal(waiting.state().collectionValueLoading, true);
    await waiting.tick(10_000);
    assert.equal(waiting.state().collectionValueLoading, false, `${waitFor} cannot keep Home loading after its deadline`);
    assert.match(waiting.state().homeDataError, /try again/i);
    assert.equal(waiting.state().collectionTotal, null, 'a timed-out setting cannot invent a completed valuation');
    localRead.resolve('true'); await waiting.settle();
    assert.equal(waiting.state().collectionTotal, null, 'late local settings cannot publish after timeout');
    await act(async () => { await waiting.state().refresh(); });
    assert.equal(waiting.state().collectionTotal, 333, 'a new explicit retry can use the resolved local setting');
    await waiting.close();

    const cachedRead = deferred<string | null>();
    const cached = await harness({ saved: savedCustom, ...(waitFor === 'master-setting'
      ? { localSetting: () => cachedRead.promise } : { customNameArt: () => cachedRead.promise }) });
    assert.equal(cached.state().collectionTotal, 111);
    await cached.tick(10_000);
    assert.equal(cached.state().collectionTotal, 111, 'a local-setting timeout preserves a valid saved valuation');
    assert.equal(cached.state().collectionValueLoading, false);
    assert.match(cached.state().collectionPricingWarning, /last successful/);
    await cached.auth('', 'SIGNED_OUT');
    cachedRead.resolve('true'); await cached.settle();
    assert.equal(cached.state().collectionTotal, null, 'a late setting cannot restore private data after sign-out');
    await cached.close();
  }

  const mobileVerification = deferred<any>();
  const mobile = await harness({ authRead: async () => mobileVerification.promise });
  assert.equal(mobile.state().collectionTotal, 111,
    'a valid local account cache must paint while mobile online verification never resolves');
  assert.deepEqual(mobile.savedReads, [], 'a local preview does not authorise live collection reads');
  await mobile.close();

  const stalledVerification = deferred<any>();
  const timeout = await harness({ cache: async () => null,
    authRead: async (call, owner) => call === 1 ? stalledVerification.promise : { data: { user: { id: owner } }, error: null } });
  assert.equal(timeout.state().collectionValueLoading, true);
  await timeout.tick(10_000);
  assert.equal(timeout.state().collectionValueLoading, false, 'a first collection with no cache leaves the spinner when verification stalls');
  assert.match(timeout.state().collectionValueError, /try again/i, 'the failed collection offers a truthful retry');
  stalledVerification.resolve({ data: { user: { id: 'owner-a' } }, error: null });
  await timeout.settle();
  assert.deepEqual(timeout.savedReads, [], 'a late timed-out verification cannot start collection reads');
  await act(async () => { await timeout.state().refresh(); });
  assert.equal(timeout.state().collectionTotal, 333, 'retry after an auth timeout recovers using the current account');
  await timeout.close();

  const deniedCheck = deferred<any>();
  const denied = await harness({ authRead: async () => deniedCheck.promise });
  assert.equal(denied.state().collectionTotal, 111);
  deniedCheck.resolve({ data: { user: null }, error: { status: 401, message: 'Access denied' } });
  await denied.settle();
  assert.equal(denied.state().collectionTotal, null, 'known account denial revokes the earlier local preview');
  assert.equal(denied.state().activeBinder, null);
  assert.equal(denied.state().ownedCardCount, 0);
  assert.deepEqual(denied.savedReads, []);
  await denied.close();

  const unavailableCheck = deferred<any>();
  const unavailable = await harness({ authRead: async () => unavailableCheck.promise });
  unavailableCheck.resolve({ data: { user: null }, error: { status: 503, message: 'Network unavailable' } });
  await unavailable.settle();
  assert.equal(unavailable.state().collectionTotal, 111, 'transient mobile network failure keeps the labelled local preview');
  assert.match(unavailable.state().collectionPricingWarning, /last successful/);
  await unavailable.close();

  const expired = await harness({ authRead: async () => mobileVerification.promise,
    sessionRead: async owner => ({ data: { session: { user: { id: owner }, expires_at: Date.now() / 1000 - 1 } }, error: null }) });
  assert.deepEqual(expired.reads, [], 'an expired local session cannot restore private cached data');
  assert.equal(expired.state().collectionTotal, null);
  await expired.auth('owner-a', 'TOKEN_REFRESHED');
  assert.equal(expired.state().collectionTotal, 111, 'same-account renewal restores the previously ineligible local preview');
  assert.deepEqual(expired.savedReads, [], 'renewal cannot authorise or duplicate stalled live reads');
  await expired.close();

  const wrongEnvelope = await harness({ authRead: async () => mobileVerification.promise,
    cache: async () => snapshot('owner-b', 222) });
  assert.equal(wrongEnvelope.state().collectionTotal, null, 'another account envelope is rejected');
  await wrongEnvelope.close();

  const savedA = deferred<ReturnType<typeof emptySaved>>();
  const first = await harness({ saved: () => savedA.promise });
  await first.auth('owner-a', 'INITIAL_SESSION');
  assert.deepEqual(first.savedReads, ['owner-a'], 'focus and restored session start one collection read');
  assert.deepEqual(first.reads, ['owner-a'], 'cache hydration coalesces all initial consumers');
  assert.equal(first.state().collectionTotal, 111, 'verified account cache renders while live collection is pending');
  assert.deepEqual(first.tableReads, [], 'secondary service reads wait for interactions');
  await first.interactions(); await first.tick(180);
  assert.equal(first.tableReads.filter(table => table === 'notifications').length, 1);
  assert.equal(first.mintyReads.length, 1, 'Minty has one deferred initial fetch');
  savedA.resolve(emptySaved()); await first.settle();
  assert.deepEqual(first.warnings, []);
  assert.equal(first.state().collectionTotal, 333, 'fresh valuation replaces cache with its own provenance');
  assert.equal(first.preloads.length, 1, 'Home seeds the shared binder library after an owner-bound read');
  assert.equal(first.state().collectionPricingSummary.latestCalculatedAt, '2026-10-12T12:00:00Z');
  assert.deepEqual(first.warnings, []);
  await first.close();

  const viewWarm = await harness({ saved: async () => ({ ...emptySaved(), binders: [{
    id: '00000000-0000-4000-8000-000000000001', user_id: 'owner-a', name: 'Saved custom binder',
    color: '#000', type: 'custom', is_public: false, source_set_id: null, created_at: '2026-10-12T12:00:00Z',
  }], cardsByBinder: new Map([['00000000-0000-4000-8000-000000000001', []]]) }) });
  assert.equal(viewWarm.warmedViews.length, 0, 'binder-content warming waits until Home content and interactions');
  assert.deepEqual(viewWarm.warnings, [], 'nonempty saved binders execute without hidden loader failures');
  await viewWarm.interactions(); await viewWarm.settle();
  assert.equal(viewWarm.warmedViews.length, 1, 'Home schedules existing complete-binder cache warming after interactions');
  assert.equal(viewWarm.warmedViews[0].owner, 'owner-a');
  assert.equal(viewWarm.warmedViews[0].completeSavedCardsByBinder?.has('00000000-0000-4000-8000-000000000001'), true,
    'custom content warming receives the complete paginated source including a genuinely empty binder');
  await viewWarm.auth('', 'SIGNED_OUT');
  assert.equal(viewWarm.warmedViews[0].isCurrent(), false, 'sign-out revokes an already-started binder warmer');
  await viewWarm.close();

  const slowPrices = deferred<any>();
  const earlyWarm = await harness({ valuation: () => slowPrices.promise, saved: async () => ({ ...emptySaved(), binders: [{
    id: '00000000-0000-4000-8000-000000000001', user_id: 'owner-a', name: 'Started binder',
    color: '#000', type: 'custom', is_public: false, source_set_id: null, created_at: '2026-10-12T12:00:00Z',
  }], cardsByBinder: new Map([['00000000-0000-4000-8000-000000000001', []]]) }) });
  await earlyWarm.interactions(); await earlyWarm.settle();
  assert.equal(earlyWarm.warmedViews.length, 1, 'a stalled price request cannot block preparing saved binders');
  await earlyWarm.tick(10_000);
  assert.equal(earlyWarm.state().collectionValueLoading, false, 'a stalled valuation does not retain a loading screen');
  assert.equal(earlyWarm.state().collectionTotal, 111, 'valuation timeout preserves the last successful value');
  assert.match(earlyWarm.state().collectionPricingWarning, /last successful/);
  slowPrices.resolve({ data: { state: 'pending', summary: null } });
  await earlyWarm.settle();
  assert.match(earlyWarm.state().collectionPricingWarning, /last successful/, 'a late timed-out valuation cannot replace the retry state');
  await earlyWarm.close();

  const signedOut = await harness({ owner: '' });
  assert.equal(signedOut.state().collectionValueLoading, false, 'signed-out Home settles its collection state');
  assert.equal(signedOut.state().chaseLoading, false);
  assert.equal(signedOut.state().activityLoading, false);
  assert.deepEqual(signedOut.savedReads, []);
  assert.deepEqual(signedOut.reads, []);
  await signedOut.close();

  const strict = await harness({ strictMode: true });
  assert.equal(strict.state().collectionTotal, 333, 'StrictMode cleanup/restart still produces a current valuation');
  assert.deepEqual(strict.warnings, []);
  await strict.close();

  const pendingConfirmation = deferred<any>(), pendingCollection = deferred<ReturnType<typeof emptySaved>>();
  const confirmation = await harness({ saved: () => pendingCollection.promise,
    authRead: async (call, owner) => call === 1 ? pendingConfirmation.promise : { data: { user: { id: owner } }, error: null } });
  assert.deepEqual(confirmation.reads, ['owner-a']);
  assert.equal(confirmation.state().collectionTotal, 111, 'local preview is independent of pending online confirmation');
  pendingCollection.resolve(emptySaved()); await confirmation.settle();
  assert.equal(confirmation.state().collectionTotal, 111, 'online reads still wait for server verification');
  pendingConfirmation.resolve({ data: { user: { id: 'owner-a' } }, error: null }); await confirmation.settle();
  assert.equal(confirmation.state().collectionTotal, 333, 'verified fresh results replace the saved display');
  await confirmation.close();

  const blockedCache = deferred<string | null>();
  const liveFirst = await harness({ cache: () => blockedCache.promise });
  assert.deepEqual(liveFirst.savedReads, ['owner-a'], 'stalled local cache does not block a fresh collection read');
  assert.equal(liveFirst.state().collectionTotal, 333);
  blockedCache.resolve(snapshot('owner-a', 111)); await liveFirst.settle();
  assert.equal(liveFirst.state().collectionTotal, 333, 'late cache cannot overwrite live data');
  await liveFirst.close();

  for (const outcome of ['pending', 'failed'] as const) {
    const lateValuationCache = deferred<string | null>();
    const waiting = await harness({ cache: () => lateValuationCache.promise,
      valuation: async () => {
        if (outcome === 'failed') throw new Error('Prepared valuation unavailable');
        return { data: { state: 'pending', summary: null } };
      } });
    assert.equal(waiting.state().ownedCardCount, 0, 'fresh saved ownership commits before valuation is ready');
    assert.equal(waiting.state().collectionTotal, null);
    lateValuationCache.resolve(snapshot('owner-a', 111, {
      ownedCardCount: 12, activeBinder: { id: 'old-binder', name: 'Old cached binder' }, chartData: [100, 111],
    }));
    await waiting.settle();
    assert.equal(waiting.state().collectionTotal, 111, `cached valuation survives ${outcome} fresh valuation after metadata load`);
    assert.equal(waiting.state().ownedCardCount, 0, 'cache cannot overwrite fresh ownership count');
    assert.equal(waiting.state().activeBinder, null, 'cache cannot restore a binder removed from current saved data');
    assert.deepEqual(Array.from(waiting.state().chartData), [100, 111], 'valid cached valuation history remains visible');
    assert.equal(waiting.state().collectionValueError, null, 'available cached value resolves the no-value error state');
    assert.ok(waiting.state().collectionPricingWarning, 'retained cache keeps a truthful refresh/pending notice');
    if (outcome === 'pending') assert.match(waiting.state().collectionPricingWarning, /being prepared/);
    await waiting.close();
  }

  const staleCache = deferred<string | null>(), staleSaved = deferred<ReturnType<typeof emptySaved>>();
  const savedB = deferred<ReturnType<typeof emptySaved>>();
  const switching = await harness({ cache: id => id === 'owner-a' ? staleCache.promise : Promise.resolve(snapshot(id, 222)),
    saved: id => id === 'owner-a' ? staleSaved.promise : savedB.promise });
  await switching.auth('owner-b');
  assert.equal(switching.state().collectionTotal, 222);
  staleCache.resolve(snapshot('owner-a', 111)); staleSaved.resolve(emptySaved()); await switching.settle();
  assert.equal(switching.state().collectionTotal, 222, 'late account A cache and collection never replace B');
  assert.equal(switching.preloads.some(preload => preload.owner === 'owner-a'), false, 'late Account A results cannot preload the saved library after switching');
  await switching.interactions(); await switching.tick(180);
  assert.deepEqual(switching.mintyReads, ['owner-b'], 'cancelled A secondary work cannot run as B');
  savedB.resolve(emptySaved()); await switching.settle();
  assert.equal(switching.state().collectionTotal, 444);
  await switching.auth('', 'SIGNED_OUT');
  assert.equal(switching.state().collectionTotal, null, 'logout clears personal data immediately');
  await switching.close();

  const initial = deferred<any>();
  const staleAuth = await harness({ initialSession: initial.promise });
  await staleAuth.auth('owner-b');
  initial.resolve({ data: { session: { user: { id: 'owner-a' }, expires_at: Date.now() / 1000 + 3600 } }, error: null }); await staleAuth.settle(); await staleAuth.tick();
  assert.deepEqual(staleAuth.savedReads, ['owner-b'], 'late initial auth lookup cannot restore old account');
  await staleAuth.close();

  const blur = await harness();
  await blur.focus(false); await blur.interactions(); await blur.tick(180);
  assert.deepEqual(blur.tableReads, [], 'blur cancels optional startup reads');
  await blur.focus(true); await blur.interactions(); await blur.tick(180);
  assert.equal(blur.tableReads.filter(table => table === 'notifications').length, 1, 'return focus starts one current refresh');
  await blur.close(); await blur.tick(1_000);
  assert.deepEqual(blur.warnings, []);
  console.log('Home runtime startup passed: mobile local-cache preview without online confirmation, expiry/owner rejection, single bootstrap, deferred extras, cache/live precedence, account switching, late session, blur and cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
