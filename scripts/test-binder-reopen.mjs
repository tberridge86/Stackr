import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createBinderReopenCache, snapshotBinderView, isCompleteBinderSnapshot, BINDER_REOPEN_MAX_AGE_MS, BINDER_REOPEN_STORED_ENTRIES, BINDER_REOPEN_STORED_BYTES } from '../lib/binderReopenSnapshot.ts';
import { beginBinderRetrieval, getBinderRetrievalObservations } from '../lib/performance.ts';
import * as requestCache from '../lib/requestCache.ts';
import { mergeBinderArtwork } from '../lib/stackrSetRetrieval.ts';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { namespace: 'https://fixture.invalid/api', accountId: uuid(9001) };
const binder = { id: uuid(9002), user_id: scope.accountId, type: 'official', name: 'Fixture', color: 'purple', is_public: false,
  source_set_id: 'sv08', catalogue_set_id: uuid(9003), catalogue_identity_status: 'resolved', language: 'en', catalogue_set_total: 124, created_at: '2026-01-01' };
function cards(count = 124) {
  return Array.from({ length: count }, (_, i) => ({ id: `saved-${i}`, binder_id: binder.id, set_id: 'sv08', card_id: uuid(i + 1),
    catalogue_match_status: 'catalogue', catalogue_incomplete: false, language: 'en', owned: i === 0, owned_quantity: i === 0 ? 4 : 1,
    condition: 'Near Mint', notes: 'saved note', slot_order: i, grade: null, image_url: null,
    card: { id: uuid(i + 1), name: `Card ${i + 1}`, number: String(i + 1), language: 'en', set: { id: binder.catalogue_set_id, name: 'Fixture' }, images: {},
      raw_data: { stackr: { canonical: true, cardId: uuid(i + 1), catalogueVersionId: uuid(9004), defaultVariantId: uuid(1000 + i), variants: [{ variantId: uuid(1000 + i), canonicalId: `fixture:${i}`, variantCode: 'normal', image: null }] } } },
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
  const sources = [];
  const first = await cache.read(scope, binder.id, source => sources.push(source)); assert.equal(first.cards.length, 124); assert.equal(first.cards[0].owned_quantity, 4);
  assert.deepEqual(sources, ['memory']);
  assert.equal((await cache.read(scope, binder.id, () => { throw new Error('diagnostic'); })).cards.length, 124, 'diagnostics cannot fail a saved view');
  first.cards[0].notes = 'changed'; assert.equal((await cache.read(scope, binder.id)).cards[0].notes, 'saved note');
  const reopened = createBinderReopenCache({ store: async () => store, now: () => 2000 });
  assert.equal((await reopened.read(scope, binder.id, source => sources.push(source))).savedAt, 1000); assert.equal(store.writes, 1);
  assert.deepEqual(sources, ['memory', 'persisted']);
});
await test('expired network TTL does not erase a last-complete snapshot; hard retention limit still applies', async () => {
  const store = storeHarness(); let now = 1000;
  const cache = createBinderReopenCache({ store: async () => store, now: () => now }); cache.save(scope, binder, cards(), cache.lease()); await cache.flush();
  now += 6 * 60 * 1000; assert.equal((await cache.read(scope, binder.id)).cards.length, 124);
  now = 1000 + BINDER_REOPEN_MAX_AGE_MS; assert.equal(await cache.read(scope, binder.id), null);
});
await test('unversioned or mixed-version refreshes retain the complete saved owner view', async () => {
  const store = storeHarness();
  const cache = createBinderReopenCache({ store: async () => store, now: () => 1000 });
  assert(cache.save(scope, binder, cards(), cache.lease())); await cache.flush();
  for (const value of [null, undefined, '', 'invalid', uuid(5555)]) {
    const changed = cards(); changed[0].card.raw_data.stackr.catalogueVersionId = value;
    assert.equal(cache.save(scope, binder, changed, cache.lease()), false);
  }
  const saved = await cache.read(scope, binder.id);
  assert.equal(saved.cards.length, 124);
  assert.equal(saved.cards[0].owned_quantity, 4);
  assert.equal(saved.cards[0].card.raw_data.stackr.catalogueVersionId, uuid(9004));
  const corrupt = copy(saved); delete corrupt.cards[0].card.raw_data.stackr.catalogueVersionId;
  const cold = createBinderReopenCache({ store: async () => ({ ...store, read: async () => corrupt }), now: () => 1000 });
  assert.equal(await cold.read(scope, binder.id), null);
  await cache.flush(); assert.equal(store.writes, 1);
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
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let callback, authEffect, readOnlyCopy;
const actualCallbacks = new Map();
const callbackNames = ['loadShowcase', 'load', 'isShowcaseScopeCurrent', 'beginShowcaseMutation', 'finishShowcaseMutation', 'toggleShowcase', 'reorderShowcase', 'handleRemoveCustomBinderCard'];
function visit(n) {
  if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'load' && ts.isCallExpression(n.initializer)) callback = n.initializer.arguments[0].getText(ast);
  if (ts.isVariableDeclaration(n) && callbackNames.includes(n.name.getText(ast))) {
    actualCallbacks.set(n.name.getText(ast), (ts.isCallExpression(n.initializer) ? n.initializer.arguments[0] : n.initializer).getText(ast));
  }
  if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'readOnlyMessage') readOnlyCopy = n.initializer.getText(ast);
  if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.arguments[0]?.getText(ast).includes('supabase.auth.onAuthStateChange')) authEffect = n.arguments[0].getText(ast);
  ts.forEachChild(n, visit);
}
visit(ast); assert(callback);
const code = ts.transpileModule(`${callbackNames.map(name => `export const ${name} = ${actualCallbacks.get(name)};`).join('\n')}\nexport const authEffect = ${authEffect};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const deadlineCode = ts.transpileModule(fs.readFileSync('lib/personalDataRead.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function screenHarness(options = {}) {
  const auth = deferred(), record = deferred(), network = deferred(), disk = deferred();
  const state = { binder: null, cards: [], loading: null, error: null, ownershipReady: false, status: null, showcases: [], showcaseStatus: 'loading', userId: null, alerts: [] }; let saves = 0, invalidations = 0;
  const timers = new Map(); let timerId = 0;
  const deadline = { exports: {} };
  vm.runInNewContext(deadlineCode, { exports: deadline.exports, AbortController,
    setTimeout: action => { timers.set(++timerId, action); return timerId; }, clearTimeout: id => timers.delete(id) });
  const savedArgs = [];
  const never = () => new Promise(() => {});
  const runtime = { exports: {}, console, AbortController, binderId: binder.id, Date,
    visiblePriceReaderRef: { current: null }, visiblePriceIdsRef: { current: [] },
    createVisibleBinderPriceReader: () => ({ request: () => {}, dispose: () => {} }),
    mergeBinderArtwork,
    accountGenerationRef: { current: 0 }, loadRequestRef: { current: 0 }, artworkRequestRef: { current: null }, activeAccountIdRef: { current: scope.accountId }, retrievalTraceRef: { current: null },
    showcaseRowsRef: { current: [] }, showcaseReadyRef: { current: false }, showcaseReadRef: { current: 0 }, showcaseAbortRef: { current: null }, showcaseMutationRef: { current: null }, currentBinderIdRef: { current: binder.id },
    beginBinderRetrieval, isCompleteBinderSnapshot, binderReopenScope: () => scope, readBinderReopenPreview: () => disk.promise,
    withPersonalDataReadTimeout: deadline.exports.withPersonalDataReadTimeout,
    readOptionalCatalogueEnrichment: (work) => Promise.resolve().then(work),
    binderReopenCache: { lease: () => 0, save: (...args) => { saves++; savedArgs.push(args); }, invalidate: () => { invalidations++; } },
    retainBinderPreviewDuringRefresh: work => work(), invalidateBinderCaches: () => {}, invalidatePokemonCatalogueCardCaches: () => {},
    isBinderAccessDenied: error => error?.status === 403 || error?.status === 401,
    isCurrentAccountRequest: (a, b) => a.accountGeneration === b.accountGeneration && a.requestId === b.requestId,
    measureAsync: (_name, work) => work(), fetchBinderById: () => record.promise, fetchBinderCards: () => network.promise,
    supabase: { auth: { getUser: () => auth.promise }, from: table => {
      const request = { operation: 'select', payload: null, filters: [] };
      const q = { select: () => q, eq: (key, value) => { request.filters.push([key, value]); return q; }, in: () => q, order: () => q, abortSignal: () => q, single: () => q,
        insert: payload => { request.operation = 'insert'; request.payload = payload; return q; },
        delete: () => { request.operation = 'delete'; return q; }, update: payload => { request.operation = 'update'; request.payload = payload; return q; },
        then: (resolve, reject) => (options.read ? Promise.resolve().then(() => options.read(table, request)) : never()).then(resolve, reject) };
      return q;
    } },
    attachBinderCatalogueArtwork: never, attachBinderSetArtwork: never, attachLatestSnapshotPrices: never, getVariantCardKey: (c, s) => `${s}:${c}`,
    getCustomBinderNameArtKeyForBinder: async () => null,
    setCards: v => { state.cards = typeof v === 'function' ? v(state.cards) : v; }, setLoading: v => state.loading = v,
    setLoadError: v => state.error = v,
    setBinder: v => state.binder = v, setOwnershipReady: v => state.ownershipReady = v, setReopenStatus: v => state.status = v,
    setUserId: value => { state.userId = value; }, setIsPublic: () => {}, setCustomNameArtKey: () => {}, setSelectedCard: () => {}, setDetailVisible: () => {},
    setShowcaseRows: value => { state.showcases = typeof value === 'function' ? value(state.showcases) : value; },
    setShowcaseStatus: value => { state.showcaseStatus = typeof value === 'function' ? value(state.showcaseStatus) : value; },
    setOwnedVariants: () => {}, setVariantManagedCards: () => {}, Alert: { alert: (...args) => state.alerts.push(args) },
    selectedCard: null, getBinderCardDisplayName: () => 'Fixture', showToast: () => {},
  };
  Object.defineProperties(runtime, {
    binder: { get: () => state.binder }, cards: { get: () => state.cards }, showcaseRows: { get: () => state.showcases },
    isReadOnly: { get: () => state.status !== null || !state.ownershipReady || state.binder?.user_id !== state.userId },
  });
  const renderRoute = routeBinderId => {
    runtime.binderId = routeBinderId;
    runtime.currentBinderIdRef.current = routeBinderId;
    runtime.exports = {};
    // Each render has its own binderId closure; component refs/state remain shared.
    vm.runInNewContext(`(function(binderId) { ${code} })(binderId);`, runtime);
    return runtime.exports;
  };
  renderRoute(binder.id);
  return { auth, record, network, disk, state, runtime, savedArgs, renderRoute, load: runtime.exports.load,
    readShowcase: runtime.exports.loadShowcase, toggleShowcase: runtime.exports.toggleShowcase, removeCard: runtime.exports.handleRemoveCustomBinderCard,
    async deadline() { for (const [id, action] of [...timers]) { timers.delete(id); action(); } await tick(); },
    get saves() { return saves; }, get invalidations() { return invalidations; } };
}
const snapshot = () => snapshotBinderView(scope, binder, cards(), Date.now());
await test('saved-preview artwork recovers before live auth and never changes ownership or prices', async () => {
  const h = screenHarness(); let artworkCalls = 0;
  const art = deferred();
  h.runtime.attachBinderCatalogueArtwork = (rows, signal, onProgress) => {
    artworkCalls++;
    art.promise.then(onProgress);
    return art.promise;
  };
  h.load(); h.disk.resolve(snapshot()); await tick();
  assert.equal(artworkCalls, 1, 'a saved preview must start its independent image recovery');
  const recovered = cards(); recovered[0].card.images = { small: 'https://approved.invalid/card.webp' };
  recovered[0].owned_quantity = 99; recovered[0].tcg_price = 999;
  art.resolve(recovered); await tick();
  assert.equal(h.state.cards[0].card.images.small, 'https://approved.invalid/card.webp');
  assert.equal(h.state.cards[0].owned_quantity, 4);
  assert.notEqual(h.state.cards[0].tcg_price, 999);
  assert.equal(h.state.ownershipReady, false);
});
await test('late saved-preview artwork cannot restore an account-invalidated view', async () => {
  const h = screenHarness(); const art = deferred();
  h.runtime.attachBinderCatalogueArtwork = () => art.promise;
  h.load(); h.disk.resolve(snapshot()); await tick();
  h.runtime.accountGenerationRef.current++;
  const recovered = cards(); recovered[0].card.images = { small: 'https://approved.invalid/old-account.webp' };
  art.resolve(recovered); await tick();
  assert.equal(Boolean(h.state.cards[0].card.images.small), false);
});
await test('a queued saved-preview image update cannot overwrite a completed fresh model', async () => {
  const h = screenHarness(); const art = deferred(); const queued = [];
  const publish = h.runtime.setCards;
  h.runtime.setCards = (value) => typeof value === 'function' ? queued.push(value) : publish(value);
  let calls = 0;
  h.runtime.attachBinderCatalogueArtwork = () => ++calls === 1 ? art.promise : new Promise(() => {});
  const pending = h.load(); h.disk.resolve(snapshot()); await tick();
  const oldArt = cards(); oldArt[0].card.images = { small: 'https://approved.invalid/saved.webp' };
  art.resolve(oldArt); await tick();
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  const fresh = cards(); fresh[0].card.images = { small: 'https://approved.invalid/fresh.webp' };
  h.network.resolve(fresh); await pending;
  for (const update of queued) publish(update);
  assert.equal(h.state.cards[0].card.images.small, 'https://approved.invalid/fresh.webp');
});
await test('read-only copy distinguishes saved, pending, confirmed foreign and explicit own-binder views', async () => {
  assert(readOnlyCopy);
  const copyCode = ts.transpileModule(`export const message = ${readOnlyCopy};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const label = (state) => { const exports = {}; vm.runInNewContext(copyCode, { ...state, exports }); return exports.message; };
  const own = { userId: 'owner-a', binder: { user_id: 'owner-a' }, ownershipReady: true, reopenStatus: null };
  assert.match(label({ ...own, reopenStatus: { state: 'offline' } }), /Saved binder/);
  assert.match(label({ ...own, ownershipReady: false }), /Checking ownership/);
  assert.match(label({ ...own, binder: { user_id: 'owner-b' } }), /another collector/);
  assert.equal(label(own), 'Read-only binder');
  assert.equal(label({ ...own, userId: null }), 'Read-only binder');
});
await test('optional custom binder name artwork cannot hold usable card facts', async () => {
  const h = screenHarness(); const customArt = deferred();
  h.runtime.getCustomBinderNameArtKeyForBinder = () => customArt.promise;
  const pending = h.load(); h.disk.resolve(null);
  h.auth.resolve({ data: { user: { id: scope.accountId } } });
  h.record.resolve({ ...binder, type: 'custom', source_set_id: null }); await tick();
  h.network.resolve(cards(2)); await tick();
  const visibleBeforeCustomArt = h.state.cards.length;
  customArt.resolve('custom-art'); await pending;
  assert.equal(visibleBeforeCustomArt, 2, 'optional local artwork cannot block the card model');
});
function completeOwnershipRead(table) {
  return { data: table === 'binders' ? [{ id: binder.id }] : [], error: null };
}
async function openWithCompleteFacts(h, record = binder) {
  const pending = h.load(); h.disk.resolve(null);
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(record);
  h.network.resolve(cards()); await pending; await tick();
}
await test('optional showcase cannot delay successful essential ownership or disable it on failure', async () => {
  const showcase = deferred(); const reads = [];
  const h = screenHarness({ read: table => {
    reads.push(table);
    return table === 'binder_card_showcases' ? showcase.promise : completeOwnershipRead(table);
  } });
  await openWithCompleteFacts(h);
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.loading, false);
  assert(reads.includes('binder_cards'), 'essential collection ownership must dispatch without waiting for showcase');
  assert.equal(h.state.ownershipReady, true, 'successful ownership must enable editing while showcase is still pending');
  assert.equal(h.runtime.isReadOnly, false, 'ordinary card editing stays independent of Chase placement readiness');
  assert.equal(h.runtime.showcaseReadyRef.current, false);
  await h.toggleShowcase(cards()[0], 'chase');
  assert.equal(reads.filter(table => table === 'binder_card_showcases').length, 1, 'pending placement may read, but must not insert or delete');
  showcase.resolve({ data: null, error: { status: 503, message: 'optional showcase unavailable' } }); await tick();
  assert.equal(h.state.ownershipReady, true); assert.equal(h.state.alerts.length, 0);
  assert.equal(h.state.showcaseStatus, 'error');
});
await test('optional showcase deadline settles independently and rejects late ignored-cancellation data', async () => {
  const showcase = deferred();
  const h = screenHarness({ read: table => table === 'binder_card_showcases' ? showcase.promise : completeOwnershipRead(table) });
  await openWithCompleteFacts(h); await h.deadline();
  assert.equal(h.state.ownershipReady, true); assert.equal(h.state.alerts.length, 0);
  assert.equal(h.state.showcaseStatus, 'error');
  showcase.resolve({ data: [{ id: 'after-deadline' }], error: null }); await tick();
  assert.equal(h.state.showcases.length, 0, 'a response after the optional deadline cannot repaint the screen');
});
await test('late optional showcase cannot repaint a newer retry or invalidated account', async () => {
  const previous = deferred(), current = deferred(); let showcaseReads = 0;
  const h = screenHarness({ read: table => table === 'binder_card_showcases'
    ? (++showcaseReads === 1 ? previous.promise : current.promise) : completeOwnershipRead(table) });
  await openWithCompleteFacts(h);
  await h.load(true); await tick();
  current.resolve({ data: [{ id: 'current-retry' }], error: null }); await tick();
  previous.resolve({ data: [{ id: 'obsolete-retry' }], error: null }); await tick();
  assert.equal(h.state.showcases.length, 1); assert.equal(h.state.showcases[0].id, 'current-retry');
  assert.equal(h.state.ownershipReady, true);

  const accountShowcase = deferred();
  const account = screenHarness({ read: table => table === 'binder_card_showcases' ? accountShowcase.promise : completeOwnershipRead(table) });
  await openWithCompleteFacts(account);
  account.runtime.accountGenerationRef.current++;
  account.runtime.activeAccountIdRef.current = 'new-owner';
  account.runtime.setShowcaseRows([]);
  accountShowcase.resolve({ data: [{ id: 'old-account' }], error: null }); await tick();
  assert.equal(account.state.showcases.length, 0, 'an account-invalidated response must not restore private showcase placement');
});
await test('successful optional showcase never authorises failed mandatory ownership', async () => {
  for (const failedTable of ['binders', 'binder_cards', 'user_card_variants']) {
    const h = screenHarness({ read: table => table === failedTable
      ? { data: null, error: { message: 'mandatory ownership unavailable' } }
      : table === 'binder_card_showcases' ? { data: [{ id: 'optional-success' }], error: null } : completeOwnershipRead(table) });
    await openWithCompleteFacts(h); await tick();
    assert.equal(h.state.cards.length, 124, 'failed supplemental ownership must retain useful card facts');
    assert.equal(h.state.ownershipReady, false, `${failedTable} failure must keep editing disabled`);
    assert.equal(h.state.alerts.length, 1);
  }
});
await test('a failed Chase read exposes retry and successful retry permits a write without older-read erasure', async () => {
  const old = deferred(), fresh = deferred(); let reads = 0, writes = 0;
  const added = { id: 'newly-saved-row', binder_id: binder.id, user_id: scope.accountId, card_id: cards()[0].card_id, set_id: 'sv08', showcase_type: 'chase', sort_order: 0 };
  const h = screenHarness({ read: (table, request) => {
    if (table !== 'binder_card_showcases') return completeOwnershipRead(table);
    if (request.operation === 'insert') { writes++; return { data: added, error: null }; }
    return ++reads === 1 ? old.promise : fresh.promise;
  } });
  await openWithCompleteFacts(h);
  const retry = h.readShowcase(scope.accountId); await tick();
  fresh.resolve({ data: [], error: null }); await retry;
  assert.equal(h.runtime.showcaseReadyRef.current, true);
  await h.toggleShowcase(cards()[0], 'chase');
  assert.equal(writes, 1); assert.equal(h.state.showcases[0].id, added.id);
  old.resolve({ data: [], error: null }); await tick();
  assert.equal(h.state.showcases.length, 1, 'late empty baseline must not erase a persisted placement');
  assert.equal(h.state.showcases[0].id, added.id);

  let failures = 0;
  const failed = screenHarness({ read: (table, request) => table !== 'binder_card_showcases' ? completeOwnershipRead(table)
    : request.operation === 'select' && ++failures === 1 ? { data: null, error: { status: 503 } } : { data: [], error: null } });
  await openWithCompleteFacts(failed);
  assert.equal(failed.state.showcaseStatus, 'error'); assert.equal(failed.runtime.isReadOnly, false);
  await failed.readShowcase(scope.accountId);
  assert.equal(failed.state.showcaseStatus, 'ready'); assert.equal(failed.runtime.showcaseReadyRef.current, true);
  assert.match(source, /accessibilityLabel="Retry Chase list"/);
});
await test('a same-account full Retry overlapping placement insertion reconciles only after the write settles', async () => {
  const insertion = deferred(); let stored = [], reads = 0, writes = 0;
  const h = screenHarness({ read: (table, request) => {
    if (table !== 'binder_card_showcases') return completeOwnershipRead(table);
    if (request.operation === 'insert') { writes++; return insertion.promise; }
    reads++; return { data: stored, error: null };
  } });
  await openWithCompleteFacts(h);
  const update = h.toggleShowcase(cards()[0], 'chase'); await tick();
  assert.equal(writes, 1);
  await h.load(true); await tick();
  assert.equal(h.runtime.isReadOnly, false); assert.equal(h.runtime.showcaseReadyRef.current, false);
  assert.equal(reads, 1, 'reload must not publish a pre-write placement snapshot');
  stored = [{ id: 'committed-after-retry', binder_id: binder.id, user_id: scope.accountId, card_id: cards()[0].card_id, set_id: 'sv08', showcase_type: 'chase', sort_order: 0 }];
  insertion.resolve({ data: stored[0], error: null }); await update; await tick();
  assert.equal(reads, 2); assert.equal(h.state.showcaseStatus, 'ready');
  assert.equal(h.state.showcases[0].id, 'committed-after-retry');
});
await test('actual sign-out callback rejects late placement read and mutation results', async () => {
  const insertion = deferred();
  const h = screenHarness({ read: (table, request) => table !== 'binder_card_showcases' ? completeOwnershipRead(table)
    : request.operation === 'insert' ? insertion.promise : { data: [], error: null } });
  await openWithCompleteFacts(h);
  const update = h.toggleShowcase(cards()[0], 'chase'); await tick();
  let listener;
  h.runtime.supabase.auth.onAuthStateChange = callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  const cleanup = h.runtime.exports.authEffect();
  listener('SIGNED_OUT', null);
  insertion.resolve({ data: { id: 'old-owner-insert' }, error: null }); await update;
  assert.equal(h.state.showcases.length, 0); assert.equal(h.runtime.showcaseReadyRef.current, false);
  assert.equal(h.state.binder, null); assert.equal(h.state.userId, null); cleanup();

  const pendingRead = deferred();
  const account = screenHarness({ read: table => table === 'binder_card_showcases' ? pendingRead.promise : completeOwnershipRead(table) });
  await openWithCompleteFacts(account);
  account.runtime.supabase.auth.onAuthStateChange = callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  const readCleanup = account.runtime.exports.authEffect(); listener('SIGNED_OUT', null);
  pendingRead.resolve({ data: [{ id: 'old-owner-read' }], error: null }); await tick();
  assert.equal(account.state.showcases.length, 0); assert.equal(account.runtime.showcaseReadyRef.current, false); readCleanup();
});
await test('custom-card removal during pending placement invalidates the old read and reconciles after deletion', async () => {
  const old = deferred(); let selects = 0, cardDeletes = 0, placementDeletes = 0;
  const h = screenHarness({ read: (table, request) => {
    if (request.operation === 'delete') {
      if (table === 'binder_cards') cardDeletes++;
      else if (table === 'binder_card_showcases') placementDeletes++;
      return { data: null, error: null };
    }
    return table === 'binder_card_showcases' ? ++selects === 1 ? old.promise : { data: [], error: null } : completeOwnershipRead(table);
  } });
  await openWithCompleteFacts(h, { ...binder, type: 'custom', source_set_id: null });
  assert.equal(h.runtime.showcaseReadyRef.current, false); assert.equal(h.runtime.isReadOnly, false);
  await h.removeCard(cards()[0]);
  const confirm = h.state.alerts.at(-1)[2].find(button => button.text === 'Remove');
  await confirm.onPress(); await tick();
  old.resolve({ data: [{ id: 'removed-card-placement', card_id: cards()[0].card_id, set_id: 'sv08', showcase_type: 'chase' }], error: null }); await tick();
  assert.equal(cardDeletes, 1); assert.equal(placementDeletes, 1); assert.equal(selects, 2);
  assert.equal(h.state.cards.length, 123); assert.equal(h.state.showcases.length, 0);
  assert.equal(h.state.showcaseStatus, 'ready');
});
await test('same-account Retry during custom deletion completes placement cleanup and reloads post-delete facts', async () => {
  const deletion = deferred(); let removed = false, cardDeletes = 0, placementDeletes = 0, selects = 0;
  const h = screenHarness({ read: (table, request) => {
    if (request.operation === 'delete') {
      if (table === 'binder_cards') { cardDeletes++; return deletion.promise; }
      placementDeletes++; return { data: null, error: null };
    }
    if (table === 'binder_card_showcases') { selects++; return { data: [], error: null }; }
    return completeOwnershipRead(table);
  } });
  await openWithCompleteFacts(h, { ...binder, type: 'custom', source_set_id: null });
  h.runtime.fetchBinderCards = async () => removed ? cards().slice(1) : cards();
  await h.removeCard(cards()[0]);
  const confirm = h.state.alerts.at(-1)[2].find(button => button.text === 'Remove');
  const removal = confirm.onPress(); await tick();
  await h.load(true); await tick();
  assert.equal(h.state.cards.length, 124, 'the overlapping read captured facts before deletion settled');
  assert.equal(selects, 1, 'placement cannot become authoritative during the pending write');
  removed = true; deletion.resolve({ data: null, error: null }); await removal; await tick(); await tick();
  assert.equal(cardDeletes, 1); assert.equal(placementDeletes, 1, 'same-scope Retry must not skip the cleanup after the committed card deletion');
  assert.equal(selects, 2); assert.equal(h.state.showcaseStatus, 'ready'); assert.equal(h.state.showcases.length, 0);
  assert.equal(h.state.cards.length, 123, 'a post-delete refresh must replace facts captured before the write');
});
await test('confirmed custom Remove explains a concurrent placement save and works when that save settles', async () => {
  const insertion = deferred(); let stored = [], cardDeletes = 0;
  const h = screenHarness({ read: (table, request) => {
    if (request.operation === 'insert') return insertion.promise;
    if (request.operation === 'delete') {
      if (table === 'binder_cards') cardDeletes++;
      else stored = [];
      return { data: null, error: null };
    }
    return table === 'binder_card_showcases' ? { data: stored, error: null } : completeOwnershipRead(table);
  } });
  await openWithCompleteFacts(h, { ...binder, type: 'custom', source_set_id: null });
  await h.removeCard(cards()[0]); const confirm = h.state.alerts.at(-1)[2].find(button => button.text === 'Remove');
  const update = h.toggleShowcase(cards()[0], 'chase'); await tick();
  await confirm.onPress();
  assert.equal(cardDeletes, 0); assert.match(h.state.alerts.at(-1)[1], /being saved/);
  stored = [{ id: 'placed-before-removal', binder_id: binder.id, user_id: scope.accountId, card_id: cards()[0].card_id, set_id: 'sv08', showcase_type: 'chase', sort_order: 0 }];
  insertion.resolve({ data: stored[0], error: null }); await update;
  await confirm.onPress(); await tick();
  assert.equal(cardDeletes, 1); assert.equal(h.state.cards.length, 123); assert.equal(h.state.showcases.length, 0);
});
await test('account invalidation during custom deletion prevents a later placement write or view restoration', async () => {
  const deletion = deferred(); let placementDeletes = 0;
  const h = screenHarness({ read: (table, request) => {
    if (request.operation === 'delete') {
      if (table === 'binder_cards') return deletion.promise;
      placementDeletes++; return { data: null, error: null };
    }
    return table === 'binder_card_showcases' ? { data: [], error: null } : completeOwnershipRead(table);
  } });
  await openWithCompleteFacts(h, { ...binder, type: 'custom', source_set_id: null });
  await h.removeCard(cards()[0]); const removal = h.state.alerts.at(-1)[2].find(button => button.text === 'Remove').onPress(); await tick();
  let listener;
  h.runtime.supabase.auth.onAuthStateChange = callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  const cleanup = h.runtime.exports.authEffect(); listener('SIGNED_OUT', null);
  deletion.resolve({ data: null, error: null }); await removal; await tick();
  assert.equal(placementDeletes, 0); assert.equal(h.state.cards.length, 0); assert.equal(h.state.showcases.length, 0);
  assert.equal(h.state.binder, null); cleanup();
});
await test('confirmed placement enforces its existing limit and permits removal of a known row', async () => {
  const saved = cards(3).map((card, index) => ({ id: `placed-${index}`, binder_id: binder.id, user_id: scope.accountId, card_id: card.card_id, set_id: card.set_id, showcase_type: 'chase', sort_order: index }));
  let inserts = 0, deletes = 0;
  const h = screenHarness({ read: (table, request) => {
    if (table !== 'binder_card_showcases') return completeOwnershipRead(table);
    if (request.operation === 'insert') inserts++;
    if (request.operation === 'delete') deletes++;
    return { data: request.operation === 'select' ? saved : null, error: null };
  } });
  await openWithCompleteFacts(h);
  await h.toggleShowcase(cards(4)[3], 'chase');
  assert.equal(inserts, 0); assert.match(h.state.alerts.at(-1)[0], /limit reached/);
  await h.toggleShowcase(cards()[0], 'chase');
  assert.equal(deletes, 1); assert.equal(h.state.showcases.length, 2); assert.equal(h.runtime.showcaseReadyRef.current, true);
});
await test('new binder route loads placement independently of an old-scope pending insert', async () => {
  const oldInsert = deferred(); const nextId = uuid(9910); let nextReads = 0, nextInserts = 0;
  const nextBinder = { ...binder, id: nextId };
  const nextCards = cards().map(row => ({ ...row, binder_id: nextId }));
  const h = screenHarness({ read: (table, request) => {
    if (table !== 'binder_card_showcases') return completeOwnershipRead(table);
    if (request.operation === 'insert') {
      if (request.payload.binder_id === binder.id) return oldInsert.promise;
      assert.equal(request.payload.binder_id, nextId); nextInserts++;
      return { data: { ...request.payload, id: 'new-binder-placement' }, error: null };
    }
    const requestedBinder = request.filters.find(([key]) => key === 'binder_id')?.[1];
    if (requestedBinder === nextId) nextReads++;
    return { data: [], error: null };
  } });
  await openWithCompleteFacts(h);
  const previousUpdate = h.toggleShowcase(cards()[0], 'chase'); await tick();
  assert(h.runtime.showcaseMutationRef.current, 'old binder insert remains pending');
  const next = h.renderRoute(nextId);
  h.runtime.fetchBinderById = async requested => { assert.equal(requested, nextId); return nextBinder; };
  h.runtime.fetchBinderCards = async requested => { assert.equal(requested, nextId); return nextCards; };
  await next.load(); await tick(); await h.deadline();
  assert.equal(nextReads, 1, 'new binder must issue its SELECT before the old binder write settles');
  assert.equal(h.state.binder.id, nextId); assert.equal(h.runtime.isReadOnly, false);
  assert.equal(h.state.showcaseStatus, 'ready'); assert.equal(h.runtime.showcaseReadyRef.current, true);
  oldInsert.resolve({ data: { id: 'old-binder-placement', binder_id: binder.id }, error: null }); await previousUpdate; await tick();
  assert.equal(h.state.binder.id, nextId); assert.equal(h.state.showcases.length, 0);
  assert.equal(h.state.showcaseStatus, 'ready'); assert.equal(nextReads, 1, 'old completion cannot restart or replace the new scope');
  await next.toggleShowcase(nextCards[0], 'chase');
  assert.equal(nextInserts, 1); assert.equal(h.state.showcases[0].id, 'new-binder-placement');
});
await test('reorder waits for every dispatched write after one hard rejection before unlocking and reconciling', async () => {
  const delayed = deferred(); let writes = 0, reads = 0;
  const saved = cards(2).map((card, index) => ({ id: 'reorder-' + index, binder_id: binder.id, user_id: scope.accountId, card_id: card.card_id, set_id: card.set_id, showcase_type: 'chase', sort_order: index }));
  const h = screenHarness({ read: (table, request) => {
    if (table !== 'binder_card_showcases') return completeOwnershipRead(table);
    if (request.operation === 'update') return ++writes === 1 ? Promise.reject(new Error('first update transport rejected')) : delayed.promise;
    reads++; return { data: saved, error: null };
  } });
  await openWithCompleteFacts(h);
  const reorder = h.runtime.exports.reorderShowcase('chase', cards(2).reverse()); await tick();
  assert.equal(writes, 2); assert.equal(reads, 1);
  assert(h.runtime.showcaseMutationRef.current, 'a hard rejection must not release the lock while another dispatched update is pending');
  assert.equal(h.runtime.showcaseReadyRef.current, false);
  await h.readShowcase(scope.accountId); await tick();
  assert.equal(reads, 1, 'Retry cannot read a generation while a dispatched reorder update remains unsettled');
  delayed.resolve({ data: null, error: null }); await reorder; await tick();
  assert.equal(reads, 2); assert.equal(h.state.showcaseStatus, 'ready');
  assert.equal(h.runtime.showcaseMutationRef.current, null); assert.equal(h.runtime.showcaseReadyRef.current, true);
  assert.equal(h.state.alerts.length, 1, 'the rejected update remains a reported failure after all writes settle');
});
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
await test('actual screen retains the saved view when a full-count refresh has a wrong-language identity', async () => {
  const h = screenHarness(); const pending = h.load(); h.disk.resolve(snapshot()); await tick();
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  const wrong = cards(); wrong[0].language = 'ja'; h.network.resolve(wrong); await pending;
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.cards[0].language, 'en');
  assert.equal(h.state.status.state, 'incomplete'); assert.equal(h.saves, 0); assert.equal(h.state.ownershipReady, false);
});
await test('actual screen replaces saved data only after a complete refresh and never lets late disk results win', async () => {
  const h = screenHarness(); const pending = h.load(); h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  const updated = cards(); updated[0].owned_quantity = 7; h.network.resolve(updated); await pending; h.disk.resolve(snapshot()); await tick();
  assert.equal(h.state.cards[0].owned_quantity, 7); assert.equal(h.state.status, null); assert.equal(h.saves, 1); assert.equal(h.state.ownershipReady, false);
});
await test('actual screen rejects cached content after navigation or account change', async () => {
  const h = screenHarness(); h.load(); h.runtime.accountGenerationRef.current++; h.disk.resolve(snapshot()); await tick(); assert.equal(h.state.cards.length, 0);
});
await test('actual screen stops an uncached hanging auth read, offers retry and ignores the late result', async () => {
  const h = screenHarness(); const pending = h.load(); h.disk.resolve(null); await tick();
  assert.equal(h.state.loading, true);
  await h.deadline(); await pending;
  assert.equal(h.state.loading, false); assert.equal(h.state.binder, null);
  assert.match(h.state.error, /try again/i);
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  assert.equal(h.state.binder, null, 'late authorisation cannot reopen a timed-out binder');
  const retry = h.load(); await tick(); h.network.resolve(cards()); await retry;
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.error, null);
});
await test('actual screen retains a read-only saved view when fresh card rows never settle', async () => {
  const h = screenHarness(); const pending = h.load(); h.disk.resolve(snapshot());
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  await h.deadline(); await pending;
  assert.equal(h.state.loading, false); assert.equal(h.state.cards.length, 124);
  assert.equal(h.state.status.state, 'offline'); assert.equal(h.state.ownershipReady, false);
  h.network.resolve(cards(117)); await tick();
  assert.equal(h.state.cards.length, 124, 'late incomplete cards cannot replace the retained saved view');
});
await test('actual binder auth listener defers reload and discards a superseded account event', async () => {
  assert(authEffect);
  const h = screenHarness(); let listener, loads = 0, timerId = 0;
  const timers = new Map();
  h.runtime.activeAccountIdRef.current = null;
  h.runtime.setDetailVisible = () => {};
  h.runtime.load = () => { loads++; };
  h.runtime.setTimeout = action => { timers.set(++timerId, action); return timerId; };
  h.runtime.clearTimeout = id => timers.delete(id);
  h.runtime.supabase.auth.onAuthStateChange = next => { listener = next; return { data: { subscription: { unsubscribe() {} } } }; };
  const compiled = ts.transpileModule(`export const authEffect = ${authEffect};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const authRuntime = { ...h.runtime, exports: {} };
  vm.runInNewContext(compiled, authRuntime);
  const cleanup = authRuntime.exports.authEffect();
  listener('SIGNED_IN', { user: { id: 'owner-a' } });
  assert.equal(loads, 0, 'auth-dependent loads cannot run inside the Supabase notification callback');
  listener('SIGNED_OUT', null);
  assert.equal(timers.size, 0, 'sign-out cancels a queued private reload');
  listener('SIGNED_IN', { user: { id: 'owner-b' } });
  for (const action of [...timers.values()]) action();
  assert.equal(loads, 1, 'the current account reloads after the callback returns');
  listener('SIGNED_IN', { user: { id: 'owner-c' } }); cleanup();
  assert.equal(timers.size, 0, 'unmount cancels pending account work');
});
await test('opening a custom binder saves its complete private rows for the next app launch', async () => {
  const h = screenHarness(); const pending = h.load(); h.disk.resolve(null);
  h.auth.resolve({ data: { user: { id: scope.accountId } } });
  h.record.resolve({ ...binder, type: 'custom', source_set_id: null }); await tick();
  h.network.resolve(cards(2)); await pending;
  assert.equal(h.saves, 1, 'the actual custom-binder screen enters the complete owner cache');
  assert.deepEqual(copy(h.savedArgs[0][5]), { customSource: { kind: 'binder-saved-cards-v1', cardCount: 2 } });
  const restored = snapshotBinderView(h.savedArgs[0][0], h.savedArgs[0][1], h.savedArgs[0][2], h.savedArgs[0][4], h.savedArgs[0][5]);
  assert.equal(isCompleteBinderSnapshot(restored, scope, binder.id, Date.now()), true);
  assert.equal(h.state.cards.length, 2);
  assert.equal(h.state.loading, false);
});
await test('native viewability callback and committed ownership hook are wired separately', async () => {
  assert.match(source, /onViewableItemsChanged=\{onBinderViewableItemsChanged\}/);
  assert.match(source, /ownershipReady && !isReadOnly\) retrievalTraceRef\.current\?\.editable/);
  assert.match(source, /const isReadOnly = routeReadOnly \|\| reopenStatus !== null/);
  assert.match(source, /value\??\.total != null/, 'prepared valuation must require an actual stored total');
  assert.match(source, /Stored valuation pending/, 'saved views must not turn omitted prices into a zero estimate');
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
    './binderReopenSnapshot': { createBinderReopenCache, BINDER_REOPEN_STORED_ENTRIES, BINDER_REOPEN_STORED_BYTES },
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
    assert.equal(db.prepare('SELECT count(*) AS n FROM binder_reopen_v1').get().n, 11, 'more than eight started binders survive on disk');
    for (let i = 10; i < BINDER_REOPEN_STORED_ENTRIES + 2; i++) { const value = copy(saved); value.binder.id = uuid(9900 + i); value.savedAt += i; await store.write(value); }
    assert.equal(db.prepare('SELECT count(*) AS n FROM binder_reopen_v1').get().n, BINDER_REOPEN_STORED_ENTRIES, 'disk retention remains bounded');
    assert.equal(await store.read(scope, binder.id), null, 'oldest entries are evicted at the storage limit');
    await store.clear(); assert.equal(db.prepare('SELECT count(*) AS n FROM binder_reopen_v1').get().n, 0);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
console.log(`${count} tests total, including file-backed SQLite reopen/rollback. Expo/iPhone execution is still unverified.`);
fs.writeFileSync('reports/binder-reopen-tests.json', JSON.stringify({ tests: count, passed: count, scope: 'Source, account isolation and file-backed Node SQLite; no physical-device timing', observedAt: new Date().toISOString() }, null, 2));
