import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import * as requestCache from '../lib/requestCache';

async function main() {
  requestCache.invalidateRequestCache();
  let priceReads = 0;
  const saved = { id: 'saved', binder_id: 'binder', card_id: 'base1-1', language: 'en', owned: true,
    owned_quantity: 2, card_name: 'Charizard', image_url: 'https://images.example/card.webp' };
  const supabase = { from: (table: string) => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: { id: 'binder', type: 'custom', language: 'en' }, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        assert.equal(table, 'binder_cards');
        return Promise.resolve({ data: [saved], error: null }).then(resolve);
      },
    };
    return query;
  } };
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase }, './requestCache': requestCache,
    './pokemonTcg': { normalizePokemonCardLanguage: () => 'en' },
    './stackrDomainAdapter': { fetchStackrPriceSnapshots: async () => {
      priceReads += 1;
      return new Map([['base1-1', { market_central: 20, snapshot_at: '2026-09-08' }]]);
    } },
  };
  const source = fs.readFileSync(new URL('../lib/binders.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console });
  const fast = await exports.fetchBinderCards('binder', { includePrices: false });
  assert.equal(priceReads, 0, 'Home catalogue reads must not price every binder slot.');
  assert.equal(fast[0].owned_quantity, 2);
  assert.equal(fast[0].card.images.small, saved.image_url);
  const priced = await exports.fetchBinderCards('binder');
  assert.equal(priceReads, 1, 'Existing callers still receive price enrichment.');
  assert.equal(priced[0].tcg_price, 20);
  assert.equal((await exports.fetchBinderCards('binder', { includePrices: false }))[0].tcg_price, undefined,
    'Priced and unpriced readers must not contaminate one another.');
  assert.equal(priceReads, 1);
  console.log('Home bypasses redundant binder pricing while preserving ownership, images and existing callers.');
}
void main();
