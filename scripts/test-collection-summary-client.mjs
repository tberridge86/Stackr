import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { createCollectionSummaryDatabase } from './test-fixtures/collection-summary-db.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };
const fixture = await createCollectionSummaryDatabase();
const { db, userA, userB, id, binder, owned, saved, card, add, clear } = fixture;
const reports = [];
const baselinePath = process.argv.find((arg) => arg.startsWith('--baseline-summary='))?.slice('--baseline-summary='.length);
const baselineSource = baselinePath ? readFileSync(baselinePath, 'utf8') : null;

function harness(tables, options = {}) {
  let account = userA, version = 0;
  const listeners = new Set(), storage = new Map(), requests = [], sqlMs = [];
  const controls = { sessionCalls: 0, sessionHold: null, holdSessionAt: null, sessionEntered: null, missingRpc: false, rpcError: null, transform: null, hold: null, storageHold: null, timeoutMs: 10_000, ...options };
  const session = () => account ? { user: { id: account } } : null;
  const storageApi = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    getAllKeys: async () => { if (controls.storageHold) await controls.storageHold.promise; return [...storage.keys()]; },
    multiGet: async (keys) => keys.map((key) => [key, storage.get(key) ?? null]),
  };
  const project = (row, columns) => columns === '*' ? row : Object.fromEntries(columns.split(',').map((key) => key.trim()).map((key) => [key, row[key] ?? null]));
  const supabase = {
    auth: {
      getSession: async () => {
        controls.sessionCalls += 1;
        const snapshot = session();
        if (controls.holdSessionAt === controls.sessionCalls) {
          controls.sessionEntered.release();
          await controls.sessionHold.promise;
        }
        return { data: { session: snapshot }, error: null };
      },
      getUser: async () => ({ data: { user: session()?.user ?? null }, error: null }),
      onAuthStateChange: (callback) => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; },
    },
    from(table) {
      let columns = '*', from = 0, to = 49, signal;
      const filters = [], orders = [];
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query; },
        range(start, end) { from = start; to = end; assert.ok(end - start < 50); return query; },
        abortSignal(value) { signal = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (signal?.aborted) throw new Error('aborted table read');
            let rows = [...tables[table]];
            if (table === 'binders') rows = rows.filter((row) => row.user_id === account || row.is_public);
            if (table === 'user_card_variants') rows = rows.filter((row) => row.user_id === account);
            if (table === 'binder_cards') rows = rows.filter((row) => tables.binders.some((b) => b.id === row.binder_id && (b.user_id === account || b.is_public)));
            rows = rows.filter((row) => filters.every((filter) => filter(row)));
            rows.sort((a, b) => {
              for (const [key, ascending] of orders) {
                if (a[key] === b[key]) continue;
                if (a[key] == null) return ascending ? 1 : -1;
                if (b[key] == null) return ascending ? -1 : 1;
                const result = a[key] < b[key] ? -1 : 1;
                return ascending ? result : -result;
              }
              return 0;
            });
            const data = rows.slice(from, to + 1).map((row) => project(row, columns));
            requests.push({ kind: 'table', table, rows: data.length, bytes: Buffer.byteLength(JSON.stringify(data)) });
            return { data, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(name, args) {
      assert.equal(name, 'collection_summary_v1');
      assert.deepEqual(Object.keys(args), ['p_master_binder_ids'], 'the owner is never supplied by the client');
      let signal;
      const query = {
        abortSignal(value) { signal = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            requests.push({ kind: 'rpc', bytes: 0 });
            const request = requests.at(-1);
            if (controls.hold) await controls.hold.promise;
            // Deliberately allow this fixture transport to ignore abort: the real client must still settle and reject.
            if (controls.missingRpc) return { data: null, error: { code: 'PGRST202', message: 'Could not find public.collection_summary_v1 in schema cache' } };
            if (controls.rpcError) return { data: null, error: controls.rpcError };
            await fixture.asUser(account ?? '');
            const started = performance.now();
            const result = await db.query('select public.collection_summary_v1($1::uuid[]) result', [args.p_master_binder_ids]);
            sqlMs.push(performance.now() - started);
            let data = result.rows[0].result;
            if (controls.transform) data = controls.transform(data);
            request.bytes = Buffer.byteLength(JSON.stringify(data));
            request.aborted = signal?.aborted ?? false;
            return { data, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const modules = new Map();
  const dependency = (name) => {
    if (name === '@react-native-async-storage/async-storage') return { default: storageApi };
    if (name === './supabase') return { supabase };
    if (name === './collectionSummaryInvalidation') return {
      getCollectionSummaryVersion: () => version, bumpCollectionSummaryVersion: () => { version += 1; },
    };
    if (name === './config') return { USD_TO_GBP: 0.79 };
    if (name === './pricing') return load('pricing');
    if (name === './requestCache') return { getCachedOrFetch: (_key, _ttl, read) => read(), invalidateRequestCache() {} };
    if (name === './personalDataRead') {
      const actual = load('personalDataRead');
      return { ...actual, withPersonalDataReadTimeout: (read, config = {}) => actual.withPersonalDataReadTimeout(read, { ...config, timeoutMs: controls.timeoutMs }) };
    }
    if (['./collectionSummaryRead', './collectionSummaryValue', './ownership', './binders'].includes(name)) return load(name.slice(2));
    return {};
  };
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const exports = {};
    modules.set(name, exports);
    let source = name === 'collectionSummary' && controls.baseline ? baselineSource : readFileSync(new URL('../lib/' + name + '.ts', import.meta.url), 'utf8');
    if (name === 'pricing') {
      const ast = ts.createSourceFile('pricing.ts', source, ts.ScriptTarget.Latest, true);
      source = ast.statements.find((statement) => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some((declaration) => declaration.name.getText(ast) === 'getPriceFromPokemonCard')).getText(ast);
    }
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(compiled, { exports, require: dependency, console, setTimeout, clearTimeout, AbortController });
    return exports;
  }
  const summary = load('collectionSummary');
  return {
    summary, controls, storage, requests, sqlMs, read: (options) => summary.getCollectionSummary(options),
    setAccount(next) { account = next; for (const callback of listeners) callback(next ? 'SIGNED_IN' : 'SIGNED_OUT', session()); },
    listenerCount: () => listeners.size,
  };
}

const blankTables = () => ({ binders: [], binder_cards: [], user_card_variants: [], pokemon_cards: [], pokemon_sets: [] });
async function seed(tables) {
  await clear();
  for (const table of Object.keys(tables)) await add(table, tables[table]);
}
const comparable = (value) => {
  const { updatedAt: _updatedAt, ...body } = value;
  return JSON.parse(JSON.stringify(body));
};
async function compareCohort(name, tables, expected, configure = () => {}) {
  await seed(tables);
  const before = harness(tables, { missingRpc: true }); configure(before);
  const paged = await before.read();
  let original = null, originalHarness = null;
  if (baselineSource) {
    originalHarness = harness(tables, { baseline: true }); configure(originalHarness);
    original = await originalHarness.read();
  }
  const after = harness(tables); configure(after);
  const compact = await after.read();
  assert.deepEqual(comparable(compact), comparable(paged), name + ': actual client and SQL preserve the same complete counts/coverage');
  if (original) {
    for (const key of ['totalOwnedItems', 'totalCardsOwned', 'uniqueCards', 'rawCardsOwned', 'gradedSlabsOwned', 'sealedProductsOwned', 'duplicateCopies', 'binderCount', 'completedSets'])
      assert.equal(compact[key], original[key], name + ': original count parity ' + key);
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(compact[key], value, name + ': ' + key);
  assert.equal(after.requests.length, 1, 'compact summary has one Data API request and no table/artwork/price reads');
  assert.equal(after.requests[0].kind, 'rpc');
  assert.ok(after.requests[0].bytes < 2048, 'the scalar response stays compact for large holdings');
  await after.read();
  assert.equal(after.requests.length, 1, 'warm memory repeat adds no Data API request');
  for (let i = 0; i < 5; i += 1) await after.read({ forceRefresh: true });
  const warm = after.sqlMs.slice(1).sort((a, b) => a - b);
  reports.push({
    cohort: name,
    ...(original ? { originalRequests: originalHarness.requests.length, originalPayloadBytes: originalHarness.requests.reduce((n, row) => n + row.bytes, 0),
      originalSavedReads: originalHarness.requests.filter((row) => row.table === 'binder_cards').length,
      originalCollectionValue: original.collectionValue, correctedStoredRawEstimate: compact.collectionValue } : {}),
    pagedCompatibilityRequests: before.requests.length,
    missingRpcProbes: before.requests.filter((r) => r.kind === 'rpc').length,
    pagedSavedReads: before.requests.filter((r) => r.table === 'binder_cards').length,
    pagedTablePayloadBytes: before.requests.reduce((total, row) => total + row.bytes, 0),
    compactRequests: 1, compactPayloadBytes: after.requests[0].bytes,
    seededDatabaseFirstQueryMs: +after.sqlMs[0].toFixed(2),
    warmMedianMs: +warm[Math.floor(warm.length * 0.5)].toFixed(2),
    warmMaxMs: +warm.at(-1).toFixed(2), warmSampleCount: warm.length,
    originalDatabaseExecutionMs: 'unmeasured',
  });
  assert.equal(after.listenerCount(), 0, 'finished reads unsubscribe auth listeners');
  return { before, after, compact };
}

try {
  const small = blankTables();
  small.binders = [binder(1), binder(2, { edition: '1st_edition' })];
  small.user_card_variants = [owned(10, '38', { quantity: 2 }), owned(11, '38', { grade_company: 'PSA', grade: '9' })];
  small.binder_cards = [saved(20, id(1), '38', { owned_quantity: 8 }), saved(21, id(2), '39', { owned_quantity: 3 }), saved(22, id(1), 'page-card')];
  small.pokemon_cards = [card('38'), card('39', { '1stEditionNormal': { market: 20 }, normal: { market: 1 } }), card('page-card', { normal: { market: 2 } })];
  small.pokemon_sets = [{ id: 'base3', printed_total: 3, total: 3 }];
  await compareCohort('small raw/graded/first edition', small, { totalOwnedItems: 7, collectionValue: 64.78, completedSets: 1 });

  const duplicate = structuredClone(small);
  duplicate.binders[1].card_mode = 'graded';
  duplicate.binder_cards = [duplicate.binder_cards[0], duplicate.binder_cards[1],
    ...Array.from({ length: 1001 }, (_, i) => saved(100 + i, id(1), 'page-card', { slot_order: i + 2 }))];
  const duplicateResult = await compareCohort('1003 saved placements', duplicate, { totalOwnedItems: 7, collectionValue: 17.38, completedSets: 1 });
  assert.equal(duplicateResult.before.requests.filter((r) => r.table === 'binder_cards').length, 22, 'the original measured saved-page population stays intact');

  const distinct = blankTables();
  distinct.binders = [binder(1)];
  distinct.user_card_variants = Array.from({ length: 1003 }, (_, i) => owned(2000 + i, 'card-' + i));
  distinct.pokemon_cards = distinct.user_card_variants.map((row) => card(row.card_id));
  distinct.pokemon_sets = [{ id: 'base3', printed_total: 1003, total: 1003 }];
  await compareCohort('1003 distinct raw holdings', distinct, { totalOwnedItems: 1003, uniqueCards: 1003, collectionValue: 7923.7, completedSets: 1 });

  const multilingual = blankTables();
  multilingual.binders = [binder(1, { type: 'custom', source_set_id: null })];
  for (const [n, language] of ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'].entries()) {
    const key = language + ':001', setId = language + ':set';
    multilingual.user_card_variants.push(owned(4000 + n, key, { set_id: setId }));
    multilingual.pokemon_cards.push(card(key, { normal: { market: 10 + n } }, { set_id: setId, language }));
  }
  multilingual.user_card_variants.push(owned(4010, 'en:001', { set_id: 'ja:set' }));
  const multi = await compareCohort('five languages plus wrong set', multilingual, { totalOwnedItems: 6, uniqueCards: 6, collectionValue: 47.4 });
  assert.equal(multi.compact.valuation.missingPriceUnits, 1);

  const master = blankTables();
  master.binders = [binder(1, { source_set_id: 'en:master', master_set_enabled: true })];
  master.user_card_variants = [owned(5000, 'en:a', { set_id: 'en:master', variant: '' }),
    owned(5001, 'en:a', { set_id: 'en:master', variant: 'holofoil' })];
  master.pokemon_cards = [card('en:a', { normal: { market: 1 }, holofoil: { market: 2 } }, { set_id: 'en:master' })];
  master.pokemon_sets = [{ id: 'en:master', printed_total: 1, total: 1 }];
  await compareCohort('legacy empty variant master', master, { totalOwnedItems: 2, collectionValue: 2.37, completedSets: 1 });

  await seed(small);
  const guarded = harness(small);
  const first = await guarded.read();
  guarded.controls.rpcError = { code: '42501', message: 'permission denied' };
  const countBeforeError = guarded.requests.length;
  await assert.rejects(guarded.read({ forceRefresh: true }), (error) => error.cause?.code === '42501');
  assert.equal(guarded.requests.length, countBeforeError + 1, 'authorization errors do not trigger table-scan fallback');
  assert.equal((await guarded.read()).collectionValue, first.collectionValue, 'failure retains the previous good summary');
  guarded.controls.rpcError = null;
  guarded.controls.transform = (value) => ({ ...value, valuation: { ...value.valuation, pricedUnits: 999 } });
  await assert.rejects(guarded.read({ forceRefresh: true }), /did not reconcile/);
  guarded.controls.transform = (value) => ({ ...value, subjectUserId: userB });
  await assert.rejects(guarded.read({ forceRefresh: true }), /did not reconcile/);
  guarded.controls.transform = null;

  guarded.controls.hold = deferred();
  const switching = guarded.read({ forceRefresh: true });
  const joined = guarded.read({ forceRefresh: true });
  while (guarded.requests.length < countBeforeError + 4) await tick();
  guarded.setAccount(userB); guarded.setAccount(userA);
  await assert.rejects(switching, /cancelled|account/);
  await assert.rejects(joined, /cancelled|account/);
  guarded.controls.hold.release(); await tick(); await tick(); guarded.controls.hold = null;
  assert.equal(guarded.listenerCount(), 0, 'A-to-B-to-A abort cleans listeners');
  assert.equal((await guarded.read()).collectionValue, first.collectionValue);

  guarded.controls.hold = deferred();
  const invalidated = guarded.read({ forceRefresh: true });
  await tick();
  guarded.summary.invalidateCollectionSummary();
  guarded.controls.hold.release();
  await assert.rejects(invalidated, /changed account or version/);
  guarded.controls.hold = null;
  assert.equal((await guarded.read()).totalOwnedItems, 7);

  const timeout = harness(small, { timeoutMs: 40, storageHold: deferred() });
  await assert.rejects(timeout.read(), /longer than expected/);
  timeout.controls.storageHold.release(); await tick(); await tick();
  assert.equal(timeout.requests.length, 0, 'late optional storage cannot dispatch a cancelled RPC');
  assert.equal(timeout.listenerCount(), 0);

  for (const scenario of ['invalidation', 'account-switch']) {
    const finalIdentity = harness(small, { holdSessionAt: 4, sessionHold: deferred(), sessionEntered: deferred() });
    const pending = finalIdentity.read();
    await finalIdentity.controls.sessionEntered.promise;
    if (scenario === 'invalidation') finalIdentity.summary.invalidateCollectionSummary();
    else { finalIdentity.setAccount(userB); finalIdentity.setAccount(userA); }
    const rejected = assert.rejects(pending, /changed account or version|cancelled/);
    finalIdentity.controls.sessionHold.release();
    await rejected;
    await tick();
    assert.equal(finalIdentity.listenerCount(), 0);
    const requestCount = finalIdentity.requests.length;
    assert.equal((await finalIdentity.read()).totalOwnedItems, 7);
    assert.equal(finalIdentity.requests.length, requestCount + 1, 'final-session race cannot populate a fresh memory cache');
  }
  const persistedIdentity = harness(small, { holdSessionAt: 2, sessionHold: deferred(), sessionEntered: deferred() });
  persistedIdentity.storage.set('stackr:collection-summary:v3:' + userA, JSON.stringify({ cachedAt: Date.now(), value: first }));
  const persistedPending = persistedIdentity.read({ staleWhileRefresh: true });
  await persistedIdentity.controls.sessionEntered.promise;
  persistedIdentity.summary.invalidateCollectionSummary();
  persistedIdentity.controls.sessionHold.release();
  await assert.rejects(persistedPending, /changed account or version/);
  assert.equal(persistedIdentity.requests.length, 0, 'invalidated identity cannot serve persisted data or dispatch background work');

  const corruptCache = harness(small);
  corruptCache.storage.set('stackr:collection-summary:v3:' + userA,
    JSON.stringify({ cachedAt: Date.now(), value: { ...first, subjectUserId: userB } }));
  assert.equal((await corruptCache.read({ staleWhileRefresh: true })).subjectUserId, userA, 'foreign persisted subjects are rejected');
  corruptCache.setAccount(null);
  assert.equal((await corruptCache.read()).totalOwnedItems, 0);
  assert.equal(corruptCache.listenerCount(), 0);

  console.log(JSON.stringify({ scope: 'In-process PostgreSQL WASM and actual client modules; no network/device latency measurement', cohorts: reports }, null, 2));
  console.log('Collection summary client: compact/paged parity, bounded payload, memory cache, exact coverage, errors, account generation, invalidation and deadline checks passed.');
} finally {
  await db.close();
}
