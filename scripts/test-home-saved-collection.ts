import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const binder = { id: 'binder-a', user_id: 'owner-a', type: 'official', source_set_id: 'base1' };
let fail = false;
let wrongAccount = false;
const reads: [number, number][] = [];
const saved = Array.from({ length: 1702 }, (_, index) => ({
  id: `card-${index}`, binder_id: binder.id, card_id: `card-${index}`, owned: index < 1323,
}));
const query: any = {
  select: () => query,
  in: (column: string, ids: string[]) => { assert.equal(column, 'binder_id'); assert.deepEqual(Array.from(ids), ['binder-a']); return query; },
  order: () => query,
  range: async (from: number, to: number) => {
    reads.push([from, to]);
    return { data: saved.slice(from, to + 1), error: fail ? new Error('read failed') : null };
  },
};
const dependencies: Record<string, unknown> = {
  './binders': { fetchBinders: async (options: unknown) => {
    assert.equal((options as { enrich: boolean }).enrich, false, 'Home must not wait for catalogue branding');
    return [{ ...binder, user_id: wrongAccount ? 'owner-b' : binder.user_id }];
  } },
  './ownership': { fetchOwnedCardRows: async () => [{ user_id: 'owner-a', card_id: 'owned-outside-binder', quantity: 2 }] },
  './supabase': { supabase: { from: (table: string) => {
    assert.equal(table, 'binder_cards', 'Saved collection loading must not request catalogue or price tables');
    return query;
  } } },
};
const source = ts.transpileModule(fs.readFileSync('lib/homeSavedCollection.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exported: any = {};
vm.runInNewContext(source, { exports: exported, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
} });

async function main() {
  const collection = await exported.fetchHomeSavedCollection('owner-a');
  assert.equal(collection.cardsByBinder.get('binder-a').length, 1702, 'All saved rows survive the default database page limit');
  assert.equal(collection.ownedRows[0].card_id, 'owned-outside-binder', 'Standalone ownership is retained');
  assert.deepEqual(reads, [[0, 999], [1000, 1999]]);
  assert.equal(exported.savedBinderCatalogueTotal(binder, saved), 0, 'Saved rows alone cannot prove full-set completion');
  assert.equal(exported.savedBinderCatalogueTotal(binder, [{ set_total: 102 }]), 102);
  fail = true;
  await assert.rejects(exported.fetchHomeSavedCollection('owner-a'), /read failed/, 'Read failure must not become an empty collection');
  fail = false;
  wrongAccount = true;
  const before = reads.length;
  await assert.rejects(exported.fetchHomeSavedCollection('owner-a'), /account changed/);
  assert.equal(reads.length, before, 'An account mismatch must stop before loading another account’s cards');
  console.log('Home saved collection pagination, account boundaries and independent data loading passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
