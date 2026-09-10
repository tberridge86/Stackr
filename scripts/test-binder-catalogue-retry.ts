import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cache from '../lib/requestCache';
import * as identity from '../lib/binderCardIdentity';
import * as presentation from '../lib/binderCataloguePresentation';

async function main() {
  cache.invalidateRequestCache();
  const saved = [1, 2, 3].map(n => ({ id: `saved-${n}`, binder_id: 'binder', card_id: `swsh7-${n}`,
    set_id: 'swsh7', language: 'en', card_number: String(n), owned: n === 1, owned_quantity: 2 }));
  const binder = { id: 'binder', type: 'official', source_set_id: 'swsh7', language: 'en', name: 'Evolving Skies' };
  const set = { id: 'canonical-set', language: 'en', name: 'Evolving Skies', total: 237, printedTotal: 203,
    externalIds: { setCode: 'swsh7' }, images: {} };
  let cardReads = 0;
  let setReads = 0;
  const supabase = { from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, order: () => q,
      maybeSingle: async () => ({ data: binder, error: null }),
      then: (resolve: any) => { assert.equal(table, 'binder_cards'); return Promise.resolve({ data: saved, error: null }).then(resolve); } };
    return q;
  } };
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase }, './requestCache': cache,
    './pokemonTcg': { normalizePokemonCardLanguage: () => 'en', fetchCardsForSet: async (id: string, options: any) => {
      assert.equal(id, set.id); assert.equal(options.preferCanonicalApi, true);
      assert.equal(options.minimumCardCount, 237);
      if (++cardReads === 1) return Array.from({ length: 3 }, (_, n) => ({ id: `swsh7-${n + 1}`, number: String(n + 1), name: `Partial ${n + 1}` }));
      return Array.from({ length: 237 }, (_, n) => ({ id: `swsh7-${n + 1}`, number: String(n + 1), name: `Card ${n + 1}` }));
    } },
    './stackrDomainAdapter': { fetchStackrSet: async (id: string, lang: string, options: any) => {
      setReads++; assert.equal(id, 'swsh7'); assert.equal(lang, 'en'); assert.equal(options.includeAssets, false); return set;
    }, fetchPreferredStackrSets: () => { throw new Error('Must not fetch every set to open one binder'); } },
    './pokemonSetIdentity': { stripPokemonSetLanguagePrefix: (s: string) => s },
    './binderSetIdentity': { resolveBinderSetIdentity: () => ({ status: 'resolved', language: 'en', setId: set.id }) },
    './binderCardIdentity': identity, './binderCataloguePresentation': presentation,
    './providerSetMarkRuntimePolicy': { enforceSetVisualRuntimePolicy: () => null },
    './pokemonDisplayNames': { getPreferredSetDisplayName: () => set.name },
  };
  const source = fs.readFileSync('lib/binders.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console });
  const partial = await exports.fetchBinderCards('binder', { includePrices: false });
  assert.equal(partial.length, 3);
  assert.equal(partial[0].card.name, 'Partial 1', 'real partial catalogue rows stay visible');
  assert.equal(partial[0].catalogue_incomplete, true, 'the screen can explain the incomplete result');
  const recovered = await exports.fetchBinderCards('binder', { includePrices: false });
  assert.equal(recovered.length, 237);
  assert.equal(recovered.filter((row: any) => row.owned).length, 1, 'virtual catalogue cards must remain unowned');
  assert.equal(recovered[0].owned_quantity, 2);
  assert.equal((await exports.fetchBinderCards('binder', { includePrices: false })).length, 237);
  assert.equal(cardReads, 2); assert.equal(setReads, 1);
  console.log('Evolving Skies retries an undersized three-card response, restores 237 slots, preserves ownership and caches recovery.');
}
void main();
