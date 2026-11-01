import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
function load(environment, logoSnapshot = result.snapshot) {
  const module = { exports: {} };
  const dependencies = {
    './generated/publishedSetLogos.generated.json': logoSnapshot,
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

const committed = JSON.parse(fs.readFileSync(path.join(path.dirname(sourcePath), 'generated/publishedSetLogos.generated.json'), 'utf8'));
const recordedSupersessions = JSON.parse(fs.readFileSync(path.join(path.dirname(sourcePath), 'generated/publishedSetAssetSupersessions.generated.json'), 'utf8'));
const currentProduction = load('production', committed);
const unrelatedCanonicalId = '01234567-1234-4123-8123-0123456789ab';
for (const id of [unrelatedCanonicalId, `jp:${unrelatedCanonicalId}`]) {
  assert.equal(currentProduction.getPublishedSetLogoFallback({ id, language: 'ja', setCode: 'L1b' }), undefined,
    'an unknown canonical UUID cannot borrow a published logo through a stale set code');
}

const adapterSource = fs.readFileSync(path.join(path.dirname(sourcePath), 'stackrDomainAdapter.ts'), 'utf8');
const adapterCompiled = ts.transpileModule(adapterSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const adapter = {};
const adapterDependencies = {
  './pokemonDisplayNames': {
    getLocalSetName: (input) => input.localName ?? input.setCode,
    getEnglishSetDisplayName: (input) => input.englishDisplayName ?? input.localName,
    getPreferredSetDisplayName: (input) => input.englishDisplayName ?? input.localName,
  },
  './pokemonSetSeries': { getPokemonSetDisplaySeries: (input) => input.series },
  './publishedSetLogoFallbacks': currentProduction,
  './optionalCatalogueEnrichment': {
    readOptionalCatalogueEnrichment: (read) => read(),
    throwIfOptionalCatalogueReadAborted: () => {},
  },
};
vm.runInNewContext(adapterCompiled, {
  exports: adapter,
  require: (name) => adapterDependencies[name] ?? {},
  process, console, AbortController, setTimeout, clearTimeout,
});
const unrelatedSet = {
  setId: unrelatedCanonicalId,
  setCode: 'L1b',
  languageCode: 'ja',
  nativeName: 'Unrelated canonical set',
  total: 1,
};
assert.equal(adapter.stackrSetToLegacySet(unrelatedSet).images.logo, undefined,
  'the active set adapter cannot seed its image/cache path with another canonical set logo');
for (const crop of [
  {
    setId: 'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', code: 'L1b',
    previous: 'f3234f24da22abb5966af659f8a3db3203d3143ec9683dfcd2cc87b40d204794',
    original: '7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383',
    detail: 'dd10d60fd15bf6179383f1f64dfc631b41f0636d5242a20a26431b039be01559',
  },
  {
    setId: '7dbeff79-cfb7-4ac8-8a4f-d7c73a523349', code: 'LL',
    previous: '9dfdcbec146a9ca771bd333ebfa0cfab991b96ce8270686a1707df9288af0532',
    original: 'f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add',
    detail: '7908d79c0a09b80cfd755bad1078b7803f0433a735a9a5ca8f086dec514e3b62',
  },
]) {
  const matches = committed.logos.filter((item) => item.setId === crop.setId);
  assert.equal(matches.length, 1, 'exact Japanese crop has one canonical mapping');
  const mapped = matches[0];
  assert.equal(mapped.language, 'ja');
  assert.equal(mapped.setCode, crop.code);
  assert.equal(mapped.contentSha256, crop.original);
  assert.equal(mapped.supersedesContentSha256, crop.previous);
  assert.ok(mapped.storageKey.includes('/' + crop.previous + '/'), 'previous immutable pointer remains available');
  assert.ok(mapped.deliveryUrl.includes('/' + crop.original + '/original.png'));
  assert.ok(mapped.detailUrl.includes('/' + crop.detail + '/detail-page.webp'));
  const receipt = recordedSupersessions.supersessions.filter((item) => item.setId === crop.setId);
  assert.equal(receipt.length, 1);
  assert.equal(receipt[0].previousContentSha256, crop.previous);
  assert.equal(receipt[0].previousAssetId, 'acquire:set_logo:' + crop.setId);
  assert.ok(receipt[0].previousDeliveryUrl.includes('/' + crop.previous + '/original.png'),
    'previous recorded central delivery remains in the rollback receipt');
  assert.equal(receipt[0].contentSha256, crop.original);
  assert.equal(receipt[0].assetId, mapped.assetId);
  assert.equal(receipt[0].deliveryUrl, mapped.deliveryUrl);
  assert.ok(committed.deliveryEvidence.some((capture) => capture.requestId === receipt[0].captureRequestId
    && capture.generatedAt === receipt[0].captureGeneratedAt), 'replacement retains its exact captured publication evidence');
  for (const identity of [{ id: crop.setId, language: 'ja' }, { id: 'jp:' + crop.setId }, { id: 'ja:' + crop.code }]) {
    assert.equal(currentProduction.getPublishedSetLogoFallback(identity), mapped.detailUrl);
  }
  assert.equal(currentProduction.getPublishedSetLogoFallback({ id: crop.setId, language: 'en' }), undefined);
  assert.equal(load('staging', committed).getPublishedSetLogoFallback({ id: crop.setId, language: 'ja' }),
    'https://staging.example/storage/v1/object/public/stackr-catalogue-public/' + mapped.storageKey);
}
console.log('Published Japanese crops passed: exact verified originals/renditions, canonical and legacy aliases, retained rollback and capture evidence, language/environment isolation.');
