import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createBinderReopenCache, snapshotBinderView, isCompleteBinderSnapshot, BINDER_REOPEN_MAX_AGE_MS } from '../lib/binderReopenSnapshot.ts';
import { beginBinderRetrieval, getBinderRetrievalObservations } from '../lib/performance.ts';
import * as requestCache from '../lib/requestCache.ts';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { namespace: 'https://fixture.invalid/api', accountId: uuid(9001) };
const binder = { id: uuid(9002), user_id: scope.accountId, type: 'official', name: 'Fixture', color: 'purple', is_public: false,
  source_set_id: 'sv08', catalogue_set_id: uuid(9003), catalogue_identity_status: 'resolved', language: 'en', catalogue_set_total: 124, created_at: '2026-01-01' };
function cards(count = 124) {
  return Array.from({ length: count }, (_, i) => ({ id: `saved-${i}`, binder_id: binder.id, set_id: 'sv08', card_id: uuid(i + 1),
    catalogue_match_status: 'catalogue', catalogue_incomplete: false, language: 'en', owned: i === 0, owned_quantity: i === 0 ? 4 : 1,
    condition: 'Near Mint', notes: 'saved note', slot_order: i, grade: null, image_url: null,
    card: { id: uuid(i + 1), name: `Card ${i + 1}`, number: String(i + 1), language: 'en', set: { id: binder.catalogue_set_id, name: 'Fixture' }, images: {},
      raw_data: { stackr: { canonical: true, cardId: uuid(i + 1), defaultVariantId: uuid(1000 + i), variants: [{ variantId: uuid(1000 + i), canonicalId: `fixture:${i}`, variantCode: 'normal', image: null }] } } },
  }));
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);
const copy = (v) => JSON.parse(JSON.stringify(v));
let count = 0;
async function test(name, work) { await work(); count++; console.log(`PASS ${name}`); }
function storeHarness() {
  const stored = new Map(); let writes = 0;
  const id = (s, b) => JSON.stringify([s.namespace, s.accountId, b]);
  return { stored, get writes() { return writes; }, async read(s, b) { return copy(stored.get(id(s, b)) ?? null); },
    async write(s) { writes++; stored.set(id(s, s.binder.id), copy(s)); }, async clear() { stored.clear(); } };
}

await test('complete snapshots reopen from memory and persisted storage without any network loader', async () => {
  const store = storeHarness(); const cache = createBinderReopenCache({ store: async () => store, now: () => 1000 });
  assert(cache.save(scope, binder, cards(), cache.lease())); await cache.flush();
  const first = await cache.read(scope, binder.id); assert.equal(first.cards.length, 124); assert.equal(first.cards[0].owned_quantity, 4);
  first.cards[0].notes = 'changed'; assert.equal((await cache.read(scope, binder.id)).cards[0].notes, 'saved note');
  const reopened = createBinderReopenCache({ store: async () => store, now: () => 2000 });
  assert.equal((await reopened.read(scope, binder.id)).savedAt, 1000); assert.equal(store.writes, 1);
});
await test('expired network TTL does not erase a last-complete snapshot; hard retention limit still applies', async () => {
  const store = storeHarness(); let now = 1000;
  const cache = createBinderReopenCache({ store: async () => store, now: () => now }); cache.save(scope, binder, cards(), cache.lease()); await cache.flush();
  now += 6 * 60 * 1000; assert.equal((await cache.read(scope, binder.id)).cards.length, 124);
  now = 1000 + BINDER_REOPEN_MAX_AGE_MS; assert.equal(await cache.read(scope, binder.id), null);
});
await test('partial, corrupt, wrong-owner, wrong-language and wrong-set refreshes never replace complete data', async () => {
  const store = storeHarness(); const cache = createBinderReopenCache({ store: async () => store, now: () => 1000 });
  cache.save(scope, binder, cards(), cache.lease()); await cache.flush();
  for (const edit of [r => r.pop(), r => r[0].catalogue_incomplete = true, r => r[0].language = 'ja', r => r[0].card.set.id = uuid(5555), r => r[1].card.id = r[0].card.id, r => r[0].card.raw_data.stackr.defaultVariantId = uuid(99999)]) {
    const rows = cards(); edit(rows); assert.equal(cache.save(scope, binder, rows, cache.lease()), false);
  }
  assert.equal(cache.save(scope, { ...binder, user_id: 'other' }, cards(), cache.lease()), false);
  assert.equal(cache.save(scope, binder, cards(), cache.lease(), 2000), false);
  assert.equal((await cache.read(scope, binder.id)).cards.length, 124); assert.equal(store.writes, 1);
});
await test('account, environment, binder and schema isolation is enforced on disk and memory', async () => {
  const store = storeHarness(); const cache = createBinderReopenCache({ store: async () => store, now: () => 1000 }); cache.save(scope, binder, cards(), cache.lease()); await cache.flush();
  assert.equal(await cache.read({ ...scope, accountId: 'other' }, binder.id), null);
  assert.equal(await cache.read({ ...scope, namespace: 'https://staging.invalid' }, binder.id), null);
  assert.equal(await cache.read(scope, 'other-binder'), null);
  const snapshot = snapshotBinderView(scope, binder, cards(), 1000); snapshot.schema = 99;
  assert.equal(isCompleteBinderSnapshot(snapshot, scope, binder.id, 1000), false);
});
await test('saved snapshot excludes credentials, arbitrary raw data, prices and controlled provider references', async () => {
  const rows = cards(); rows[0].token = 'secret'; rows[0].card.raw_data.token = 'secret'; rows[0].card.tcgplayer = { prices: { market: 99 } };
  rows[0].image_url = 'https://assets.tcgdex.net/ja/swsh/s12a/1/low.webp';
  rows[0].card.raw_data.stackr.variants[0].image = { token: 'secret' };
  const snapshot = snapshotBinderView(scope, { ...binder, access_token: 'secret' }, rows, 1000);
  const text = JSON.stringify(snapshot); assert(!text.includes('secret')); assert(!text.includes('tcgdex.net')); assert(!text.includes('tcgplayer'));
  assert.equal(snapshot.cards[0].notes, 'saved note'); assert.equal(snapshot.cards[0].tcg_price, null);
});
await test('sign-out/invalidation prevents pending reads and old writers from restoring private data', async () => {
  const delayed = deferred(); const store = storeHarness(); const cache = createBinderReopenCache({ store: async () => store, now: () => 1000 });
  const lease = cache.lease(); cache.save(scope, binder, cards(), lease); await cache.flush();
  const slow = createBinderReopenCache({ store: async () => ({ ...store, read: () => delayed.promise }), now: () => 1000 });
  const read = slow.read(scope, binder.id); await tick(); slow.invalidate(); delayed.resolve(snapshotBinderView(scope, binder, cards(), 1000));
  assert.equal(await read, null); assert.equal(slow.save(scope, binder, cards(), lease), false);
  cache.invalidate(); assert.equal(cache.save(scope, binder, cards(), lease), false); await cache.flush(); assert.equal(await cache.read(scope, binder.id), null);
});
await test('a late disk read cannot overwrite a newer in-memory snapshot', async () => {
  const delayed = deferred(); const cache = createBinderReopenCache({ store: async () => ({ read: () => delayed.promise, write: async () => {}, clear: async () => {} }), now: () => 2000 });
  const pending = cache.read(scope, binder.id); await tick(); const rows = cards(); rows[0].owned_quantity = 9;
  cache.save(scope, binder, rows, cache.lease(), 2000); delayed.resolve(snapshotBinderView(scope, binder, cards(), 1000));
  assert.equal((await pending).cards[0].owned_quantity, 9);
});
await test('request-cache invalidation notifies subscribers without allowing them to break normal invalidation', async () => {
  let calls = 0; const off = requestCache.subscribeRequestCacheInvalidation(prefix => { assert.equal(prefix, 'binder:fixture'); calls++; });
  const broken = requestCache.subscribeRequestCacheInvalidation(() => { throw new Error('optional cache'); });
  requestCache.invalidateRequestCache('binder:fixture'); assert.equal(calls, 1); off(); broken();
});
await test('visible content and edit readiness are different measurements; stale rows and cancellations do not finish them', async () => {
  let now = 0; const trace = beginBinderRetrieval(() => now); const rows = cards(); now = 20; trace.model(rows, 'local-preview');
  assert.equal(getBinderRetrievalObservations().at(-1).visibleContentMs, null);
  now = 70; trace.visible([copy(rows[0])]); assert.equal(getBinderRetrievalObservations().at(-1).visibleContentMs, null);
  trace.visible([rows[0]]); assert.equal(getBinderRetrievalObservations().at(-1).visibleContentMs, 70);
  now = 400; trace.editable(); assert.equal(getBinderRetrievalObservations().at(-1).ownershipEditableMs, 400);
  const stopped = beginBinderRetrieval(() => now); stopped.model(rows, 'network'); stopped.cancel(); now = 600; stopped.visible(rows); stopped.editable();
  assert.equal(getBinderRetrievalObservations().at(-1).visibleContentMs, null); assert.equal(getBinderRetrievalObservations().at(-1).ownershipEditableMs, null);
});

// Execute actual screen load callback, with native viewability itself deliberately not simulated as a paint claim.
const source = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let callback;
function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'load' && ts.isCallExpression(n.initializer)) callback = n.initializer.arguments[0].getText(ast); ts.forEachChild(n, visit); }
visit(ast); assert(callback);
const code = ts.transpileModule(`export const load = ${callback};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function screenHarness() {
  const auth = deferred(), record = deferred(), network = deferred(), disk = deferred();
  const state = { binder: null, cards: [], loading: null, ownershipReady: false, status: null }; let saves = 0, invalidations = 0;
  const never = () => new Promise(() => {});
  const runtime = { exports: {}, console, AbortController, binderId: binder.id, Date,
    accountGenerationRef: { current: 0 }, loadRequestRef: { current: 0 }, artworkRequestRef: { current: null }, activeAccountIdRef: { current: scope.accountId }, retrievalTraceRef: { current: null },
    beginBinderRetrieval, isCompleteBinderSnapshot, binderReopenScope: () => scope, readBinderReopenPreview: () => disk.promise,
    binderReopenCache: { lease: () => 0, save: () => { saves++; }, invalidate: () => { invalidations++; } },
    retainBinderPreviewDuringRefresh: work => work(), invalidateBinderCaches: () => {}, invalidatePokemonCatalogueCardCaches: () => {},
    isBinderAccessDenied: error => error?.status === 403 || error?.status === 401,
    isCurrentAccountRequest: (a, b) => a.accountGeneration === b.accountGeneration && a.requestId === b.requestId,
    measureAsync: (_name, work) => work(), fetchBinderById: () => record.promise, fetchBinderCards: () => network.promise,
    supabase: { auth: { getUser: () => auth.promise }, from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: () => never() }; return q; } },
    attachBinderCatalogueArtwork: never, attachBinderSetArtwork: never, attachLatestSnapshotPrices: never, getVariantCardKey: (c, s) => `${s}:${c}`,
    setCards: v => { state.cards = typeof v === 'function' ? v(state.cards) : v; }, setLoading: v => state.loading = v,
    setBinder: v => state.binder = v, setOwnershipReady: v => state.ownershipReady = v, setReopenStatus: v => state.status = v,
    setUserId: () => {}, setIsPublic: () => {}, setCustomNameArtKey: () => {}, setSelectedCard: () => {},
    setShowcaseRows: () => {}, setOwnedVariants: () => {}, setVariantManagedCards: () => {}, Alert: { alert: () => {} },
  };
  vm.runInNewContext(code, runtime);
  return { auth, record, network, disk, state, runtime, load: runtime.exports.load, get saves() { return saves; }, get invalidations() { return invalidations; } };
}
const snapshot = () => snapshotBinderView(scope, binder, cards(), Date.now());
await test('actual screen renders a complete read-only saved view before auth or ownership network replies', async () => {
  const h = screenHarness(); h.load(); h.disk.resolve(snapshot()); await tick();
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.loading, false); assert.equal(h.state.ownershipReady, false); assert.equal(h.state.status.state, 'refreshing');
});
await test('actual screen retains saved view on refresh failure, but removes it on explicit access denial', async () => {
  for (const denied of [false, true]) {
    const h = screenHarness(); const pending = h.load(); h.disk.resolve(snapshot()); await tick();
    h.auth.reject(denied ? { status: 403 } : new Error('network unavailable')); await pending;
    assert.equal(h.state.cards.length, denied ? 0 : 124); assert.equal(h.state.ownershipReady, false);
    assert.equal(h.invalidations, denied ? 1 : 0); if (!denied) assert.equal(h.state.status.state, 'offline');
  }
});
await test('actual screen keeps last complete catalogue rather than replacing it with 117 cards', async () => {
  const h = screenHarness(); const pending = h.load(true); h.disk.resolve(snapshot()); await tick();
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick(); h.network.resolve(cards(117)); await pending;
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.status.state, 'incomplete'); assert.equal(h.saves, 0); assert.equal(h.state.ownershipReady, false);
});
await test('actual screen replaces saved data only after a complete refresh and never lets late disk results win', async () => {
  const h = screenHarness(); const pending = h.load(); h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  const updated = cards(); updated[0].owned_quantity = 7; h.network.resolve(updated); await pending; h.disk.resolve(snapshot()); await tick();
  assert.equal(h.state.cards[0].owned_quantity, 7); assert.equal(h.state.status, null); assert.equal(h.saves, 1); assert.equal(h.state.ownershipReady, false);
});
await test('actual screen rejects cached content after navigation or account change', async () => {
  const h = screenHarness(); h.load(); h.runtime.accountGenerationRef.current++; h.disk.resolve(snapshot()); await tick(); assert.equal(h.state.cards.length, 0);
});
await test('native viewability callback and committed ownership hook are wired separately', async () => {
  assert.match(source, /onViewableItemsChanged=\{onBinderViewableItemsChanged\}/);
  assert.match(source, /ownershipReady && !isReadOnly\) retrievalTraceRef\.current\?\.editable/);
  assert.match(source, /const isReadOnly = routeReadOnly \|\| reopenStatus !== null/);
});
console.log(`${count} reopen, failed-refresh, isolation and measurement tests passed. Not physical-device latency proof.`);
fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/binder-reopen-tests.json', JSON.stringify({ tests: count, passed: count, scope: 'Source and persisted-cache regression; no native-device latency measurement', observedAt: new Date().toISOString() }, null, 2));

await test('SQLite adapter survives a real file reopen, isolates owners, bounds retention and rolls back failed writes', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const runtimeSource = fs.readFileSync('lib/binderReopenRuntime.ts', 'utf8');
  const compiled = ts.transpileModule(runtimeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const dependencies = {
    './supabase': { supabase: { auth: { onAuthStateChange: () => {} } } },
    './mobileRuntimeConfig': { MOBILE_RUNTIME_CONFIG: { supabaseUrl: 'https://fixture.invalid' } },
    './stackrApiV1': { stackrApiClient: { catalogueCacheNamespace: scope.namespace } },
    './requestCache': { subscribeRequestCacheInvalidation: () => {} },
    './binderReopenSnapshot': { createBinderReopenCache },
  };
  vm.runInNewContext(compiled, { exports: module.exports, require: name => dependencies[name] ?? {}, console });
  const folder = mkdtempSync(join(tmpdir(), 'stackr-reopen-')); const path = join(folder, 'snapshot.sqlite');
  let db = new DatabaseSync(path); let failPrune = false;
  const adapter = () => ({
    async execAsync(sql) { db.exec(sql); }, async getFirstAsync(sql, params) { return db.prepare(sql).get(...params) ?? null; },
    async runAsync(sql, params = []) { return db.prepare(sql).run(...params); },
    async withExclusiveTransactionAsync(work) {
      db.exec('BEGIN IMMEDIATE');
      try { await work({ async runAsync(sql, params = []) { if (failPrune && sql.startsWith('DELETE')) throw new Error('disk write failure'); return db.prepare(sql).run(...params); } }); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  });
  try {
    let store = await module.exports.createBinderReopenSqliteStore(adapter());
    const saved = snapshot(); await store.write(saved); db.close(); db = new DatabaseSync(path);
    store = await module.exports.createBinderReopenSqliteStore(adapter());
    assert.equal((await store.read(scope, binder.id)).cards.length, 124);
    assert.equal(await store.read({ ...scope, accountId: 'other' }, binder.id), null);
    assert.equal(await store.read({ ...scope, namespace: 'staging' }, binder.id), null);
    failPrune = true; const changed = copy(saved); changed.cards[0].owned_quantity = 99;
    await assert.rejects(store.write(changed), /disk write failure/); failPrune = false;
    assert.equal((await store.read(scope, binder.id)).cards[0].owned_quantity, 4);
    for (let i = 0; i < 10; i++) { const value = copy(saved); value.binder.id = uuid(9900 + i); value.savedAt += i; await store.write(value); }
    assert.equal(db.prepare('SELECT count(*) AS n FROM binder_reopen_v1').get().n, 8);
    await store.clear(); assert.equal(db.prepare('SELECT count(*) AS n FROM binder_reopen_v1').get().n, 0);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
console.log(`${count} tests total, including file-backed SQLite reopen/rollback. Expo/iPhone execution is still unverified.`);
fs.writeFileSync('reports/binder-reopen-tests.json', JSON.stringify({ tests: count, passed: count, scope: 'Source, account isolation and file-backed Node SQLite; no physical-device timing', observedAt: new Date().toISOString() }, null, 2));
