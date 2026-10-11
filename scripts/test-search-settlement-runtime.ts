import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

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
  const source = fs.readFileSync(file, 'utf8');
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
  requestRef: { current: number };
  cards: Deferred<any[]>;
  sets: Deferred<any[]>;
  getState: () => any;
  getErrors: () => any;
  getLoading: () => boolean;
  writes: () => number;
};

function createHarness(timers: FakeTimers, options: { category?: string; language?: string; previous?: boolean; canonicalRows?: any[] } = {}): Harness {
  const EMPTY_RESULTS = { cards: [], sets: [], sealed: [], collectors: [], listings: [], graded: [] };
  const requestRef = { current: 0 };
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
  const cards = deferred<any[]>();
  const sets = deferred<any[]>();
  const chain = { select() { return this; }, ilike() { return this; }, eq() { return this; }, or() { return this; }, limit: async () => ({ data: [] }) };
  const noop = () => {};
  const settleSearchSource = extract<<T>(promise: Promise<T>, timeoutMs?: number) => Promise<PromiseSettledResult<T>>>(
    'settleSearchSource',
    { SEARCH_FINAL_SETTLEMENT_TIMEOUT_MS: 5, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout },
  );
  const run = extract<(query: string, force?: boolean) => Promise<void>>('runSearch', {
    requestRef,
    previousSearchRef,
    category,
    selectedLanguage,
    searchIdentityEpoch: 0,
    EMPTY_RESULTS,
    SEARCH_FIRST_PAINT_BUDGET_MS: 1,
    setResults: (value: any) => { state = typeof value === 'function' ? value(state) : value; writeCount += 1; },
    setLoading: (value: boolean) => { loading = value; writeCount += 1; },
    setRefreshing: () => {}, setErrors: (value: any) => { errors = value; writeCount += 1; },
    setSuggestion: noop, setSetSuggestion: noop, setSearchError: noop,
    expandSearchQuery: (value: string) => [value.toLowerCase()], normaliseSearchText: (value: string) => value.toLowerCase(),
    getCatalogueProductTypeFilter: () => null, getListingProductTypeFilter: () => null,
    productTypeMatchesIntent: () => false, isRawCardCategory: () => true,
    isListingProductCategory: () => false, isGradedCategory: () => false,
    correctPokemonNameQuery: async () => null, searchSetsQuick: () => sets.promise,
    searchMarketProducts: async () => [], readCachedCanonicalSearch: async () => null, writeCachedCanonicalSearch: async () => {},
    searchLocalPokemonCards: (_query: string, callbacks: any) => {
      callbacks.onCanonicalResults(options.canonicalRows ?? [{ id: 'good-card', name: 'Good card' }]);
      return cards.promise;
    },
    supabase: { from: () => chain },
    settleWithin: async () => ({ status: 'pending' }),
    settleSearchSource,
    isFulfilled: (result: any) => result.status === 'fulfilled', isRejected: (result: any) => result.status === 'rejected',
    mapCardResults: (rows: any[]) => rows, mapListingResult: (row: any) => row,
    sanitizeGate0CommerceCopy: (value: any) => value,
    retainFailedSearchGroups: (next: any, nextErrors: any, previous: any, currentResults: any = {}) => Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, nextErrors[key] && previous && !currentResults[key] && (value as any[]).length === 0 ? previous[key] : value]),
    ),
    fetchCardListingStats: async () => new Map(), fetchOwnedCardRows: async () => [], fetchProductListingStats: async () => new Map(),
    console: { log: noop },
  });
  return { run, requestRef, cards, sets, getState: () => state, getErrors: () => errors, getLoading: () => loading, writes: () => writeCount };
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
    await flush();
    assert.equal(harness.writes(), writesBeforeTimeout, `${boundary} prevents late transport completion from repainting the screen`);
  }
}

async function main() {
  await testTimeoutRuntimePath();
  await testKnownEmptyCanonicalDoesNotRestorePriorMatch();
  await testStaleBoundaries();
  console.log('Search coordinator harness passes timeout, honest group error, simulated invalidation and late-completion guards.');
}

void main();
