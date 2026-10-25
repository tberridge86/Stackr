import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

// Run the merged production functions, retaining their request bounds and
// optional-page recovery rather than substituting a second pagination algorithm.
const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const names = ['allPages', 'readOptionalAssetPages', 'fetchStackrAssetsForPrinting'];
const nodes = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(nodes.length, names.length);
const code = ts.transpileModule(nodes.map(node => node.getText(tree)).join('\n')
  + '\nexport { allPages, readOptionalAssetPages, fetchStackrAssetsForPrinting };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports: any = {};
runInNewContext(code, { exports, readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted });

async function main() {
  const population = Array.from({ length: 32_000 }, (_, index) => ({ assetId: `asset-${index}` }));
  let calls = 0;
  const client = { assetManifest: async (query: any, init: any) => {
    calls++;
    assert.equal(query.printingId, 'printing');
    assert.equal(query.limit, 50, 'Every actual image request remains bounded to 50.');
    assert.ok(init.signal instanceof AbortSignal);
    const offset = Number(query.cursor ?? 0);
    const assets = population.slice(offset, offset + query.limit);
    return { data: { assets }, meta: { pagination: { nextCursor: offset + assets.length < population.length
      ? String(offset + assets.length) : null } } };
  } };
  const assets = await exports.fetchStackrAssetsForPrinting(client, 'printing');
  assert.equal(calls, 640, 'The prior 32,000-row capacity survives smaller pages.');
  assert.deepEqual(Array.from(assets, (asset: any) => asset.assetId), population.map(asset => asset.assetId));

  let partialCalls = 0;
  const partial = await exports.fetchStackrAssetsForPrinting({ assetManifest: async (...args: any[]) => {
    if (++partialCalls === 71) throw new Error('Late optional page unavailable');
    return (client.assetManifest as any)(...args);
  } }, 'printing');
  assert.equal(partialCalls, 71);
  assert.deepEqual(Array.from(partial, (asset: any) => asset.assetId), population.slice(0, 3500).map(asset => asset.assetId),
    'A late optional failure retains all completed pages beyond the former 64-page cutoff.');

  await assert.rejects(exports.allPages(async () => ({ rows: [], nextCursor: 'repeat' })), /cursor repeated/);
  await assert.rejects(exports.allPages(async () => ({ rows: Array(32_001).fill(null), nextCursor: null })), /row budget/);
  let emptyPages = 0;
  await assert.rejects(exports.allPages(async () => ({ rows: [], nextCursor: String(++emptyPages) })), /page budget/);
  assert.equal(emptyPages, 640, 'Empty pages cannot evade the finite request budget.');
  const controller = new AbortController();
  let published = 0;
  await assert.rejects(exports.allPages(async () => {
    controller.abort(new Error('Left screen'));
    return { rows: population.slice(0, 50), nextCursor: null };
  }, controller.signal, () => { published++; }), /Left screen/);
  assert.equal(published, 0, 'A transport that ignores abort cannot publish a late page.');
  console.log('Integrated artwork pagination: 32,000 identities across 640 bounded requests, completed-page recovery, cursor/row/page limits and late cancellation pass.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
