import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { reconcilePublishedSetAssets } from './reconcile-published-set-assets.mjs';

const hash = 'a'.repeat(64);
const row = { setId: 'set-a', setCode: 'A', language: 'ja',
  storageKey: `public/set_logo/aa/aa/${hash}/original.png` };
const original = 'https://assets.stackrtcg.com/recorded/fixture-original.png';
const detail = 'https://assets.stackrtcg.com/recorded/fixture-detail.webp?revision=1';
const asset = { assetId: 'asset-a', setId: row.setId, assetType: 'set_logo',
  permissionStatus: 'approved', contentSha256: hash, deliveryUrl: original,
  unavailableReason: null, derivatives: [{ role: 'detail-page', deliveryUrl: detail }] };
const page = (assets, nextCursor = null) => ({
  sourceEnvironment: 'production', source: 'Synthetic recorded manifest fixture',
  data: { assets }, meta: { requestId: 'fixture-read', generatedAt: '2026-11-01T19:17:52.795Z', pagination: { nextCursor } },
});
const snapshot = { observedAt: '2026-09-13', logos: [row] };
const before = JSON.stringify({ snapshot, asset });
const result = reconcilePublishedSetAssets(snapshot, [page([asset])], 'logos');
assert.equal(result.report.matched, 1);
assert.equal(result.snapshot.logos[0].deliveryUrl, original);
assert.equal(result.snapshot.logos[0].detailUrl, detail);
assert.equal(result.snapshot.logos[0].storageKey, row.storageKey, 'legacy rollback pointer is preserved');
assert.equal(JSON.stringify({ snapshot, asset }), before, 'evidence and original identity records remain immutable');

for (const invalid of [
  { ...asset, setId: 'another-set' },
  { ...asset, assetType: 'card_image' },
  { ...asset, contentSha256: 'b'.repeat(64) },
  { ...asset, permissionStatus: 'denied' },
  { ...asset, unavailableReason: 'not-published' },
  { ...asset, deliveryUrl: 'https://unverified.example/original.png' },
  { ...asset, deliveryUrl: 'https://user:password@assets.stackrtcg.com/original.png' },
]) {
  const unmatched = reconcilePublishedSetAssets(snapshot, [page([invalid])], 'logos');
  assert.equal(unmatched.report.matched, 0, 'only exact approved published originals may update a mapping');
  assert.equal(unmatched.snapshot.logos[0].deliveryUrl, undefined);
}
const noDetail = reconcilePublishedSetAssets(snapshot, [page([{ ...asset,
  derivatives: [{ role: 'card-grid', deliveryUrl: detail }, { role: 'detail-page', deliveryPath: '/guessed.webp' }],
}])], 'logos');
assert.equal(noDetail.snapshot.logos[0].detailUrl, undefined, 'no rendition URL is constructed from a path');
const noLongerApproved = reconcilePublishedSetAssets(result.snapshot,
  [page([{ ...asset, permissionStatus: 'denied' }])], 'logos');
assert.equal(noLongerApproved.snapshot.logos[0].deliveryUrl, undefined,
  'a new capture cannot silently re-certify an old mapping absent from its eligible rows');
const ambiguous = reconcilePublishedSetAssets(snapshot, [page([asset, { ...asset,
  assetId: 'asset-b', deliveryUrl: 'https://assets.stackrtcg.com/other-recorded-original.png',
}])], 'logos');
assert.equal(ambiguous.report.unresolved[0].reason, 'ambiguous_published_delivery');
assert.throws(() => reconcilePublishedSetAssets(snapshot, [page([asset], 'more')], 'logos'), /continuation/);
assert.throws(() => reconcilePublishedSetAssets(snapshot, [{ ...page([asset]), meta: {} }], 'logos'), /request ID/);
assert.throws(() => reconcilePublishedSetAssets(snapshot, [{ ...page([asset]), sourceEnvironment: 'staging' }], 'logos'), /production source/);

const replacementAsset = { ...asset, assetId: 'reviewed-new-asset', contentSha256: 'b'.repeat(64),
  deliveryUrl: 'https://assets.stackrtcg.com/recorded/reviewed-replacement.png', derivatives: [] };
const supersession = { setId: row.setId, assetType: 'set_logo', previousContentSha256: hash,
  assetId: replacementAsset.assetId, contentSha256: replacementAsset.contentSha256,
  deliveryUrl: replacementAsset.deliveryUrl, captureRequestId: 'fixture-read', captureGeneratedAt: page([]).meta.generatedAt };
const replaced = reconcilePublishedSetAssets(snapshot, [page([replacementAsset])], 'logos', [supersession]);
assert.equal(replaced.report.superseded, 1);
assert.equal(replaced.snapshot.logos[0].deliveryUrl, replacementAsset.deliveryUrl);
assert.equal(replaced.snapshot.logos[0].supersedesContentSha256, hash);
assert.equal(replaced.snapshot.logos[0].storageKey, row.storageKey, 'superseded original remains a rollback pointer');
assert.throws(() => reconcilePublishedSetAssets(snapshot, [page([replacementAsset])], 'logos',
  [{ ...supersession, previousContentSha256: 'c'.repeat(64) }]), /previous hash/);
assert.throws(() => reconcilePublishedSetAssets(snapshot, [page([replacementAsset])], 'logos',
  [{ ...supersession, captureRequestId: 'unrelated-capture' }]), /exact captured evidence/);
assert.equal(reconcilePublishedSetAssets(snapshot, [page([replacementAsset])], 'logos',
  [{ ...supersession, assetId: 'another-asset' }]).report.matched, 0,
  'the explicit supersession cannot authorize a different asset of the same set');

const coverRow = { setId: 'cover-a', setCode: 'pack-a',
  storageKey: `public/sealed_product_image/aa/aa/${hash}/original.jpg` };
const coverResult = reconcilePublishedSetAssets({ covers: [coverRow] }, [page([{ ...asset,
  setId: 'cover-a', assetType: 'sealed_product_image',
}])], 'covers');
assert.equal(coverResult.report.matched, 1);
assert.equal(coverResult.snapshot.covers[0].detailUrl, undefined, 'cover presentation does not borrow logo sizing');

const sourcePath = process.argv[2] ?? fileURLToPath(new URL('../lib/publishedSetLogoFallbacks.ts', import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function load(environment) {
  const module = { exports: {} };
  const dependencies = {
    './generated/publishedSetLogos.generated.json': result.snapshot,
    './generated/publishedSimplifiedChineseCovers.generated.json': coverResult.snapshot,
    './mobileRuntimeConfig': { MOBILE_RUNTIME_CONFIG: { environment, supabaseUrl: 'https://staging.example' } },
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const production = load('production');
assert.equal(production.getPublishedSetLogoFallback({ id: row.setId, language: 'ja' }), detail,
  'production fallback uses the exact recorded central rendition URL');
assert.equal(production.getPublishedSetLogoFallback({ id: 'ja:A' }), detail);
assert.equal(production.getPublishedSetLogoFallback({ id: row.setId, language: 'en' }), undefined);
assert.equal(production.getPublishedSetCoverFallback({ id: 'cover-a', language: 'zh-cn' }), original);
assert.equal(production.getPublishedSetLogoFallback({ id: 'cover-a', language: 'zh-cn' }), undefined);
assert.equal(load('staging').getPublishedSetLogoFallback({ id: row.setId, language: 'ja' }),
  `https://staging.example/storage/v1/object/public/stackr-catalogue-public/${row.storageKey}`,
  'a production capture cannot redirect staging to production artwork');
console.log('Published asset delivery passed: exact hashes/identities, approved recorded URLs, continuation/ambiguity guards, immutable inputs, covers and runtime environment isolation.');
