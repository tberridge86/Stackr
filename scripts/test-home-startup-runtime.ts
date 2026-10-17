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
import type { fetchHomeSavedCollection } from '../lib/homeSavedCollection';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
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
    collectionValueLoading, chaseLoading, activityLoading, recentActivity, chaseCards,
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

async function harness(options: {
  owner?: string;
  cache?: (userId: string) => Promise<string | null>;
  saved?: (userId: string) => Promise<ReturnType<typeof emptySaved>>;
  initialSession?: Promise<any>;
  sessionRead?: (owner: string) => Promise<any>;
  authRead?: (call: number, owner: string) => Promise<any>;
  strictMode?: boolean;
  valuation?: () => Promise<any>;
} = {}) {
  let owner = options.owner ?? 'owner-a', focused = true, authCalls = 0, now = 0, nextTimer = 0;
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
      const query: any = new Proxy({}, { get(_target, name) {
        if (name === 'then') return (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
        return () => query;
      } });
      return query;
    },
  };
  const feedback = { hiddenInsightIds: [], showLessTopics: {}, showMoreTopics: {} };
  const deps: Record<string, any> = {
    react: React,
    'react-native': { useWindowDimensions: () => ({ width: 390 }), InteractionManager: {
      runAfterInteractions(action: () => void) { const task = { action, cancelled: false }; interactions.push(task); return { cancel() { task.cancelled = true; } }; },
    } },
    'expo-router': { router: {}, useFocusEffect(callback: () => void | (() => void)) {
      const active = focused;
      React.useEffect(() => active ? callback() : undefined, [callback, active]);
    } },
    '@react-native-async-storage/async-storage': { getItem: async (key: string) => {
      if (!key.startsWith('stackr:home-collection-cache:v2:')) return null;
      const id = decodeURIComponent(key.split(':').at(-1)!); reads.push(id);
      return options.cache ? options.cache(id) : snapshot(id, id === 'owner-a' ? 111 : 222);
    }, removeItem: async () => {}, setItem: async () => {} },
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: {} }, isDark: false }) },
    '../../components/app-mode-context': { useAppMode: () => ({ hydrated: false, hasChosenMode: true, premiumSellerAccess: { allowed: false } }) },
    '../../components/auth-context': { useAuth: () => ({ user: owner ? { id: owner } : null }),
      isKnownAuthDenial: (error: { status?: number } | null) => error?.status === 401 || error?.status === 403 },
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
    '../../lib/homeActivity': { readRecentHomeActivityRows: async () => [] },
    '../../lib/customBinderNameArt': { getCustomBinderNameArtKeyForBinder: async () => null },
    '../../lib/binders': { fetchBinders: async () => [], fetchBinderCards: async () => [] },
    '../../lib/stackrDomainAdapter': { fetchStackrCardRows: async () => new Map(), fetchStackrPriceSnapshots: async () => new Map() },
    '../../lib/mintyPreferences': { useMintyPreferences: () => ({ settings: {}, save: async () => {} }) },
    '../../lib/mintyInsights': { DEFAULT_MINTY_FEEDBACK_PROFILE: feedback, DEFAULT_MINTY_PERSONALISATION_SETTINGS: {},
      buildMintyHomeInsight: () => ({}), sanitizeMintyInsightForGate0: (value: unknown) => value },
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
    state: () => root.root.findByType('HomeState' as any).props,
    async auth(id: string, event = 'SIGNED_IN') { owner = id; await act(async () => { listener?.(event, id ? { user: { id }, expires_at: Date.now() / 1000 + 3600 } : null); }); await tick(); },
    async focus(value: boolean) { focused = value; await act(async () => { root.update(screen()); }); },
    async interactions() { await act(async () => { for (const task of interactions.splice(0)) if (!task.cancelled) task.action(); }); },
    async close() { await act(async () => root.unmount()); },
  };
}

async function main() {
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
