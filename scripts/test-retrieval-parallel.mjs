import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import * as identity from '../lib/binderCardIdentity.ts';
import * as presentation from '../lib/binderCataloguePresentation.ts';
import * as cache from '../lib/requestCache.ts';

const results = [];
async function test(name, run) { await run(); results.push(name); console.log(`PASS ${name}`); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise(setImmediate);
const binder = { id: 'binder', user_id: 'owner', is_public: false, type: 'official', source_set_id: 'sv08', language: 'en', name: 'Fixture' };
const catalogueSet = { id: 'canonical-set', language: 'en', name: 'Fixture', total: 252, printedTotal: 191, externalIds: { setCode: 'sv08' }, images: {} };
const catalogue = Array.from({ length: 252 }, (_, i) => ({ id: `sv08-${i + 1}`, number: String(i + 1), name: `Card ${i + 1}` }));
const saved = [{ id: 'saved', binder_id: 'binder', card_id: 'sv08-1', card_number: '001', set_id: 'sv08', language: 'en', owned: true, owned_quantity: 4, condition: 'Mint', notes: 'retain', slot_order: 3 }];

function binderHarness(options = {}) {
  cache.invalidateRequestCache();
  const ownership = deferred(); const cards = deferred(); const record = deferred();
  const calls = { record: 0, ownership: 0, catalogue: 0 };
  const selectedBinder = { ...binder, ...options.binder };
  const supabase = { from(table) {
    const query = { select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => { calls.record++; return options.gateRecord ? record.promise : { data: selectedBinder, error: null }; },
      then: (resolve, reject) => { assert.equal(table, 'binder_cards'); calls.ownership++; return ownership.promise.then(resolve, reject); },
    };
    return query;
  } };
  const dependencies = {
    './supabase': { supabase }, './requestCache': cache,
    './pokemonTcg': { normalizePokemonCardLanguage: () => 'en', fetchCardsForSet: async (id, readOptions) => {
      calls.catalogue++; assert.equal(id, catalogueSet.id); assert.equal(readOptions.includeAssets, false); assert.equal(readOptions.minimumCardCount, 252); return cards.promise;
    } },
    './stackrDomainAdapter': { fetchStackrSet: async () => catalogueSet },
    './pokemonSetIdentity': { stripPokemonSetLanguagePrefix: (s) => s },
    './binderSetIdentity': { resolveBinderSetIdentity: () => ({ status: options.ambiguous ? 'ambiguous' : 'resolved', language: 'en', setId: catalogueSet.id }) },
    './binderCardIdentity': identity, './binderCataloguePresentation': presentation,
    './providerSetMarkRuntimePolicy': { enforceSetVisualRuntimePolicy: () => null },
    './pokemonDisplayNames': { getPreferredSetDisplayName: () => catalogueSet.name },
  };
  const source = fs.readFileSync('lib/binders.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => dependencies[name] ?? {}, console });
  return { calls, ownership, cards, record, selectedBinder, read: () => exports.fetchBinderCards('binder', { includePrices: false, includeAssets: false }) };
}

await test('ownership and catalogue start together only after binder access succeeds', async () => {
  const h = binderHarness({ gateRecord: true }); let settled = false;
  const pending = h.read().then((rows) => { settled = true; return rows; });
  await tick(); assert.equal(h.calls.record, 1); assert.equal(h.calls.ownership, 0); assert.equal(h.calls.catalogue, 0);
  h.record.resolve({ data: h.selectedBinder, error: null }); await tick();
  assert.equal(h.calls.ownership, 1); assert.equal(h.calls.catalogue, 1, 'catalogue must not wait for ownership response');
  h.cards.resolve(catalogue); await tick(); assert.equal(settled, false, 'do not return rows without the ownership read');
  h.ownership.resolve({ data: saved, error: null });
  const rows = await pending; assert.equal(rows.length, 252); assert.equal(rows.filter((r) => r.owned).length, 1);
  assert.equal(rows[0].owned_quantity, 4); assert.equal(rows[0].notes, 'retain'); assert.equal(rows[0].condition, 'Mint');
});

await test('denied binder access starts neither ownership nor catalogue', async () => {
  const h = binderHarness({ gateRecord: true }); const pending = h.read();
  h.record.resolve({ data: null, error: new Error('binder denied') }); await assert.rejects(pending, /binder denied/);
  assert.equal(h.calls.ownership, 0); assert.equal(h.calls.catalogue, 0);
});

await test('ownership denial fails promptly even while public catalogue is stalled', async () => {
  const h = binderHarness(); const pending = h.read(); await tick();
  h.ownership.resolve({ data: null, error: new Error('ownership denied') });
  await assert.rejects(pending, /ownership denied/); assert.equal(h.calls.catalogue, 1);
  h.cards.resolve(catalogue);
});

for (const scenario of ['custom', 'ambiguous']) await test(`${scenario} binder does not fetch an unrelated catalogue`, async () => {
  const h = binderHarness(scenario === 'custom' ? { binder: { type: 'custom' } } : { ambiguous: true });
  const pending = h.read(); await tick(); assert.equal(h.calls.ownership, 1); assert.equal(h.calls.catalogue, 0);
  h.ownership.resolve({ data: saved, error: null }); const rows = await pending;
  assert.equal(rows.length, 1); assert.equal(rows[0].owned_quantity, 4);
});

await test('failed catalogue retains saved rows and does not poison the next read', async () => {
  const h = binderHarness(); const pending = h.read(); await tick();
  h.cards.reject(new Error('catalogue offline')); h.ownership.resolve({ data: saved, error: null });
  assert.equal((await pending)[0].owned_quantity, 4);
  await h.read(); assert.equal(h.calls.catalogue, 2, 'failed result must be retryable');
});

function referenceMatches(rows, requests, language = 'en', references = ['sv08', 'canonical-set']) {
  const consumed = new Set();
  return requests.map((request) => {
    const match = identity.findSavedBinderCardMatch({ savedRows: rows.filter((row) => !consumed.has(row.id)), language, setReferences: references, ...request });
    if (match) consumed.add(match.id);
    return match;
  });
}
function indexedMatches(rows, requests, language = 'en', references = ['sv08', 'canonical-set']) {
  const matcher = identity.createSavedBinderCardMatcher({ savedRows: rows, language, setReferences: references });
  return requests.map((request) => matcher.takeMatch(request));
}

await test('indexed matcher preserves exact-ID precedence, ambiguity, aliases and consumption', async () => {
  const rows = [
    { id: 'exact-a', card_id: 'sv08-1', card_number: '001', set_id: 'sv08', language: 'en' },
    { id: 'duplicate-a', card_id: 'sv08-2', card_number: '002', set_id: 'sv08', language: 'en' },
    { id: 'duplicate-b', card_id: 'sv08-2', card_number: '2', set_id: 'sv08', language: 'en' },
    { id: 'foreign', card_id: 'sv08-1', card_number: '001', set_id: 'sv08', language: 'ja' },
    { id: 'alias', card_id: 'old-3', card_number: '００３/２５２', set_id: 'canonical-set', language: 'en' },
    { id: 'same-saved-id', card_id: 'old-4', card_number: '4', set_id: 'sv08', language: 'en' },
    { id: 'same-saved-id', card_id: 'old-5', card_number: '5', set_id: 'sv08', language: 'en' },
    { id: 'tg', card_id: 'TG01', card_number: 'TG01', set_id: 'sv08', language: 'en' },
    { id: 'gg', card_id: 'GG01', card_number: 'GG01', set_id: 'sv08', language: 'en' },
  ];
  const requests = [1, 2, 3, 4, 5, 1].map((n) => ({ cardId: `sv08-${n}`, collectorNumber: String(n), allowCollectorMatch: true }));
  requests.push({ collectorNumber: 'TG01', allowCollectorMatch: true }, { collectorNumber: 'GG01', allowCollectorMatch: true });
  const before = referenceMatches(rows, requests); const after = indexedMatches(rows, requests);
  assert.deepEqual(after, before); after.forEach((row, i) => assert.equal(row, before[i], 'return the original row, not a clone'));
  assert.equal(after[1], null); assert.equal(after[4], null); assert.equal(after[5], null);
});

await test('indexed matcher equals the reference for 4096 mixed requests across all supported cache languages', async () => {
  let seed = 463;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 32; sample++) {
    const language = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'unknown', 'jp', null][sample % 8];
    const rows = Array.from({ length: 128 }, (_, i) => ({
      id: `saved-${random() % 100}`, card_id: `card-${random() % 96}`, card_number: String(random() % 96).padStart(3, '0'),
      set_id: ['sv08', 'canonical-set', 'other', 'ja:sv08'][random() % 4],
      language: ['en', 'ja', 'zh-cn', 'zh-tw', 'ko', null][random() % 6], value: i,
    }));
    const requests = Array.from({ length: 128 }, () => ({ cardId: `card-${random() % 96}`, collectorNumber: String(random() % 96), allowCollectorMatch: random() % 3 !== 0 }));
    assert.deepEqual(indexedMatches(rows, requests, language), referenceMatches(rows, requests, language));
  }
});

// Exercise the actual screen callback rather than a hand-written copy of it.
const screenSource = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
const screenAst = ts.createSourceFile('screen.tsx', screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(screenAst) === 'load' && node.initializer && ts.isCallExpression(node.initializer)
    && node.initializer.expression.getText(screenAst) === 'useCallback') callback = node.initializer.arguments[0].getText(screenAst);
  ts.forEachChild(node, visit);
}
visit(screenAst); assert(callback, 'actual binder screen loader must be testable');
const compiledCallback = ts.transpileModule(`export const load = ${callback};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function screenHarness() {
  const auth = deferred(); const record = deferred(); const cards = deferred();
  const calls = { auth: 0, record: 0, cards: 0, artwork: 0, prices: 0 };
  const state = { loading: null, cards: [], ownershipReady: false };
  const never = () => new Promise(() => {});
  const context = { exports: {}, console, AbortController, binderId: 'binder',
    accountGenerationRef: { current: 0 }, loadRequestRef: { current: 0 }, artworkRequestRef: { current: null }, activeAccountIdRef: { current: null },
    isCurrentAccountRequest: (a, b) => a.accountGeneration === b.accountGeneration && a.requestId === b.requestId,
    supabase: { auth: { getUser: () => { calls.auth++; return auth.promise; } }, from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: () => never() }; return q; } },
    measureAsync: (_name, work) => work(),
    fetchBinderById: (_id, options) => { calls.record++; assert.equal(options.includeAssets, false); return record.promise; },
    fetchBinderCards: (_id, options) => { calls.cards++; assert.equal(options.includeAssets, false); assert.equal(options.includePrices, false); return cards.promise; },
    attachBinderCatalogueArtwork: () => { calls.artwork++; return never(); }, attachBinderSetArtwork: never,
    attachLatestSnapshotPrices: () => { calls.prices++; return never(); }, getVariantCardKey: (card, set) => `${set}:${card}`,
    setLoading: (v) => { state.loading = v; }, setOwnershipReady: (v) => { state.ownershipReady = v; }, setCards: (v) => { state.cards = typeof v === 'function' ? v(state.cards) : v; },
    setShowcaseRows: () => {}, setOwnedVariants: () => {}, setVariantManagedCards: () => {}, setUserId: () => {}, setBinder: () => {}, setCustomNameArtKey: () => {}, setIsPublic: () => {},
    invalidateBinderCaches: () => {}, invalidatePokemonCatalogueCardCaches: () => {}, Alert: { alert: () => {} },
  };
  vm.runInNewContext(compiledCallback, context);
  return { auth, record, cards, calls, state, context, load: context.exports.load };
}

await test('actual screen overlaps authentication and binder lookup, then renders before optional requests settle', async () => {
  const h = screenHarness(); const pending = h.load();
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.record, 1, 'record lookup must not await auth network');
  h.record.resolve(binder); await tick(); assert.equal(h.calls.cards, 0, 'authentication must still complete before cards are loaded');
  h.auth.resolve({ data: { user: { id: 'owner' } } }); await tick(); assert.equal(h.calls.cards, 1);
  const rows = catalogue.map((card) => ({ ...card, card_id: card.id, set_id: 'sv08' })); h.cards.resolve(rows); await pending;
  assert.equal(h.state.cards.length, 252); assert.equal(h.state.loading, false);
  assert.equal(h.calls.artwork, 1); assert.equal(h.calls.prices, 1); assert.equal(h.state.ownershipReady, false, 'editing stays gated while detailed ownership is pending');
});

await test('actual screen retains private-binder denial after overlapping reads', async () => {
  const h = screenHarness(); const pending = h.load(); h.record.resolve(binder); h.auth.resolve({ data: { user: { id: 'other' } } }); await pending;
  assert.equal(h.calls.cards, 0); assert.equal(h.state.cards.length, 0);
});

await test('actual screen discards an old account result before card loading', async () => {
  const h = screenHarness(); const pending = h.load(); h.context.accountGenerationRef.current++;
  h.record.resolve(binder); h.auth.resolve({ data: { user: { id: 'owner' } } }); await pending;
  assert.equal(h.calls.cards, 0); assert.equal(h.state.cards.length, 0);
});

await test('actual screen discards a navigation result that arrives after cancellation', async () => {
  const h = screenHarness(); const pending = h.load(); h.record.resolve(binder); h.auth.resolve({ data: { user: { id: 'owner' } } }); await tick();
  h.context.loadRequestRef.current++; h.cards.resolve(catalogue); await pending;
  assert.equal(h.state.cards.length, 0); assert.equal(h.calls.artwork, 0);
});

const work = [];
for (const count of [252, 1000]) {
  let eligibilityReads = 0;
  const rows = Array.from({ length: count }, (_, i) => ({ id: `saved-${i}`, card_id: `card-${i}`, card_number: String(i), language: 'en', get set_id() { eligibilityReads++; return 'sv08'; } }));
  const requests = rows.map((row) => ({ cardId: row.card_id, collectorNumber: row.card_number, allowCollectorMatch: true }));
  let started = performance.now(); const before = referenceMatches(rows, requests); const referenceMs = performance.now() - started;
  const referenceEligibilityReads = eligibilityReads; eligibilityReads = 0;
  started = performance.now(); const after = indexedMatches(rows, requests); const indexedMs = performance.now() - started;
  assert.equal(after.length, count); after.forEach((row, i) => assert.equal(row, before[i]));
  assert.equal(eligibilityReads, count, 'eligible rows are indexed once');
  work.push({ cards: count, referenceEligibilityReads, indexedEligibilityReads: eligibilityReads, referenceMs: +referenceMs.toFixed(3), indexedMs: +indexedMs.toFixed(3) });
}
const report = { scope: 'Deterministic source regression and Node CPU diagnostic; NOT phone latency or live API proof', observedAt: new Date().toISOString(), node: process.version, passedCases: results.length, tests: results, work };
fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/binder-retrieval-regression.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.work));
console.log(`${results.length} binder parallel-read and matcher tests passed; device latency remains unmeasured.`);
