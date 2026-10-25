import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/query-core';
import { summariseCollectionPricing } from '../lib/collectionPricingState';
import { withPersonalDataReadTimeout } from '../lib/personalDataRead';
import { readUiCollectionChunks } from '../lib/uiCollectionPages';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';

const source = process.env.BINDER_VALUE_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:app/(tabs)/binder.tsx'], { encoding: 'utf8' })
  : readFileSync('app/(tabs)/binder.tsx', 'utf8');
const compile = (value: string) => ts.transpileModule(value, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
function callback(name: string, next: string) {
  const start = source.indexOf(`  const ${name} = useCallback(async (`);
  assert.ok(start > 0);
  return source.slice(start, source.indexOf(`\n  const ${next}`, start))
    .replace(`  const ${name} = useCallback(async (`, `exports.${name} = async (`)
    .replace(/\}, \[[^\]]*\]\);\s*$/, '};');
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value: T) => resolve(value) }; };
const facts = { counts: { b: { owned: 1, total: 113, totalKnown: true } }, masterSets: {},
  priceInputs: [{ key: 'owned-exact', references: ['exact-printing'], quantity: 3 }], priceKeysByBinder: { b: ['owned-exact'] } };
const quote = { key: 'owned-exact', quantity: 3, central: 7, status: 'market_estimate', freshness: 'fresh',
  calculatedAt: '2026-10-18T08:00:00Z', staleAfter: '2026-10-19T08:00:00Z', requestError: null };
const oldValue = summariseCollectionPricing([{ quantity: 3, centralValue: 6, evidenceStatus: 'market_estimate', freshness: 'fresh' }]);

function pricingHarness(read: (inputs: any[], options: any) => Promise<any[]>, sharedQueryClient?: QueryClient) {
  const exports: any = {};
  let values: any = { b: oldValue }; let error: string | null = null; let current = true;
  const removed: unknown[] = []; const published: any[] = []; let passedOptions: any;
  const context: any = { exports, Map, Set, console: { log() {} }, summariseCollectionPricing,
    loadCollectionPrices: async (inputs: any[], options: any) => { passedOptions = options; return read(inputs, options); },
    summaryRequestRef: { current: 0 }, getBinderLibrarySignature: () => 'fixture',
    stackrQueryKeys: { binderLibrarySummaries: (owner: string, signature: string) => ['library', owner, signature] },
    stackrQueryTiming: { hotPathStaleMs: 30_000 }, sha256Text: (value: string) => value,
    stackrQueryClient: { getQueryData: (key: any) => sharedQueryClient?.getQueryData(key) ?? null,
      fetchQuery: (options: any) => sharedQueryClient ? sharedQueryClient.fetchQuery(options) : options.queryFn({ signal: new AbortController().signal }),
      setQueryData: (key: any, value: any) => { published.push(value); sharedQueryClient?.setQueryData(key, value); },
      removeQueries: (query: any) => { removed.push(query); sharedQueryClient?.removeQueries(query); } },
    fetchBinderFactsSnapshot: async () => facts, setCounts() {}, setMasterSets() {},
    setValues: (value: any) => { values = value; }, setLibraryError: (message: string | null) => { error = message; },
    applyBinderSummarySnapshot: (snapshot: any) => { values = snapshot.values; },
    isKnownAuthDenial: (failure: any) => failure?.status === 401 || failure?.status === 403,
    withPersonalDataReadTimeout: (work: any, options: any = {}) => withPersonalDataReadTimeout(work, { ...options, timeoutMs: sharedQueryClient ? 2_000 : 20 }),
  };
  runInNewContext(compile(callback('fetchBinderValues', 'loadBinderSummaries')), context);
  context.fetchBinderValues = exports.fetchBinderValues;
  runInNewContext(compile(callback('loadBinderSummaries', 'load =')), context);
  return { values: () => values, error: () => error, removed, published, options: () => passedOptions,
    supersede: () => { current = false; },
    load: () => exports.loadBinderSummaries([{ id: 'b' }], 'owner', true, () => current) };
}

async function run() {
  // Cached and fresh overview lanes can concurrently request the same price
  // key. Execute actual QueryClient deduplication, not a fetchQuery stub.
  const sharedClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  try {
    const pendingQuote = deferred<void>(); let priceCalls = 0;
    const overlap = pricingHarness(async (_inputs, options) => {
      priceCalls += 1; await pendingQuote.promise;
      return options.isCurrent() ? [quote] : [{ ...quote, central: null, status: 'unavailable', unavailableReason: 'Stored price read pending.' }];
    }, sharedClient);
    const first = overlap.load(); await tick();
    const second = overlap.load(); await tick(); pendingQuote.resolve();
    await Promise.all([first, second]);
    assert.equal(priceCalls, 1, 'Identical in-flight account-scoped pricing remains shared.');
    assert.equal(overlap.values().b.total, 21, 'A superseded subscriber must not cancel the shared query needed by its replacement.');
    assert.equal(overlap.error(), null); assert.equal(overlap.published.length, 1);
  } finally { sharedClient.clear(); }
  const failed = (status: number) => [{ ...quote, central: null, status: 'unavailable', requestError: `http_${status}`,
    requestFailure: { kind: status === 403 ? 'access_denied' : 'service_error', status, code: `http_${status}`, deferred: false } }];
  const transient = pricingHarness(async () => failed(503));
  await assert.rejects(transient.load(), 'An explicit provider/service failure must not become a successful empty valuation.');
  assert.equal(transient.values().b.total, 18, 'A failed stored-price refresh retains the previous subtotal.');
  assert.match(transient.error()!, /try again/i); assert.equal(transient.published.length, 0);
  assert.equal(typeof transient.options().isCurrent, 'function', 'The real pricing queue receives the current-request guard.');
  const quota = pricingHarness(async () => failed(429)); await assert.rejects(quota.load()); assert.equal(quota.values().b.total, 18);
  const denied = pricingHarness(async () => failed(403)); await assert.rejects(denied.load());
  assert.equal(denied.values().b, undefined, 'A price-access denial clears previously shown private prices.');
  assert.match(denied.error()!, /access could not be verified/i); assert.ok(denied.removed.length >= 1);
  for (const status of [401, 403]) {
    for (const rows of [[...failed(503), ...failed(status)], [...failed(status), ...failed(503)]]) {
      const mixed = pricingHarness(async () => rows); await assert.rejects(mixed.load());
      assert.equal(mixed.values().b, undefined, `Access denial ${status} clears private prices even beside a transient error.`);
      assert.ok(mixed.removed.length >= 1); assert.match(mixed.error()!, /access could not be verified/i);
    }
  }
  const absent = pricingHarness(async () => [{ ...quote, central: null, status: 'unavailable', requestError: null }]);
  await absent.load(); assert.equal(absent.values().b.total, null); assert.equal(absent.error(), null, 'A genuine no-quote result remains different from a failed read.');
  const success = pricingHarness(async () => [quote]); await success.load(); assert.equal(success.values().b.total, 21); assert.equal(success.error(), null);
  const pending = deferred<void>(); let scheduledAfterBoundary = false;
  const timed = pricingHarness(async (_inputs, options) => { await pending.promise; scheduledAfterBoundary = options?.isCurrent?.() ?? true; return [quote]; });
  await assert.rejects(timed.load()); pending.resolve(); await tick();
  assert.equal(scheduledAfterBoundary, false, 'Deadline aborts prevent scheduling another per-card read.');
  assert.equal(timed.values().b.total, 18); assert.equal(timed.published.length, 0, 'Late prices cannot publish after timeout.');
  const stale = deferred<any[]>(); const switched = pricingHarness(async () => stale.promise);
  const old = switched.load(); await tick(); switched.supersede(); stale.resolve([quote]); await old;
  assert.equal(switched.values().b.total, 18); assert.equal(switched.published.length, 0, 'A superseded account/request cannot publish prices.');

  // Execute the actual facts reader against canonical IDs and language-scoped
  // source IDs. No live Supabase/API/provider calls are made.
  const canonical = [
    { id: '44444444-4444-4444-8444-444444444444', source_id: 'base1', language: 'en', actual_total: 113, printed_total: 83 },
    { id: '11111111-1111-4111-8111-111111111111', source_id: 'M6', language: 'ja', actual_total: 113, printed_total: 83 },
    { id: '22222222-2222-4222-8222-222222222222', source_id: 'same-code', language: 'zh-cn', actual_total: 40, printed_total: 30 },
    { id: '33333333-3333-4333-8333-333333333333', source_id: 'same-code', language: 'zh-tw', actual_total: 60, printed_total: 50 },
  ];
  const queries: { field: string; language: string | null; values: string[] }[] = [];
  let savedRows: any[] = [], catalogueRows: any[] = [], variantRows: any[] = [];
  let pageCap = 50, savedReads = 0, failSavedPage = -1, failCataloguePage = -1;
  let repeatSaved = false, foreignSaved = false;
  let afterSavedPage: (() => void) | null = null;
  const accountIdRef = { current: 'owner' };
  const authListeners = new Set<(...args: any[]) => void>();
  const supabase = { auth: { onAuthStateChange: (listener: (...args: any[]) => void) => {
    authListeners.add(listener); return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  } }, from: (table: string) => {
    let field = '', language: string | null = null, owner: string | null = null;
    let values: string[] = [], from = 0, to = 49;
    const q: any = {
      select: () => q,
      order: (column: string, options: any) => { assert.equal(column, 'id'); assert.equal(options.ascending, true); return q; },
      range: (start: number, end: number) => { assert.equal(end - start, 49); from = start; to = end; return q; },
      abortSignal: (signal: AbortSignal) => { assert.equal(signal.aborted, false); return q; },
      eq: (column: string, value: string) => { if (column === 'language') language = value; if (column === 'user_id') owner = value; return q; },
      in: (column: string, ids: string[]) => { assert.ok(ids.length <= 50); field = column; values = ids; return q; },
      then: (resolve: (value: any) => unknown) => {
        if (table === 'tcg_sets') queries.push({ field, language, values });
        const fixture = table === 'tcg_sets' ? canonical : table === 'binder_cards' ? savedRows
          : table === 'pokemon_cards' ? catalogueRows : table === 'user_card_variants' ? variantRows : [];
        let page = fixture.filter((row: any) => values.includes(row[field]) && (!language || row.language === language) && (!owner || row.user_id === owner))
          .slice(from, Math.min(to + 1, from + pageCap));
        if (table === 'binder_cards') {
          savedReads++;
          if (repeatSaved && from) page = [savedRows[0]];
          if (foreignSaved) page = [{ ...savedRows[0], binder_id: 'foreign-binder' }];
          afterSavedPage?.();
        }
        const failed = (table === 'binder_cards' && savedReads === failSavedPage)
          || (table === 'pokemon_cards' && from >= failCataloguePage && failCataloguePage >= 0);
        return Promise.resolve({ data: page, error: failed ? new Error('later page failed') : null }).then(resolve);
      },
    }; return q;
  } };  const exports: any = {};
  const strip = (id?: string | null) => String(id ?? '').replace(/^(ja|en|zh-cn|zh-tw):/i, '');
  runInNewContext(compile(callback('fetchBinderFactsSnapshot', 'fetchBinderValues')), { exports, Map, Set, console, supabase, accountIdRef, readUiCollectionChunks,
    AsyncStorage: { getItem: async () => null }, getMasterSetStorageKey: (id: string) => id,
    getSetLookupCandidates: (id: string) => [id, strip(id)],
    readOptionalCatalogueEnrichment,
    withPersonalDataReadTimeout: (work: any) => work(new AbortController().signal), fetchOwnedCardRows: async () => [],
    normalizePokemonCardLanguage: (language: string) => language, inferBinderLanguage: (language: string) => language,
    getLanguageSetKey: (id: string, language: string) => `${language ?? 'en'}:${strip(id)}`,
    getKnownPokemonSetTotal: () => null,
    readStoredSetTotal: (set: any) => Math.max(set.printed_total ?? 0, set.total ?? 0) || null,
    normalizePokemonSetId: strip, stripSetLanguagePrefix: strip, getVariants: () => ['normal'],
  });
  const data = [
    { id: 'ja', type: 'official', source_set_id: 'M6', language: 'ja' },
    { id: 'cn', type: 'official', source_set_id: 'same-code', language: 'zh-cn' },
    { id: 'tw', type: 'official', source_set_id: 'same-code', language: 'zh-tw' },
    { id: 'resolved', type: 'official', source_set_id: 'not-in-legacy-tables', language: 'ja',
      catalogue_identity_status: 'resolved', catalogue_set_id: 'proven-exact-set', catalogue_set_total: 128 },
    { id: 'unresolved', type: 'official', source_set_id: 'unknown', language: 'ja', catalogue_set_total: 999 },
  ];
  const results = await exports.fetchBinderFactsSnapshot(data.map(binder => ({ ...binder, user_id: 'owner' })), 'owner');
  assert.equal(results.counts.ja.total, 113, 'Canonical source_id resolves the requested exact-language total.');
  assert.equal(results.counts.cn.total, 40); assert.equal(results.counts.tw.total, 60, 'Simplified and Traditional totals remain isolated.');
  assert.equal(results.counts.resolved.total, 128, 'Verified enriched metadata survives missing legacy rows.');
  assert.equal(results.counts.unresolved.total, null, 'An unverified total cannot establish completeness.');
  assert.ok(queries.filter((query) => query.field === 'source_id').every((query) => Boolean(query.language)), 'Every source-code lookup has an exact language filter.');
  const bulkBinder = [{ id: 'bulk', user_id: 'owner', type: 'custom' }];
  savedRows = Array.from({ length: 1702 }, (_, index) => ({ id: `saved-${index}`, binder_id: 'bulk', card_id: `card-${index}`, set_id: null, owned: true }));
  for (const cap of [50, 17]) {
    pageCap = cap; savedReads = 0;
    const bulk = await exports.fetchBinderFactsSnapshot(bulkBinder, 'owner');
    assert.equal(bulk.counts.bulk.total, 1702); assert.equal(bulk.counts.bulk.owned, 1702);
    assert.equal(bulk.priceInputs.length, 1702, 'Valuation retains all saved cards beyond 50 rows');
    assert.equal(savedReads, Math.ceil(1702 / cap) + 1);
    assert.equal(authListeners.size, 0);
  }
  savedReads = 0; failSavedPage = 3;
  await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner'), /later page failed/); failSavedPage = -1;
  repeatSaved = true; await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner'), /identities/); repeatSaved = false;
  foreignSaved = true; await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner'), /identities/); foreignSaved = false;
  afterSavedPage = () => { accountIdRef.current = 'other-owner'; }; savedReads = 0;
  await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner'), /cancelled/); assert.equal(savedReads, 1); accountIdRef.current = 'owner';
  afterSavedPage = () => { for (const listener of authListeners) { listener('SIGNED_IN', { user: { id: 'other-owner' } }); listener('SIGNED_IN', { user: { id: 'owner' } }); } };
  savedReads = 0; await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner'), /cancelled/); assert.equal(savedReads, 1);
  const factsAbort = new AbortController(); afterSavedPage = () => factsAbort.abort(); savedReads = 0;
  await assert.rejects(exports.fetchBinderFactsSnapshot(bulkBinder, 'owner', factsAbort.signal), /cancelled/); assert.equal(savedReads, 1); afterSavedPage = null;
  assert.equal(authListeners.size, 0);
  await assert.rejects(exports.fetchBinderFactsSnapshot([{ ...bulkBinder[0], user_id: 'foreign' }], 'owner'), /account changed/);
  pageCap = 17; savedRows = [];
  catalogueRows = Array.from({ length: 113 }, (_, index) => ({ id: `official-${index}`, set_id: 'base1', language: 'en', name: `Card ${index}` }));
  variantRows = catalogueRows.map(row => ({ id: `variant-${row.id}`, user_id: 'owner', card_id: row.id, set_id: 'base1', variant: 'normal' }));
  const masterBinder = [{ id: 'master', user_id: 'owner', type: 'official', source_set_id: 'base1', language: 'en', master_set_enabled: true }];
  const master = await exports.fetchBinderFactsSnapshot(masterBinder, 'owner');
  assert.equal(master.counts.master.total, 113, 'Every master-set card is read under smaller API caps');
  assert.equal(master.counts.master.owned, 113, 'Every owned variant remains available beyond 50 rows');
  failCataloguePage = 17;
  const incompleteMaster = await exports.fetchBinderFactsSnapshot(masterBinder, 'owner');
  assert.equal(incompleteMaster.counts.master.total, null, 'A later optional catalogue failure cannot claim a complete master-set total');
  assert.equal(incompleteMaster.counts.master.totalKnown, false);
  console.log('Binder library actual-function regressions passed: failure/denial/no-quote distinction, retained values, cancellation/deadline guards and canonical language-scoped totals.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
