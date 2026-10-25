import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import * as requestCache from '../lib/requestCache';
import * as optionalCatalogueEnrichment from '../lib/optionalCatalogueEnrichment';
import { withPersonalDataReadTimeout } from '../lib/personalDataRead';

async function main() {
  requestCache.invalidateRequestCache();
  let accountId: string | null = 'owner-a';
  let savedReads = 0;
  let catalogueReads = 0;
  let paginationCount = 0;
  let serverCap = 50;
  let failLaterPage = false;
  let repeatLaterPage = false;
  let foreignOwner = false;
  let stallPage = false;
  let changeDuringPage = false;
  let switchBackDuringPage = false;
  const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const setAccount = (id: string | null) => {
    accountId = id;
    for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null);
  };
  let releaseCatalogue!: (rows: unknown[]) => void;
  const catalogue = new Promise<unknown[]>((resolve) => { releaseCatalogue = resolve; });
  const saved = (userId: string) => ({
    id: `binder-${userId}`, user_id: userId, type: 'official', source_set_id: 'base1',
    language: 'en', name: 'Saved binder', source_set_logo_url: 'https://assets.example/saved-logo.png',
  });
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null }),
      onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
        listeners.add(listener);
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      },
    },
    from: (table: string) => {
      assert.equal(table, 'binders');
      let selectedUser = '';
      let pageFrom = 0, pageTo = 999;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { assert.equal(column, 'user_id'); selectedUser = value; return query; },
        order: () => query,
        abortSignal: () => query,
        range: (from: number, to: number) => { assert.ok(to - from + 1 <= 50); pageFrom = from; pageTo = to; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          savedReads += 1;
          if (stallPage) return new Promise(() => {});
          if (changeDuringPage) {
            setAccount('owner-b');
            if (switchBackDuringPage) setAccount('owner-a');
          }
          const start = repeatLaterPage ? 0 : pageFrom;
          const count = Math.min(serverCap, pageTo - pageFrom + 1);
          const rows = paginationCount
            ? Array.from({ length: Math.max(0, Math.min(count, paginationCount - start)) }, (_, index) => ({ ...saved(selectedUser), id: `binder-${start + index}` }))
            : [saved(foreignOwner ? 'unrelated' : selectedUser)].slice(start, start + count);
          if (failLaterPage && pageFrom > 0) return Promise.resolve({ data: null, error: new Error('later saved page failed') }).then(resolve);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase },
    './requestCache': requestCache,
    './personalDataRead': {
      withPersonalDataReadTimeout: (read: (signal: AbortSignal) => PromiseLike<unknown>, options: { signal?: AbortSignal }) =>
        withPersonalDataReadTimeout(read, { ...options, ...(stallPage ? { timeoutMs: 1 } : {}) }),
    },
    './optionalCatalogueEnrichment': optionalCatalogueEnrichment,
    './stackrDomainAdapter': {
      fetchPreferredStackrSets: () => { catalogueReads += 1; return catalogue; },
      fetchStackrSet: () => { catalogueReads += 1; return catalogue.then(rows => rows[0] ?? null); },
    },
    './pokemonSetIdentity': { stripPokemonSetLanguagePrefix: (value: string) => value },
    './binderSetIdentity': { resolveBinderSetIdentity: () => ({ status: 'unresolved', language: 'en' }) },
    './binderCataloguePresentation': { positiveCatalogueCount: () => null },
  };
  const source = fs.readFileSync(new URL('../lib/binders.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console, AbortController });

  const enriched = exports.fetchBinders();
  const cancelledEnrichment = assert.rejects(enriched, { name: 'AbortError' });
  // Give the metadata request time to begin, then read the saved cache independently.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  const fast = await exports.fetchBinders({ enrich: false });
  assert.equal(catalogueReads, 1);
  assert.equal(savedReads, 2, 'saved and enriched readers share a database request');
  assert.deepEqual(JSON.parse(JSON.stringify(fast)), [saved('owner-a')]);
  setAccount('owner-b');
  const other = await exports.fetchBinders({ enrich: false });
  assert.equal(other[0].user_id, 'owner-b');
  assert.equal(savedReads, 4, 'another account must not reuse the previous private cache');
  setAccount(null);
  assert.equal((await exports.fetchBinders({ enrich: false })).length, 0);
  releaseCatalogue([]);
  await cancelledEnrichment;
  assert.equal(listeners.size, 0, 'all completed readers release account subscriptions');
  requestCache.invalidateRequestCache();
  accountId = 'owner-a';
  paginationCount = 1702;
  const beforePagination = savedReads;
  const fullLibrary = await exports.fetchBinders({ enrich: false });
  assert.equal(fullLibrary.length, 1702, 'preloading must not silently stop at the default 1000-row server page');
  assert.equal(new Set(fullLibrary.map((row: { id: string }) => row.id)).size, 1702, 'all fetched binder identities stay distinct');
  assert.equal(savedReads - beforePagination, 36, 'binder-list retrieval uses 50-row pages plus a definitive empty page');
  requestCache.invalidateRequestCache();
  paginationCount = 137; serverCap = 17;
  const beforeLowerCap = savedReads;
  const lowerCapLibrary = await exports.fetchBinders({ enrich: false });
  assert.equal(lowerCapLibrary.length, 137, 'a short server page is not a complete library');
  assert.equal(savedReads - beforeLowerCap, 10);
  requestCache.invalidateRequestCache(); failLaterPage = true;
  await assert.rejects(exports.fetchBinders({ enrich: false }), /later saved page failed/, 'later failures cannot cache a partial library');
  failLaterPage = false; repeatLaterPage = true;
  requestCache.invalidateRequestCache();
  await assert.rejects(exports.fetchBinders({ enrich: false }), /repeated an identity/);
  repeatLaterPage = false; paginationCount = 0; foreignOwner = true;
  requestCache.invalidateRequestCache();
  await assert.rejects(exports.fetchBinders({ enrich: false }), /requested account/, 'foreign rows cannot become an empty library');
  foreignOwner = false; changeDuringPage = true; paginationCount = 137;
  requestCache.invalidateRequestCache();
  const readsBeforeSwitch = savedReads;
  await assert.rejects(exports.fetchBinders({ enrich: false }), { name: 'AbortError' });
  assert.equal(savedReads - readsBeforeSwitch, 1, 'account changes stop later pages');
  setAccount('owner-a'); switchBackDuringPage = true;
  requestCache.invalidateRequestCache();
  await assert.rejects(exports.fetchBinders({ enrich: false }), { name: 'AbortError' }, 'A -> B -> A does not resurrect the old read');
  assert.equal(listeners.size, 0, 'failed readers release account subscriptions');
  changeDuringPage = false; switchBackDuringPage = false;
  const fresh = await exports.fetchBinders({ enrich: false });
  assert.equal(fresh.length, 137, 'cancelled reads do not cache partial data');
  requestCache.invalidateRequestCache(); stallPage = true;
  await assert.rejects(exports.fetchBinders({ enrich: false }), { name: 'PersonalDataReadTimeoutError' }, 'stalled directory reads settle instead of returning empty ownership');
  assert.equal(listeners.size, 0, 'timed out directory readers release account subscriptions');
  stallPage = false;
  assert.equal((await exports.fetchBinders({ enrich: false })).length, 137, 'timeout does not cache a partial directory');
  requestCache.invalidateRequestCache(); paginationCount = 256_001; serverCap = 50;
  await assert.rejects(exports.fetchBinders({ enrich: false }), /row budget/, 'directory reads have a hard logical row budget');
  console.log('Saved binder loading uses complete 50-row pages, rejects incomplete refreshes and isolates account caches.');
}

void main();
