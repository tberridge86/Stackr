import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const never = () => new Promise(() => {});
const summary = (owner = 'A') => ({
  schemaVersion: 'collection-summary-v1', subjectUserId: owner, updatedAt: '2026-11-02T00:00:00Z',
  totalOwnedItems: 2, totalCardsOwned: 2, uniqueCards: 1, rawCardsOwned: 2, gradedSlabsOwned: 0,
  sealedProductsOwned: 0, duplicateCopies: 1, binderCount: 1, completedSets: 0, collectionValue: null,
  valuation: { basis: 'stored_tcg_raw_estimate', currency: 'GBP', freshness: 'unknown', usdToGbp: 0.79,
    totalUnits: 2, pricedUnits: 0, unpricedUnits: 2, unsupportedUnits: 0, missingPriceUnits: 2, state: 'unavailable' },
});
const binder = (owner = 'A', id = 'binder-1') => ({ id, user_id: owner, name: 'My binder', type: 'custom', created_at: '2026-11-02', color: '#123456' });
function fixture() {
  const state = { owner: 'A', sessionRead: null, summaryRead: null, binderRead: null, diskRead: null, masterRead: null, rpc: 0, binders: 0, listeners: [], calls: [] };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const cache = new Map();
  const storage = { getItem: () => state.diskRead?.() ?? Promise.resolve(null), getAllKeys: () => state.masterRead?.() ?? Promise.resolve([]), multiGet: async () => [] };
  const supabase = {
    auth: {
      onAuthStateChange: callback => { state.listeners.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: () => state.sessionRead?.() ?? Promise.resolve({ data: { session: { user: { id: state.owner }, access_token: state.owner } }, error: null }),
    },
    rpc: (name, params) => {
      assert.equal(name, 'collection_summary_v1'); assert.deepEqual(Array.from(params.p_master_binder_ids), []); state.rpc++;
      return { abortSignal: () => state.summaryRead?.() ?? Promise.resolve({ data: summary(state.owner), error: null }) };
    },
    from: name => {
      assert.equal(name, 'binders'); state.binders++;
      const chain = {};
      for (const method of ['select', 'eq', 'order', 'limit']) chain[method] = (...args) => { state.calls.push([method, ...args]); return chain; };
      chain.abortSignal = () => state.binderRead?.() ?? Promise.resolve({ data: [binder(state.owner)], error: null });
      return chain;
    },
  };
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute);
    const module = { exports: {} }; cache.set(absolute, module.exports);
    const requireModule = id => {
      if (id === '@tanstack/react-query') return { QueryClient: class { constructor() { return queryClient; } } };
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (id === './supabase') return { supabase };
      if (id === './requestCache') return { invalidateRequestCache() {}, getCachedOrFetch() { throw new Error('Unexpected saved-row cache request'); } };
      if (id === './mobileRuntimeConfig') return { MOBILE_RUNTIME_CONFIG: { supabaseUrl: 'https://test.invalid' } };
      assert.ok(id.startsWith('.'), 'Unexpected dependency: ' + id);
      const dependency = path.resolve(path.dirname(absolute), id + '.ts');
      const exports = load(dependency);
      // Accelerate only the real timeout boundary for hung-read tests. This is
      // deterministic module evidence, not a device latency measurement.
      if (id === './personalDataRead') return { ...exports, withPersonalDataReadTimeout: (read, options) => exports.withPersonalDataReadTimeout(read, { ...options, timeoutMs: 50 }) };
      return exports;
    };
    const source = fs.readFileSync(absolute, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { module, exports: module.exports, require: requireModule, console, AbortController, setTimeout, clearTimeout, process: { env: {} } }, { filename: absolute });
    return module.exports;
  }
  const home = load('lib/coreHomeData.ts');
  const queries = load('lib/stackrQuery.ts');
  const invalidation = load('lib/collectionSummaryInvalidation.ts');
  const library = load('lib/binderLibraryCache.ts');
  const events = [];
  let isCurrent = true;
  function start(overrides = {}) {
    return home.startCoreHomeRead({ userId: 'A', isCurrent: () => isCurrent, isAccessDenied: error => error?.status === 403,
      onSummary: (value, cached) => events.push(['summary', value, cached]),
      onBinders: (value, cached) => events.push(['binders', value, cached]),
      onError: (section, error) => events.push(['error', section, error]),
      onDone: () => events.push(['done']), ...overrides });
  }
  return { state, queryClient, queries, invalidation, library, events, start,
    changeAccount(owner) { state.owner = owner; for (const callback of state.listeners) callback('SIGNED_IN', { user: { id: owner }, access_token: owner }); },
    stopView() { isCurrent = false; }, close() { queryClient.clear(); } };
}
let scenarios = 0;
async function test(run) { const f = fixture(); try { await run(f); scenarios++; } finally { f.close(); } }

await test(async f => {
  f.queryClient.setQueryData(f.queries.stackrQueryKeys.collectionSummary('A'), summary());
  f.queryClient.setQueryData(f.queries.stackrQueryKeys.binderLibrary('A'), { binders: [binder()], customNameArtKeys: {} });
  f.state.diskRead = never; f.state.masterRead = never;
  const request = f.start({ forceRefresh: true });
  assert.deepEqual(f.events.map(event => event[0]), ['summary', 'binders'], 'Memory paints synchronously');
  await request.done;
  assert.ok(f.events.some(event => event[0] === 'binders' && !event[2]), 'Live binders survive hung summary preferences');
  assert.equal(f.state.rpc, 0);
  assert.equal(f.state.binders, 1);
});
await test(async f => {
  const delayed = defer(); f.state.summaryRead = () => delayed.promise;
  const request = f.start(); await tick();
  assert.deepEqual(f.events.map(event => event[0]), ['binders']);
  delayed.resolve({ data: summary(), error: null }); await request.done;
  assert.equal(f.state.rpc, 1); assert.equal(f.state.binders, 1);
});
await test(async f => {
  const delayed = defer(); f.state.binderRead = () => delayed.promise;
  const request = f.start(); await tick();
  assert.deepEqual(f.events.map(event => event[0]), ['summary']);
  delayed.resolve({ data: [binder()], error: null }); await request.done;
});
for (const denied of [false, true]) await test(async f => {
  const disk = defer(); f.state.diskRead = () => disk.promise;
  f.state.binderRead = async () => denied ? { data: null, error: { status: 403 } } : { data: [], error: null };
  await f.start().done;
  const before = f.events.length;
  disk.resolve(f.library.serializeBinderLibraryOverview('A', { binders: [binder()], customNameArtKeys: {} }));
  await tick(); assert.equal(f.events.length, before, 'Late disk cannot replace live empty or denied data');
});
await test(async f => {
  const delayed = defer(); f.state.summaryRead = () => delayed.promise;
  f.state.binderRead = () => delayed.promise.then(() => ({ data: [binder()], error: null }));
  const one = f.start(), two = f.start(); await tick();
  assert.equal(f.state.rpc, 1); assert.equal(f.state.binders, 1, 'Concurrent subscribers share the live queries');
  one.dispose(); delayed.resolve({ data: summary(), error: null });
  await Promise.all([one.done, two.done]);
  assert.equal(f.events.filter(event => event[0] === 'summary').length, 1);
  assert.equal(f.events.filter(event => event[0] === 'binders').length, 1);
  assert.ok(f.queryClient.getQueryData(f.queries.stackrQueryKeys.collectionSummary('A')));
});
await test(async f => {
  const delayed = defer(); f.state.summaryRead = () => delayed.promise;
  const request = f.start(); await tick(); f.changeAccount('B'); f.changeAccount('A');
  delayed.resolve({ data: summary(), error: null }); await request.done;
  assert.ok(!f.events.some(event => event[0] === 'summary'));
  assert.equal(f.queryClient.getQueryData(f.queries.stackrQueryKeys.collectionSummary('A')), undefined);
});
await test(async f => {
  const delayed = defer(); f.state.summaryRead = () => delayed.promise;
  const request = f.start(); await tick(); f.invalidation.bumpCollectionSummaryVersion();
  delayed.resolve({ data: summary(), error: null }); await request.done;
  assert.ok(!f.events.some(event => event[0] === 'summary'));
  assert.equal(f.queryClient.getQueryData(f.queries.stackrQueryKeys.collectionSummary('A')), undefined);
});
for (const mutation of ['account', 'collection']) await test(async f => {
  const delayed = defer(); f.state.sessionRead = () => delayed.promise;
  const request = f.start(); await tick();
  if (mutation === 'account') f.changeAccount('B'); else f.invalidation.bumpCollectionSummaryVersion();
  delayed.resolve({ data: { session: { user: { id: 'A' }, access_token: 'A' } }, error: null });
  await request.done; assert.equal(f.state.rpc, 0); assert.equal(f.state.binders, 0);
});
await test(async f => {
  f.state.summaryRead = async () => ({ data: null, error: { code: 'PGRST202', message: 'collection_summary_v1 missing' } });
  await f.start().done;
  assert.ok(f.events.some(event => event[0] === 'error' && event[1] === 'summary'));
  assert.ok(f.events.some(event => event[0] === 'binders'));
  assert.equal(f.state.binders, 1, 'No legacy collection scan fallback');
});
for (const rows of [[binder('B')], Array.from({ length: 7 }, (_, index) => binder('A', String(index)))]) await test(async f => {
  f.state.binderRead = async () => ({ data: rows, error: null });
  await f.start().done;
  assert.ok(!f.events.some(event => event[0] === 'binders'));
  assert.ok(f.events.some(event => event[0] === 'error' && event[1] === 'binders'));
});
await test(async f => {
  await f.start().done;
  assert.equal(f.queryClient.getQueryData(f.queries.stackrQueryKeys.binderLibrary('A')), undefined, 'Preview never poisons complete overview');
  assert.ok(f.state.calls.some(call => call[0] === 'limit' && call[1] === 6));
  assert.ok(f.state.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'A'));
});
await test(async f => {
  f.state.diskRead = never; f.state.summaryRead = never; f.state.binderRead = never;
  await f.start().done;
  assert.equal(f.events.filter(event => event[0] === 'error').length, 2);
  assert.equal(f.events.at(-1)[0], 'done', 'Hung dependencies settle into retry state');
});
console.log('PASS ' + scenarios + ' core Home account/cache/dedup/independent-read scenarios; actual modules, simulated transport');

const binderSource = fs.readFileSync('app/(tabs)/binder.tsx', 'utf8');
const detailSource = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
function initializer(source, name, callback = true) {
  const tree = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = callback ? node.initializer.arguments[0] : node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(found, name + ' exists in actual screen');
  return found.getText(tree);
}
function evaluate(source, globals) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule('export const actual = ' + source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, { module, exports: module.exports, ...globals });
  return module.exports.actual;
}
await test(async f => {
  let artReads = 0;
  const rows = [binder()];
  const read = evaluate(initializer(binderSource, 'fetchBinderOverviewSnapshot'), {
    fetchBinders: async options => { assert.equal(options.enrich, false); return rows; },
    activeAccountId: 'A', stackrQueryClient: f.queryClient, stackrQueryKeys: f.queries.stackrQueryKeys,
    isBinderLibraryOverviewForUser: f.library.isBinderLibraryOverviewForUser,
    getCustomBinderNameArtKeyForBinder: () => { artReads++; return never(); },
  });
  const result = await read();
  assert.equal(result.binders, rows); assert.equal(artReads, 0, 'Optional cover storage never gates rows');
});
await test(async f => {
  let facts = 0, prices = 0, counts;
  const read = evaluate(initializer(binderSource, 'loadBinderSummaries'), {
    CORE_COLLECTION_MODE: true, summaryRequestRef: { current: 0 },
    getBinderLibrarySignature: () => 'one', stackrQueryKeys: f.queries.stackrQueryKeys, stackrQueryClient: f.queryClient,
    stackrQueryTiming: f.queries.stackrQueryTiming,
    withPersonalDataReadTimeout: read => read(new AbortController().signal),
    fetchBinderFactsSnapshot: async () => { facts++; return { counts: { one: 2 }, masterSets: {} }; },
    fetchBinderValues: () => { prices++; throw new Error('Disabled price read'); },
    setCounts: value => { counts = value; }, setMasterSets() {}, setValues() {}, setLibraryError() {},
  });
  await read([binder()], 'A');
  assert.equal(facts, 1); assert.equal(prices, 0); assert.equal(counts.one, 2, 'Owned counts remain available with pricing off');
});
for (const name of ['fetchModalEbayPrice', 'loadShowcase', 'loadModalTcgFallback']) {
  // No stubs for providers, state setters or Supabase: touching any of them
  // fails. The actual callbacks must return before all optional dependencies.
  const read = evaluate(initializer(detailSource, name, name !== 'loadModalTcgFallback'), { CORE_COLLECTION_MODE: true });
  await read({}); scenarios++;
}
{
  const tree = ts.createSourceFile('detail.tsx', detailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
      const callback = node.arguments[0];
      if (callback.getText(tree).includes('stackrApiClient.collectionValuation()') || callback.getText(tree).includes('checkAchievements({')) effects.push(callback);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.equal(effects.length, 2);
  for (const effect of effects) evaluate(effect.getText(tree), { CORE_COLLECTION_MODE: true })();
  scenarios += 2;
}
{
  let removed = false;
  const actions = evaluate(initializer(detailSource, 'quickActionSheetActions', false), {
    CORE_COLLECTION_MODE: true, quickActionCard: {}, isReadOnly: false, binder: { type: 'custom' },
    showcaseMutationRef: { current: null }, openCardDetail() {},
    handleRemoveCustomBinderCard() { removed = true; },
  });
  assert.deepEqual(Array.from(actions, action => action.label), ['Details', 'Remove from binder']);
  actions[1].onPress(); assert.ok(removed, 'Disabling Chase preserves actual custom-binder removal');
  scenarios++;
}
{
  const source = fs.readFileSync('features/home/CoreHomeScreen.tsx', 'utf8');
  const account = initializer(source, 'accountId', false);
  for (const auth of [
    { loading: true, user: { id: 'A' } },
    { loading: false, error: 'unavailable', user: { id: 'A' } },
    { loading: false, user: null },
  ]) assert.equal(evaluate(account, { auth }), null, 'Unverified auth cannot start Home private reads');
  assert.equal(evaluate(account, { auth: { loading: false, user: { id: 'A' } } }), 'A');
  scenarios++;
}

{
  const normal = initializer(binderSource, 'activeAccountId', false);
  for (const auth of [{ loading: true }, { loading: false, error: 'verification failed' }]) {
    assert.equal(evaluate(normal, { savedReadOnly: false, savedSessionUserId: 'A', accountUser: { id: 'A' }, auth }), null);
  }
  assert.equal(evaluate(normal, { savedReadOnly: false, savedSessionUserId: null, accountUser: { id: 'A' }, auth: { loading: false, error: null } }), 'A');
  const saved = initializer(binderSource, 'savedSessionUserId', false);
  for (const expiresAt of [Math.floor(Date.now() / 1000) + 60, 0]) {
    const savedSessionUserId = evaluate(saved, { savedReadOnly: true, cachedReadSession: { userId: 'A', expiresAt } });
    assert.equal(evaluate(normal, { savedReadOnly: true, savedSessionUserId, accountUser: { id: 'B' }, auth: { loading: true } }), expiresAt ? 'A' : null,
      'Only the explicit unexpired saved session can open the separate read-only path');
  }
  scenarios++;
}
{
  const accountIdRef = { current: 'A' }; let confirmation, deletes = 0;
  const confirm = evaluate(initializer(binderSource, 'confirmDeleteBinder'), {
    activeAccountId: 'A', savedReadOnly: false, accountIdRef,
    Alert: { alert: (_title, _message, buttons) => { confirmation = buttons[1].onPress; } },
    deleteBinder: () => { deletes++; },
  });
  confirm(binder()); assert.equal(typeof confirmation, 'function');
  accountIdRef.current = null;
  await confirmation(); assert.equal(deletes, 0, 'An existing delete dialog cannot mutate after verification is lost');
  scenarios++;
}
{
  const readOnly = initializer(detailSource, 'isReadOnly', false);
  for (const state of [
    { routeReadOnly: true, reopenStatus: null, binder: binder(), isOwner: true, ownershipReady: true },
    { routeReadOnly: false, reopenStatus: { state: 'refreshing' }, binder: binder(), isOwner: true, ownershipReady: true },
    { routeReadOnly: false, reopenStatus: null, binder: binder(), isOwner: true, ownershipReady: false },
    { routeReadOnly: false, reopenStatus: null, binder: binder(), isOwner: false, ownershipReady: true },
  ]) assert.equal(evaluate(readOnly, state), true, 'Saved, unverified or foreign Binder Detail cannot enable edits');
  assert.equal(evaluate(readOnly, { routeReadOnly: false, reopenStatus: null, binder: binder(), isOwner: true, ownershipReady: true }), false);
  scenarios++;
}
// Execute the existing detail screen's exact server-auth / binder permission
// gate, from its Promise.all through the first saved-card read.
{
  const tree = ts.createSourceFile('detail.tsx', detailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let statements;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'load') {
      const block = node.initializer.arguments[0].body.statements.find(ts.isTryStatement).tryBlock.statements;
      const start = block.findIndex(statement => statement.getText(tree).includes('const [{ data: { user } }, binderData]'));
      const end = block.findIndex(statement => statement.getText(tree).startsWith('const binderCards ='));
      assert.ok(start >= 0 && end > start);
      statements = block.slice(start, end + 1).map(statement => statement.getText(tree)).join('\n');
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(statements);
  for (const outcome of ['success', 'denied', 'anonymous', 'different-account']) {
    const verification = defer(); let cardReads = 0;
    const noOp = () => {};
    const read = evaluate('async () => { ' + statements + '\nreturn binderCards; }', {
      binderId: 'binder-1', supabase: { auth: { getUser: () => verification.promise } },
      fetchBinderById: async () => ({ ...binder(), is_public: false }),
      fetchBinderCards: async () => { cardReads++; return []; },
      withPersonalDataReadTimeout: read => read(),
      measureAsync: (_name, read) => read(), isCurrentRequest: () => true,
      retrievalTrace: { phase: noOp, fail: noOp }, previewState: { snapshot: null }, previewAllowed: true,
      activeAccountIdRef: { current: outcome === 'different-account' ? 'B' : null },
      binderReopenCache: { invalidate: noOp }, setUserId: noOp, setBinder: noOp, setIsPublic: noOp,
      setCards: noOp, setSelectedCard: noOp, setReopenStatus: noOp, setCustomNameArtKey: noOp, setShowcaseRows: noOp,
    });
    const pending = read(); await tick(); assert.equal(cardReads, 0, 'Private saved-card reads wait for getUser');
    verification.resolve({ data: { user: outcome === 'anonymous' ? null : { id: 'A' } }, error: outcome === 'denied' ? new Error('Denied') : null });
    if (outcome === 'denied') await assert.rejects(pending); else await pending;
    assert.equal(cardReads, outcome === 'success' ? 1 : 0, 'Only the server-verified matching owner reaches private saved cards');
    scenarios++;
  }
}


{
  const source = fs.readFileSync('features/home/CoreHomeScreen.tsx', 'utf8');
  const open = initializer(source, 'openSavedBinders');
  const expiresAt = Math.floor(Date.now() / 1000) + 120;
  const savedBinderSessionKey = 'A:' + expiresAt + ':4';
  for (const outcome of ['ready', 'changed-user', 'changed-epoch', 'expired', 'unproven', 'verified']) {
    const current = { userId: outcome === 'changed-user' ? 'B' : 'A',
      expiresAt: outcome === 'expired' ? 1 : expiresAt, epoch: outcome === 'changed-epoch' ? 5 : 4 };
    const routes = [];
    const callback = evaluate(open, { auth: { loading: outcome !== 'verified', error: null },
      savedSessionRef: { current }, savedBinderSessionKey: outcome === 'unproven' ? null : savedBinderSessionKey,
      router: { push: route => routes.push(route) } });
    callback();
    assert.equal(routes.length, outcome === 'ready' ? 1 : 0);
    if (routes.length) assert.deepEqual(JSON.parse(JSON.stringify(routes[0])),
      { pathname: '/(tabs)/binder', params: { readOnly: 'true' } }, 'Offline entry never enables normal live access');
    scenarios++;
  }
  const tree = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let proof;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
      && node.arguments[0].getText(tree).includes('readPersistedBinderOverview')) proof = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(proof);
  for (const outcome of ['available', 'absent', 'foreign', 'changed-epoch', 'disposed']) await test(async f => {
    const disk = defer(); f.state.diskRead = () => disk.promise;
    const savedSessionRef = { current: { userId: 'A', expiresAt, epoch: 4 } }, keys = [];
    const effect = evaluate(proof, { auth: { loading: true, error: null }, savedSessionRef,
      setSavedBinderSessionKey: key => keys.push(key), readPersistedBinderOverview: f.library.readPersistedBinderOverview });
    const dispose = effect();
    assert.equal(typeof dispose, 'function', 'Optional proof returns without waiting for disk');
    assert.deepEqual(keys, [null]);
    if (outcome === 'changed-epoch') savedSessionRef.current = { ...savedSessionRef.current, epoch: 5 };
    if (outcome === 'disposed') dispose();
    const owner = outcome === 'foreign' ? 'B' : 'A';
    disk.resolve(outcome === 'absent' ? null : f.library.serializeBinderLibraryOverview(owner, { binders: [binder(owner)], customNameArtKeys: {} }));
    await tick();
    assert.equal(keys.at(-1), outcome === 'available' ? savedBinderSessionKey : null,
      'Only current, account/runtime-validated disk proof enables the entry');
    dispose();
  });
}

console.log('PASS ' + scenarios + ' Home and Binder core-mode scenarios; rows/counts retained, optional readers inactive');


