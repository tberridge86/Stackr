import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as personalDataRead from '../lib/personalDataRead';
import * as uiCollectionPages from '../lib/uiCollectionPages';
import * as requestCache from '../lib/requestCache';

const binder = { id: 'binder-a', user_id: 'owner-a', type: 'official', source_set_id: 'base1' };
const saved = Array.from({ length: 1702 }, (_, index) => ({
  id: `card-${index}`, binder_id: binder.id, card_id: `card-${index}`, owned: index < 1323,
}));
let failAt = -1, serverCap = 500;
let wrongAccount = false, duplicate = false, foreign = false, malformed = false;
let currentAccount = 'owner-a';
let afterPage: (() => void) | null = null;
let pendingOwnership: Promise<unknown> | null = null;
const listeners = new Set<(...args: any[]) => void>();
const reads: [number, number][] = [];
const dependencies: Record<string, unknown> = {
  './collectionSummaryInvalidation': { getCollectionSummaryVersion: () => 0 },
  './requestCache': requestCache,
  './personalDataRead': personalDataRead, './uiCollectionPages': uiCollectionPages,
  './binders': { fetchBinders: async (options: { enrich: boolean }) => {
    assert.equal(options.enrich, false);
    return [{ ...binder, user_id: wrongAccount ? 'owner-b' : binder.user_id }, { ...binder, id: 'empty-binder' }];
  } },
  './ownership': { fetchOwnedCardRows: async (options: { pageSize: number }) => {
    assert.equal(options.pageSize, 500, 'Home opts into the larger ownership page budget');
    return pendingOwnership ?? [{ user_id: 'owner-a', card_id: 'owned-outside-binder', quantity: 2 }];
  } },
  './supabase': { supabase: { auth: {
    getSession: async () => ({ data: { session: { user: { id: currentAccount } } }, error: null }),
    onAuthStateChange: (listener: (...args: any[]) => void) => {
      listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
  }, from: (table: string) => {
    assert.equal(table, 'binder_cards', 'Saved collection loading does not fetch catalogue or prices');
    let from = 0, to = 49;
    const query: any = {
      select: () => query,
      in: (column: string, ids: string[]) => { assert.equal(column, 'binder_id'); assert.ok(ids.length <= 50); return query; },
      order: (column: string, options: any) => { assert.equal(column, 'id'); assert.equal(options.ascending, true); return query; },
      range: (start: number, end: number) => { from = start; to = end; assert.equal(end - start, 499); return query; },
      abortSignal: (signal: AbortSignal) => { assert.equal(signal.aborted, false); return query; },
      then: (resolve: (value: unknown) => unknown) => {
        reads.push([from, to]);
        let rows = saved.slice(from, Math.min(to + 1, from + serverCap));
        if (from && duplicate) rows = [saved[0]];
        if (foreign) rows = [{ ...saved[0], binder_id: 'not-requested' }];
        if (malformed) rows = null as any;
        afterPage?.();
        return Promise.resolve({ data: rows, error: reads.length === failAt ? new Error('later page failed') : null }).then(resolve);
      },
    }; return query;
  } } },
};
const cacheExports: any = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/homeSavedCollectionCache.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: cacheExports, require: (name: string) => dependencies[name], AbortController });
dependencies['./homeSavedCollectionCache'] = cacheExports;
const source = ts.transpileModule(fs.readFileSync('lib/homeSavedCollection.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported: any = {};
vm.runInNewContext(source, { exports: exported, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
}, AbortController });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function main() {
  let releaseOwnership!: (value: unknown) => void;
  pendingOwnership = new Promise(resolve => { releaseOwnership = resolve; });
  const readyBinders: { rows: any[] } = { rows: [] };
  const loading = exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true, onBindersReady: (rows: any[]) => { readyBinders.rows = rows; } });
  await tick();
  assert.equal(readyBinders.rows[0]?.id, 'binder-a', 'Binder preload starts before stalled ownership');
  assert.ok(reads.length > 0, 'saved paging overlaps stalled required ownership');
  releaseOwnership([{ user_id: 'owner-a', card_id: 'owned-outside-binder', quantity: 2 }]);
  await loading; pendingOwnership = null;
  for (const cap of [500, 100, 50, 17]) {
    serverCap = cap; reads.length = 0;
    const collection = await exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true });
    assert.equal(collection.cardsByBinder.get('binder-a').length, 1702);
    assert.equal(collection.cardsByBinder.get('empty-binder').length, 0);
    assert.equal(collection.ownedRows[0].card_id, 'owned-outside-binder');
    assert.equal(reads.length, Math.ceil(1702 / cap) + 1, 'An empty page proves exhaustion even under a smaller server cap');
    assert.ok(listeners.size <= 1, 'only the bounded idle facts cache may retain an auth observer');
  }
  assert.equal(exported.savedBinderCatalogueTotal(binder, saved), 0);
  assert.equal(exported.savedBinderCatalogueTotal(binder, [{ set_total: 102 }]), 102);
  serverCap = 500;
  reads.length = 0; failAt = 3;
  await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /later page failed/); failAt = -1;
  duplicate = true; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /identities/); duplicate = false;
  foreign = true; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /identities/); foreign = false;
  malformed = true; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /incomplete/); malformed = false;
  wrongAccount = true; const before = reads.length; let unsafePreload = false;
  await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true, onBindersReady: () => { unsafePreload = true; } }), /account changed/);
  assert.equal(unsafePreload, false); assert.equal(reads.length, before); wrongAccount = false;
  afterPage = () => { currentAccount = 'owner-b'; };
  reads.length = 0; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /account changed/); assert.equal(reads.length, 1);
  currentAccount = 'owner-a';
  afterPage = () => { for (const listener of listeners) { listener('SIGNED_IN', { user: { id: 'owner-b' } }); listener('SIGNED_IN', { user: { id: 'owner-a' } }); } };
  reads.length = 0; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true }), /cancelled/); assert.equal(reads.length, 1);
  const abort = new AbortController(); afterPage = () => abort.abort();
  reads.length = 0; await assert.rejects(exported.fetchHomeSavedCollection('owner-a', { forceRefresh: true, signal: abort.signal }), /cancelled/);
  await tick(); assert.equal(reads.length, 1); assert.equal(listeners.size, 0);
  afterPage = null;
  cacheExports.invalidateHomeSavedFacts();
  assert.equal(listeners.size, 0);
  console.log('Home saved collection: 1702 rows, lower caps, empty binders, early preload, later failures, foreign/duplicate/malformed rows, account switch, ABA and cancellation passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
