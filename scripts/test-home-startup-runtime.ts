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

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const emptySaved = () => ({ binders: [], ownedRows: [], cardsByBinder: new Map() });
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

async function harness(options: {
  owner?: string;
  cache?: (userId: string) => Promise<string | null>;
  saved?: (userId: string) => Promise<ReturnType<typeof emptySaved>>;
  initialAuth?: Promise<any>;
  authRead?: (call: number, owner: string) => Promise<any>;
  strictMode?: boolean;
  valuation?: () => Promise<any>;
} = {}) {
  let owner = options.owner ?? 'owner-a', focused = true, authCalls = 0, now = 0, nextTimer = 0;
  let listener: ((event: string, session: any) => void) | null = null;
  const timers = new Map<number, { due: number; action: () => void }>();
  const interactions: { action: () => void; cancelled: boolean }[] = [];
  const reads: string[] = [], savedReads: string[] = [], tableReads: string[] = [], mintyReads: string[] = [];
  const warnings: unknown[][] = [];
  const fakeSetTimeout = (action: () => void, delay = 0) => {
    const id = ++nextTimer; timers.set(id, { due: now + delay, action }); return id;
  };
  const authResult = (id: string) => ({ data: { user: id ? { id } : null }, error: null });
  const supabase = {
    auth: {
      getUser: async () => { authCalls++; if (options.authRead) return options.authRead(authCalls, owner); return authCalls === 1 && options.initialAuth ? options.initialAuth : authResult(owner); },
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
    '../../components/auth-context': { useAuth: () => ({ user: owner ? { id: owner } : null }) },
    '../../components/profile-context': { useProfile: () => ({ profile: null }) },
    '../../components/HomeCommandCenter': { HOME_TOKENS: { layout: {} } },
    '../../lib/supabase': { supabase },
    '../../lib/homeCollectionCache': homeCache,
    '../../lib/preparedCollectionValuation': prepared,
    '../../lib/collectionPricingState': pricingState,
    '../../lib/stableCollectionPrices': stablePrices,
    '../../lib/homeSavedCollection': { fetchHomeSavedCollection: async (id: string) => {
      savedReads.push(id); return options.saved ? options.saved(id) : emptySaved();
    } },
    '../../lib/homeActivity': { readRecentHomeActivityRows: async () => [] },
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
    reads, savedReads, tableReads, mintyReads, warnings, settle, tick,
    state: () => root.root.findByType('HomeState' as any).props,
    async auth(id: string, event = 'SIGNED_IN') { owner = id; await act(async () => { listener?.(event, id ? { user: { id } } : null); }); await tick(); },
    async focus(value: boolean) { focused = value; await act(async () => { root.update(screen()); }); },
    async interactions() { await act(async () => { for (const task of interactions.splice(0)) if (!task.cancelled) task.action(); }); },
    async close() { await act(async () => root.unmount()); },
  };
}

async function main() {
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
  assert.equal(first.state().collectionPricingSummary.latestCalculatedAt, '2026-10-12T12:00:00Z');
  assert.deepEqual(first.warnings, []);
  await first.close();

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
    authRead: async (call, owner) => call === 4 ? pendingConfirmation.promise : { data: { user: { id: owner } }, error: null } });
  assert.deepEqual(confirmation.reads, ['owner-a']);
  assert.equal(confirmation.state().collectionTotal, null, 'cache waits for the existing verified account confirmation');
  pendingCollection.resolve(emptySaved()); await confirmation.settle();
  assert.equal(confirmation.state().collectionTotal, 333);
  pendingConfirmation.resolve({ data: { user: { id: 'owner-a' } }, error: null }); await confirmation.settle();
  assert.equal(confirmation.state().collectionTotal, 333, 'late auth confirmation cannot let cache overwrite live data');
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
  await switching.interactions(); await switching.tick(180);
  assert.deepEqual(switching.mintyReads, ['owner-b'], 'cancelled A secondary work cannot run as B');
  savedB.resolve(emptySaved()); await switching.settle();
  assert.equal(switching.state().collectionTotal, 444);
  await switching.auth('', 'SIGNED_OUT');
  assert.equal(switching.state().collectionTotal, null, 'logout clears personal data immediately');
  await switching.close();

  const initial = deferred<any>();
  const staleAuth = await harness({ initialAuth: initial.promise });
  await staleAuth.auth('owner-b');
  initial.resolve({ data: { user: { id: 'owner-a' } }, error: null }); await staleAuth.settle(); await staleAuth.tick();
  assert.deepEqual(staleAuth.savedReads, ['owner-b'], 'late initial auth lookup cannot restore old account');
  await staleAuth.close();

  const blur = await harness();
  await blur.focus(false); await blur.interactions(); await blur.tick(180);
  assert.deepEqual(blur.tableReads, [], 'blur cancels optional startup reads');
  await blur.focus(true); await blur.interactions(); await blur.tick(180);
  assert.equal(blur.tableReads.filter(table => table === 'notifications').length, 1, 'return focus starts one current refresh');
  await blur.close(); await blur.tick(1_000);
  assert.deepEqual(blur.warnings, []);
  console.log('Home runtime startup passed: single bootstrap, deferred extras, cache/live precedence, account switching, late auth, blur and cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
