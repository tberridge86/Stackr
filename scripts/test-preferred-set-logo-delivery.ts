import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { preferNonEmptyCatalogueRows } from '../lib/resilientCatalogueRead';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

// Execute the actual adapter entry and manifest/merge functions. Only network
// facts and transport are fixtures; the includeAssets decision is production code.
const file = 'lib/stackrDomainAdapter.ts';
const source = readFileSync(file, 'utf8');
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true);
const names = ['fetchPreferredStackrSets', 'fetchCanonicalSetAssetRows', 'applyCanonicalSetAssets', 'allPages', 'assetUrl', 'firstAsset'];
const selected = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(selected.length, names.length);
const compiled = ts.transpileModule(selected.map((node) => node.getText(tree)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const facts = [{ id: 'tc-a', name: 'Native facts', language: 'zh-tw', images: {} }, { id: 'tc-b', name: 'Retained logo', language: 'zh-tw', images: { logo: 'retained.png' } }];

async function run() {
  const requests: { assetType: string; signal: AbortSignal; response: ReturnType<typeof deferred<any>> }[] = [];
  const client = { assetManifest: (query: any, init: any) => {
    const response = deferred<any>(); requests.push({ assetType: query.assetType, signal: init.signal, response }); return response.promise;
  } };
  const exports: any = {};
  runInNewContext(compiled, { exports, stackrApiClient: client, Promise, Map, Set, Array, String, Number, Object,
    PREFERRED_CATALOGUE_READ_TIMEOUT_MS: 7000, preferNonEmptyCatalogueRows, readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted,
    clean: (value?: string | null) => value?.trim() || null,
    fetchCanonicalStackrSets: async (_language: unknown, _client: unknown, includeAssets: boolean) => { assert.equal(includeAssets, false); return facts; },
    legacySets: () => { throw new Error('Valid preferred facts must not need a legacy fallback'); },
  });
  const plain = await exports.fetchPreferredStackrSets('zh-tw', client, { includeAssets: false });
  assert.equal(plain, facts, 'an explicit facts read remains immediate and unchanged');
  assert.equal(requests.length, 0, 'a facts-only read must not start any manifest transport');

  let settled = false;
  const pending = exports.fetchPreferredStackrSets('zh-tw', client).then((rows: any[]) => { settled = true; return rows; });
  await tick();
  assert.equal(requests.length, 4, 'the default artwork-capable reader must request existing set assets instead of silently returning facts');
  assert.equal(settled, false, 'default artwork enrichment is still pending while its manifest is unresolved');
  for (const request of requests) request.response.resolve({ data: { assets: request.assetType === 'set_logo'
    ? [{ assetType: 'set_logo', setId: 'tc-a', deliveryUrl: 'approved-tc-a.png' }, { assetType: 'set_logo', setId: 'other', deliveryUrl: 'wrong-other.png' }]
    : [] }, meta: { pagination: { nextCursor: null } } });
  const enriched = await pending;
  assert.equal(enriched[0].images.logo, 'approved-tc-a.png', 'approved exact-set logo reaches the actual adapter result');
  assert.equal(enriched[0].name, facts[0].name, 'artwork does not replace factual identity');
  assert.equal(enriched[1].images.logo, 'retained.png', 'missing optional assets must preserve a usable existing mark');
  assert.ok(requests.every((request) => !request.signal.aborted), 'successful optional reads do not cancel completed transport');
  console.log('Preferred set logos: explicit facts remain non-blocking; default requests assets and merges only exact set marks while preserving existing logos.');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
