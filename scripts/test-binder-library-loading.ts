import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import * as requestCache from '../lib/requestCache';

async function main() {
  requestCache.invalidateRequestCache();
  let accountId: string | null = 'owner-a';
  let savedReads = 0;
  let catalogueReads = 0;
  let releaseCatalogue!: (rows: unknown[]) => void;
  const catalogue = new Promise<unknown[]>((resolve) => { releaseCatalogue = resolve; });
  const saved = (userId: string) => ({
    id: `binder-${userId}`, user_id: userId, type: 'official', source_set_id: 'base1',
    language: 'en', name: 'Saved binder', source_set_logo_url: 'https://assets.example/saved-logo.png',
  });
  const supabase = {
    auth: { getSession: async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null }) },
    from: (table: string) => {
      assert.equal(table, 'binders');
      let selectedUser = '';
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { assert.equal(column, 'user_id'); selectedUser = value; return query; },
        order: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          savedReads += 1;
          return Promise.resolve({ data: [saved(selectedUser), saved('unrelated')], error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase },
    './requestCache': requestCache,
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
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console });

  const enriched = exports.fetchBinders();
  // Give the metadata request time to begin, then read the saved cache independently.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  const fast = await exports.fetchBinders({ enrich: false });
  assert.equal(catalogueReads, 1);
  assert.equal(savedReads, 1, 'saved and enriched readers share a database request');
  assert.deepEqual(JSON.parse(JSON.stringify(fast)), [saved('owner-a')]);
  accountId = 'owner-b';
  const other = await exports.fetchBinders({ enrich: false });
  assert.equal(other[0].user_id, 'owner-b');
  assert.equal(savedReads, 2, 'another account must not reuse the previous private cache');
  accountId = null;
  assert.equal((await exports.fetchBinders({ enrich: false })).length, 0);
  releaseCatalogue([]);
  await enriched;
  console.log('Saved binder loading bypasses deferred catalogue enrichment and isolates account caches.');
}

void main();
