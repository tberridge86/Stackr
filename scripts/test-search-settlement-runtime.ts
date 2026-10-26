import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SearchPagination, mergeSearchRows, searchCardLookupIds, searchOwnedQuantities } from '../lib/searchPagination';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { fetchListingSearchWithMedia } from '../lib/listingSearchMedia';
import { beginRetrieval, exportRetrievalObservations, resetRetrievalObservations } from '../lib/performance';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }), resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function flush() { await tick(); await tick(); await tick(); }

function expressionFromSearch(name: string): string {
  const file = 'app/(tabs)/search.tsx';
  const source = process.env.SEARCH_SETTLEMENT_BASELINE === '1'
    ? execFileSync('git', ['show', `23c64b0e28c2260ba7b5312fbc0fee1bba8dbc6f:${file}`], { encoding: 'utf8' })
    : fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(tree);
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      expression = node.initializer.arguments[0].getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(expression, `Mounted Search must retain ${name}.`);
  return expression;
}

function extract<T>(name: string, scope: Record<string, unknown>): T {
  const output = ts.transpileModule(`const tested = ${expressionFromSearch(name)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), `${output}; return tested;`)(...Object.values(scope)) as T;
}

class FakeTimers {
  private now = 0;
  private nextId = 0;
  private jobs = new Map<number, { at: number; callback: () => void }>();

  setTimeout = (callback: () => void, ms = 0) => {
    const id = ++this.nextId;
    this.jobs.set(id, { at: this.now + ms, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (id: ReturnType<typeof setTimeout>) => { this.jobs.delete(Number(id)); };

  advance(ms: number) {
    this.now += ms;
    const due = [...this.jobs.entries()].filter(([, job]) => job.at <= this.now);
    due.forEach(([id]) => this.jobs.delete(id));
    due.forEach(([, job]) => job.callback());
  }
}

type Harness = {
  run: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  pagination: SearchPagination;
  scope: Record<string, unknown>;
  refs: { requestRef: { current: number }; paginationRef: { current: SearchPagination }; searchFocusedRef: { current: boolean } };
  requestRef: { current: number };
  cards: Deferred<any[]>;
  sets: Deferred<any[]>;
  products: Deferred<any[]>;
  profiles: Deferred<any>;
  listings: Deferred<any>;
  cachedCards: Deferred<any[] | null>;
  publishCanonical: (rows: any[]) => void;
  getState: () => any;
  getErrors: () => any;
  getLoading: () => boolean;
  writes: () => number;
  cacheWrites: () => number;
  flushResultUpdates: () => any[];
  invalidateAccount: () => void;
  previousResults: () => any;
};

function createHarness(timers: FakeTimers, options: {
  category?: string; language?: string; previous?: boolean; canonicalRows?: any[];
  deferGroups?: boolean; deferCanonical?: boolean; deferCache?: boolean; deferResultUpdates?: boolean;
  ownedRows?: { card_id: string; quantity: number }[];
  productListingStats?: Map<string, { count: number; lowest: number | null }>;
  clock?: () => number;
  paged?: boolean;
  pageTransport?: (cursor: string, signal: AbortSignal) => Promise<any[]>;
} = {}): Harness {
  const EMPTY_RESULTS = { cards: [], sets: [], sealed: [], collectors: [], listings: [], graded: [] };
  const requestRef = { current: 0 };
  const searchFocusedRef = { current: true };
  const paginationRef = { current: new SearchPagination() };
  const category = options.category ?? 'all';
  const selectedLanguage = options.language ?? 'en';
  const prior = { ...EMPTY_RESULTS, cards: [{ id: 'prior-card' }], sets: [{ id: 'prior-set' }] };
  const previousSearchRef = { current: options.previous
    ? { key: JSON.stringify(['Pikachu', category, selectedLanguage, 0]), results: prior }
    : null as any };
  let state = options.previous ? prior : EMPTY_RESULTS;
  let errors: any = {};
  let loading = false;
  let writeCount = 0;
  let cacheWriteCount = 0;
  let publishCanonical = (_rows: any[]) => {};
  const pendingResultUpdates: ((current: any) => any)[] = [];
  const cards = deferred<any[]>();
  const sets = deferred<any[]>();
  const products = deferred<any[]>();
  const profiles = deferred<any>();
  const listings = deferred<any>();
  const cachedCards = deferred<any[] | null>();
  const chain = (table: string) => ({ select() { return this; }, ilike() { return this; }, eq() { return this; }, or() { return this; },
    limit: () => options.deferGroups ? (table === 'profile_public_directory' ? profiles.promise : listings.promise) : Promise.resolve({ data: [] }) });
  const noop = () => {};
  const setResults = (value: any) => {
    if (typeof value === 'function' && options.deferResultUpdates) pendingResultUpdates.push(value);
    else state = typeof value === 'function' ? value(state) : value;
    writeCount += 1;
  };
  const setErrors = (value: any) => { errors = typeof value === 'function' ? value(errors) : value; writeCount += 1; };
  const setLoading = (value: boolean) => { loading = value; writeCount += 1; };
  const beginRecentSearchAuthBoundary = extract<(userId: string | null) => void>('beginRecentSearchAuthBoundary', {
    observedRecentSearchUserIdRef: { current: 'previous-account' },
    recentSearchGenerationRef: { current: 0 }, recentSearchIdentityRef: { current: null },
    previousSearchRef, requestRef, paginationRef, EMPTY_RESULTS, setResults, setErrors, setLoading,
    setSuggestion: noop, setRefreshing: noop, setSearchIdentityEpoch: noop, setRecentSearches: noop,
    clearLegacyRecentSearches: async () => {},
  });
  const settleSearchSource = extract<<T>(promise: Promise<T>, timeoutMs?: number) => Promise<PromiseSettledResult<T>>>(
    'settleSearchSource',
    { SEARCH_FINAL_SETTLEMENT_TIMEOUT_MS: 5, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout },
  );
  const scope = {
    beginRetrieval: (journey: Parameters<typeof beginRetrieval>[0], origin: Parameters<typeof beginRetrieval>[1]) => beginRetrieval(journey, origin, options.clock),
    searchTraceRef: { current: null }, pendingSearchTraceRef: { current: null }, searchCommitTraceRef: { current: null },
    fetchListingSearchWithMedia,
    continuationCardsRef: { current: [] }, searchFocusedRef, requestRef, paginationRef, mergeSearchRows, searchCardLookupIds, searchOwnedQuantities,
    previousSearchRef,
    category,
    selectedLanguage,
    searchIdentityEpoch: 0,
    EMPTY_RESULTS,
    SEARCH_FIRST_PAINT_BUDGET_MS: 1,
    setResults, setLoading, setErrors, setRefreshing: () => {},
    setSuggestion: noop, setSetSuggestion: noop, setSearchError: noop,
    expandSearchQuery: (value: string) => [value.toLowerCase()], normaliseSearchText: (value: string) => value.toLowerCase(),
    getCatalogueProductTypeFilter: () => null, getListingProductTypeFilter: () => null,
    productTypeMatchesIntent: () => false, isRawCardCategory: () => true,
    isListingProductCategory: () => false, isGradedCategory: () => false,
    correctPokemonNameQuery: async () => null, searchSetsQuick: () => sets.promise,
    searchMarketProducts: () => options.deferGroups ? products.promise : Promise.resolve([]),
    readCachedCanonicalSearch: () => options.deferCache ? cachedCards.promise : Promise.resolve(null),
    writeCachedCanonicalSearch: async () => { cacheWriteCount += 1; },
    searchLocalPokemonCards: (_query: string, callbacks: any) => {
      if (callbacks.cursor) { callbacks.onPagination?.({ nextCursor: null, continuationAvailable: true }); return options.pageTransport?.(callbacks.cursor, callbacks.signal) ?? Promise.resolve([{ id: 'page-two' }]); }
      if (options.paged) callbacks.onPagination?.({ nextCursor: 'page-two-cursor', continuationAvailable: true });
      publishCanonical = callbacks.onCanonicalResults;
      if (!options.deferCanonical) publishCanonical(options.canonicalRows ?? [{ id: 'good-card', name: 'Good card' }]);
      return cards.promise;
    },
    supabase: { from: chain },
    settleWithin: async () => ({ status: 'pending' }),
    settleSearchSource,
    isFulfilled: (result: any) => result.status === 'fulfilled', isRejected: (result: any) => result.status === 'rejected',
    mapCardResults: (rows: any[], _listingStats?: unknown, ownedMap?: Map<string, number>) => ownedMap
      ? rows.map((row) => ({ ...row, ownedQuantity: ownedMap.get(row.id) ?? 0 })) : rows,
    mapListingResult: (row: any) => row,
    sanitizeGate0CommerceCopy: (value: any) => value,
    retainFailedSearchGroups: (next: any, nextErrors: any, previous: any, currentResults: any = {}) => Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, nextErrors[key] && previous && !currentResults[key] && (value as any[]).length === 0 ? previous[key] : value]),
    ),
    fetchCardListingStats: async () => new Map(), fetchOwnedCardRows: async () => options.ownedRows ?? [],
    fetchProductListingStats: async () => options.productListingStats ?? new Map(),
    console: { log: noop },
  };
  const run = extract<(query: string, force?: boolean) => Promise<void>>('runSearch', scope);
  const loadMore = extract<() => Promise<void>>('loadMoreCards', { ...scope, query: 'Pikachu', debouncedQuery: 'Pikachu' });
  return { run, loadMore, scope, refs: { requestRef, paginationRef, searchFocusedRef }, pagination: paginationRef.current, requestRef, cards, sets, products, profiles, listings, cachedCards,
    publishCanonical: (rows) => publishCanonical(rows),
    getState: () => state, getErrors: () => errors, getLoading: () => loading,
    writes: () => writeCount, cacheWrites: () => cacheWriteCount,
    invalidateAccount: () => beginRecentSearchAuthBoundary('replacement-account'),
    previousResults: () => previousSearchRef.current,
    flushResultUpdates: () => pendingResultUpdates.splice(0).map((update) => { state = update(state); return state; }) };
}

async function testIndependentReadyGroups() {
  const timers = new FakeTimers();
  const harness = createHarness(timers, { deferGroups: true });
  const pending = harness.run('Pikachu');
  await flush();
  harness.sets.resolve([{ id: 'ready-set' }]);
  await flush();
  assert.equal(harness.getState().sets[0]?.id, 'ready-set', 'a ready set renders before the stalled card source reaches its final deadline');
  harness.products.resolve([{ id: 'ready-product' }]);
  harness.profiles.resolve({ data: [{ id: 'ready-collector', collector_name: 'Collector A' }], error: null });
  harness.listings.resolve({ data: [{ id: 'raw-listing' }, { id: 'graded-listing', pricing_mode: 'graded' }], error: null });
  await flush();
  assert.equal(harness.getState().sealed[0]?.id, 'ready-product');
  assert.equal(harness.getState().collectors[0]?.name, 'Collector A');
  assert.deepEqual(harness.getState().listings.map((row: any) => row.id), ['raw-listing']);
  assert.deepEqual(harness.getState().graded.map((row: any) => row.id), ['graded-listing']);
  assert.equal(harness.getLoading(), true, 'unfinished sibling work remains honestly loading');
  timers.advance(5);
  await pending;
  assert.equal(harness.getState().sets[0]?.id, 'ready-set', 'final timeout preserves independently ready groups');
}

async function testIndependentEmptyFailureAndInvalidation() {
  for (const outcome of ['empty', 'failure', 'stale'] as const) {
    const timers = new FakeTimers();
    const harness = createHarness(timers, { previous: true, deferGroups: true });
    const pending = harness.run('Pikachu');
    await flush();
    if (outcome === 'stale') harness.requestRef.current += 1;
    const before = harness.writes();
    if (outcome === 'failure') harness.sets.reject(new Error('offline'));
    else harness.sets.resolve(outcome === 'empty' ? [] : [{ id: 'stale-set' }]);
    await flush();
    if (outcome === 'empty') assert.deepEqual(harness.getState().sets, [], 'explicit current empty set results replace prior matches immediately');
    if (outcome === 'failure') {
      assert.equal(harness.getState().sets[0]?.id, 'prior-set', 'failed same-query set refresh preserves prior matches');
      assert.equal(harness.getErrors().sets, 'Set results could not be loaded.');
    }
    if (outcome === 'stale') assert.equal(harness.writes(), before, 'invalidated request cannot publish a ready group');
    timers.advance(5);
    await pending;
  }
}

async function testTimeoutRuntimePath() {
  const timers = new FakeTimers();
  const harness = createHarness(timers, { previous: true });
  const pending = harness.run('Pikachu');
  await flush();
  assert.equal(harness.getState().cards[0].id, 'good-card', 'canonical cards publish before a sibling settles');
  assert.equal(harness.getLoading(), true, 'first phase remains loading while sources are pending');
  timers.advance(5);
  await pending;
  assert.equal(harness.getLoading(), false, 'final timeout clears loading in the mounted coordinator');
  assert.equal(harness.getState().cards[0].id, 'good-card', 'a timed-out source retains useful canonical cards');
  assert.equal(harness.getState().sets[0].id, 'prior-set', 'a stalled source retains previous same-query group content');
  assert.equal(harness.getErrors().sets, 'Set results could not be loaded.', 'the stalled set group is honestly reported as unavailable');
  assert.equal(harness.getErrors().cards, 'Card results could not be refreshed.', 'a timed-out fresh card source remains honestly retryable even when early rows are useful');
  assert.notEqual(harness.getState().cards[0].id, 'prior-card', 'a useful current canonical row must beat a same-query fallback');
  const afterTimeoutWrites = harness.writes();
  harness.cards.resolve([{ id: 'late-card' }]);
  harness.sets.resolve([{ id: 'late-set' }]);
  await flush();
  assert.equal(harness.writes(), afterTimeoutWrites, 'late successful transports after their timeout cannot mutate settled screen state');
}

async function testKnownEmptyCanonicalDoesNotRestorePriorMatch() {
  const timers = new FakeTimers();
  const harness = createHarness(timers, { previous: true, canonicalRows: [] });
  const pending = harness.run('Pikachu');
  await flush();
  harness.cards.reject(new Error('fresh catalogue request failed'));
  harness.sets.resolve([]);
  await pending;
  assert.deepEqual(harness.getState().cards, [], 'an explicit current no-match must not revive an older same-query card');
  assert.equal(harness.getErrors().cards, 'Card results could not be refreshed.', 'a rejected later refresh remains retryable after an explicit no-match');
}

async function testLateFactualCallbacksAfterSettlement() {
  for (const outcome of ['timeout', 'success'] as const) {
    for (const source of ['canonical', 'cache'] as const) {
      const timers = new FakeTimers();
      const harness = createHarness(timers, { deferCanonical: true, deferCache: true });
      const pending = harness.run('Celebi');
      await flush();
      if (outcome === 'success') {
        harness.cards.resolve([{ id: 'current-celebi', quantity: 2 }]);
        harness.sets.resolve([]);
      } else {
        timers.advance(5);
      }
      await pending;
      await flush();
      const settledState = harness.getState();
      const settledErrors = harness.getErrors();
      const settledWrites = harness.writes();
      const settledCacheWrites = harness.cacheWrites();
      assert.equal(harness.getLoading(), false);
      if (source === 'canonical') harness.publishCanonical([{ id: 'late-canonical-celebi' }]);
      else harness.cachedCards.resolve([{ id: 'late-cache-celebi' }]);
      harness.cards.resolve([{ id: 'late-final-celebi' }]);
      await flush();
      assert.equal(harness.getState(), settledState, `${outcome}/${source}: late factual callbacks cannot replace the settled result snapshot`);
      assert.equal(harness.getErrors(), settledErrors, `${outcome}/${source}: late factual callbacks cannot repaint the settled error state`);
      assert.equal(harness.writes(), settledWrites, `${outcome}/${source}: the actual late callback schedules no state updates`);
      assert.equal(harness.cacheWrites(), settledCacheWrites, `${outcome}/${source}: a settled callback cannot refresh the canonical cache`);
    }
  }
}

async function testQueuedFactualUpdatesAfterSettlement() {
  for (const source of ['canonical', 'cache'] as const) {
    const timers = new FakeTimers();
    const harness = createHarness(timers, { deferCanonical: true, deferCache: true, deferResultUpdates: true });
    const pending = harness.run('Celebi');
    await flush();
    const earlyRows = [{ id: 'current-celebi', image_small: null }];
    if (source === 'canonical') harness.publishCanonical(earlyRows);
    else harness.cachedCards.resolve(earlyRows);
    await flush();
    harness.cards.resolve([{ id: 'current-celebi', image_small: 'https://example.test/current.webp' }]);
    harness.sets.resolve([]);
    await pending;
    await flush();
    assert.equal(harness.getState().cards[0].image_small, 'https://example.test/current.webp');
    const queuedSnapshots = harness.flushResultUpdates();
    assert.ok(queuedSnapshots.length > 0, 'the harness must execute delayed functional state updates');
    for (const snapshot of queuedSnapshots) {
      assert.equal(snapshot.cards[0].image_small, 'https://example.test/current.webp',
        `${source}: an early functional updater executed after settlement cannot overwrite the final card snapshot`);
    }
  }
}

async function testCachedFactsBeforeSettlement() {
  const timers = new FakeTimers();
  const harness = createHarness(timers, { deferCanonical: true, deferCache: true });
  const pending = harness.run('Celebi');
  await flush();
  harness.cachedCards.resolve([{ id: 'cached-celebi' }]);
  await flush();
  assert.equal(harness.getState().cards[0].id, 'cached-celebi', 'cached facts remain useful before the current request settles');
  harness.publishCanonical([{ id: 'fresh-celebi' }]);
  assert.equal(harness.getState().cards[0].id, 'fresh-celebi', 'fresh canonical facts replace the cache before optional work settles');
  timers.advance(5);
  await pending;
  assert.equal(harness.getState().cards[0].id, 'fresh-celebi', 'deadline preserves the useful current facts');
  assert.equal(harness.getErrors().cards, 'Card results could not be refreshed.');
}

async function testQueuedHydrationBoundaries() {
  for (const source of ['cards', 'products'] as const) {
    for (const boundary of ['same request', 'replacement query', 'account change'] as const) {
      const timers = new FakeTimers();
      const harness = createHarness(timers, {
        deferCanonical: true, deferGroups: true, deferResultUpdates: true,
        ownedRows: [{ card_id: 'account-a-card', quantity: 7 }],
        productListingStats: new Map([['account-a-product', { count: 9, lowest: null }]]),
      });
      const pending = harness.run('Celebi');
      await flush();
      harness.cards.resolve(source === 'cards' ? [{ id: 'account-a-card' }] : []);
      harness.products.resolve(source === 'products'
        ? [{ id: 'account-a-product', latest_price: { count: 2 } }] : []);
      harness.sets.resolve([]);
      harness.profiles.resolve({ data: [], error: null });
      harness.listings.resolve({ data: [], error: null });
      await pending;
      await flush();
      assert.equal(harness.getLoading(), false, 'same-request hydration may finish after factual settlement');
      if (boundary === 'replacement query') await harness.run('');
      if (boundary === 'account change') harness.invalidateAccount();
      const stateBeforeQueuedUpdates = harness.getState();
      const previousBeforeQueuedUpdates = harness.previousResults();
      const snapshots = harness.flushResultUpdates();
      assert.ok(snapshots.length > 0, 'the actual coordinator must queue hydration updaters for this control');
      if (boundary === 'same request') {
        if (source === 'cards') {
          assert.equal(harness.getState().cards[0].ownedQuantity, 7,
            'current-request ownership quantities still hydrate after factual settlement');
          assert.equal(harness.previousResults().results.cards[0].ownedQuantity, 7,
            'current-request hydration keeps the retained snapshot current');
        } else {
          assert.equal(harness.getState().sealed[0].latest_price.count, 9,
            'current-request product listing counts still hydrate after factual settlement');
        }
      } else {
        for (const snapshot of snapshots) {
          assert.equal(snapshot, stateBeforeQueuedUpdates,
            `${source}/${boundary}: a queued old hydration updater cannot restore previous-account or previous-query rows`);
        }
        assert.equal(harness.previousResults(), previousBeforeQueuedUpdates,
          `${source}/${boundary}: a queued old hydration updater cannot restore the retained private snapshot`);
        assert.deepEqual(harness.getState().cards, []);
        assert.deepEqual(harness.getState().sealed, []);
      }
    }
  }
}

async function testStaleBoundaries() {
  for (const boundary of ['replacement query', 'category change', 'language change', 'account change', 'unmount'] as const) {
    const timers = new FakeTimers();
    const harness = createHarness(timers, { category: boundary === 'category change' ? 'sealed' : 'all', language: boundary === 'language change' ? 'ja' : 'en' });
    const pending = harness.run('Pikachu');
    await flush();
    harness.requestRef.current += 1;
    const writesBeforeTimeout = harness.writes();
    timers.advance(5);
    await pending;
    assert.equal(harness.writes(), writesBeforeTimeout, `${boundary} prevents the timed-out request from publishing final state`);
    harness.cards.resolve([{ id: `late-${boundary}` }]);
    harness.sets.resolve([{ id: `late-${boundary}` }]);
    harness.publishCanonical([{ id: `late-canonical-${boundary}` }]);
    await flush();
    assert.equal(harness.writes(), writesBeforeTimeout, `${boundary} prevents late transport completion from repainting the screen`);
  }
}

async function testContinuationIndependentOfOptionalSections() {
  const timers = new FakeTimers();
  const harness = createHarness(timers, { deferGroups: true, paged: true });
  const pending = harness.run('Pikachu');
  await flush();
  assert.equal(harness.pagination.state.ready, true, 'ready canonical cards enable continuation before optional sources settle');
  await harness.loadMore();
  assert.deepEqual(harness.getState().cards.map((row: any) => row.id), ['good-card', 'page-two']);
  harness.cards.resolve([{ id: 'good-card', name: 'Enriched' }]);
  harness.sets.resolve([]); harness.products.resolve([]);
  harness.profiles.resolve({ data: [], error: null }); harness.listings.resolve({ data: [], error: null });
  await pending; await flush();
  assert.deepEqual(harness.getState().cards.map((row: any) => row.id), ['good-card', 'page-two'],
    'late initial enrichment/reconciliation must retain continuation pages');
  assert.equal(harness.pagination.state.nextCursor, null, 'late initial metadata cannot rewind continuation');
}

async function testMountedContinuationRecoveryAndAccountBoundary() {
  for (const outcome of ['offline', 'revision', 'account'] as const) {
    const timers = new FakeTimers(); const held = deferred<any[]>();
    let calls = 0; let signal: AbortSignal | undefined;
    const harness = createHarness(timers, { deferGroups: true, paged: true,
      pageTransport: (cursor, requestSignal) => {
        assert.equal(cursor, 'page-two-cursor');
        calls++; signal = requestSignal;
        return calls === 1 ? held.promise : Promise.resolve([{ id: 'recovered-page' }]);
      } });
    const initial = harness.run('Pikachu'); await flush();
    const more = harness.loadMore(); await harness.loadMore();
    assert.equal(calls, 1);
    if (outcome === 'account') {
      harness.invalidateAccount();
      assert.equal(signal?.aborted, true);
      held.resolve([{ id: 'late-other-account' }]);
    } else held.reject(Object.assign(new Error(outcome), { code: outcome === 'revision' ? 'search_catalogue_changed' : 'network' }));
    await more; await flush();
    if (outcome === 'account') assert.equal(harness.getState().cards.length, 0);
    else {
      assert.equal(harness.getState().cards[0].id, 'good-card', 'failed next page retains useful first page');
      assert.equal(harness.pagination.state.error, outcome === 'revision' ? 'changed' : 'retry');
      await harness.loadMore();
      if (outcome === 'offline') {
        assert.equal(calls, 2); assert.equal(harness.getState().cards[1].id, 'recovered-page');
      } else assert.equal(calls, 1, 'changed catalogue cannot retry obsolete cursor');
    }
    timers.advance(5); await initial;
    if (outcome === 'account') assert.equal(harness.getState().cards.length, 0, 'late original lanes cannot restore previous account');
  }
}

async function testMountedFocusAndDebounceLifecycle() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const timers = new FakeTimers();
  const harness = createHarness(timers, { paged: true });
  const file = 'app/(tabs)/search.tsx';
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'GlobalSearchScreen');
  assert.ok(screen?.body);
  const names = new Set(['[query, setQuery]', '[debouncedQuery, setDebouncedQuery]',
    '[searchInputEpoch, setSearchInputEpoch]', '[searchIdentityEpoch, setSearchIdentityEpoch]', 'searchFocusVisitRef', 'runSearch']);
  const statements = screen.body.statements.filter(node => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(declaration => names.has(declaration.name.getText(ast)));
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
    const text = node.getText(ast);
    return text.startsWith('useFocusEffect(') || text.includes('setDebouncedQuery(query.trim())')
      || text.includes('void runSearch(debouncedQuery)');
  }).map(node => node.getText(ast));
  assert.equal(statements.length, 9);
  const compiled = ts.transpileModule('function Lifecycle() { const paramQuery = ""; ' + statements.join('\n') +
    '; return React.createElement("SearchLifecycle", { query, setQuery, debouncedQuery, searchInputEpoch }); }; return Lifecycle;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let focused = true;
  const noop = () => {};
  const scope = {
    React, useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect,
    ...harness.scope, ...harness.refs,
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => focused ? callback() : undefined, [callback, focused]),
    recentSearchIdentityRef: { current: null }, isCurrentRecentSearchIdentity: () => true,
    loadRecentSearches: async () => [], setRecentSearches: noop,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  };
  const Lifecycle = new Function(...Object.keys(scope), compiled)(...Object.values(scope));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(Lifecycle)); });
  const state = () => renderer.root.findByType('SearchLifecycle' as any).props;
  await act(async () => { state().setQuery('Pikachu'); });
  await act(async () => { focused = false; renderer.update(React.createElement(Lifecycle)); });
  await act(async () => { timers.advance(240); await flush(); });
  assert.equal(harness.refs.searchFocusedRef.current, false);
  assert.equal(harness.cacheWrites(), 0, 'blur before debounce must not start a new offscreen catalogue read');
  await act(async () => { focused = true; renderer.update(React.createElement(Lifecycle)); await flush(); });
  assert.equal(harness.cacheWrites(), 1, 'refocus restarts the current query');
  assert.equal(harness.pagination.state.ready, true);
  await act(async () => { state().setQuery('PikachuB'); });
  await act(async () => { state().setQuery('Pikachu'); });
  await act(async () => { timers.advance(240); await flush(); });
  assert.equal(harness.cacheWrites(), 2, 'A-to-B-to-A restarts despite unchanged debounced text');
  assert.equal(harness.pagination.state.ready, true);
  await act(async () => { renderer.unmount(); timers.advance(10); await flush(); });
}

async function main() {
  await testMountedFocusAndDebounceLifecycle();
  await testContinuationIndependentOfOptionalSections();
  await testMountedContinuationRecoveryAndAccountBoundary();
  resetRetrievalObservations();
  let now = 0;
  const measured = createHarness(new FakeTimers(), { deferCanonical: true, deferGroups: true, clock: () => now });
  const measuredRun = measured.run('Pikachu');
  await flush();
  now = 25;
  measured.publishCanonical([{ id: 'measured-card' }]);
  now = 30;
  measured.cards.resolve([{ id: 'measured-card' }]);
  await flush();
  let measurement = exportRetrievalObservations().observations.at(-1)!;
  assert.equal(measurement.phasesMs['network-complete'], 25, 'factual completion precedes optional artwork and unrelated groups');
  assert.equal(measurement.phasesMs['card-source-ready'], 30, 'card source/enrichment completion has its own endpoint');
  assert.equal(measurement.outcome, 'pending', 'unrelated groups have not settled');
  now = 1000;
  measured.sets.resolve([]); measured.products.resolve([]);
  measured.profiles.resolve({ data: [] }); measured.listings.resolve({ data: [] });
  await measuredRun;
  measurement = exportRetrievalObservations().observations.at(-1)!;
  assert.equal(measurement.phasesMs['network-complete'], 25);
  assert.equal(measurement.phasesMs['facts-settled'], 1000);
  assert.equal(measurement.settlementScope, 'facts-only');
  await testIndependentReadyGroups();
  await testIndependentEmptyFailureAndInvalidation();
  await testTimeoutRuntimePath();
  await testKnownEmptyCanonicalDoesNotRestorePriorMatch();
  await testLateFactualCallbacksAfterSettlement();
  await testQueuedFactualUpdatesAfterSettlement();
  await testCachedFactsBeforeSettlement();
  await testQueuedHydrationBoundaries();
  await testStaleBoundaries();
  console.log('Production Search callbacks pass independent ready groups, explicit empty/failure recovery, timeout and simulated stale/late guards; this harness does not prove native device latency.');
}

void main();
