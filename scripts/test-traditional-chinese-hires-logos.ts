import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

type Logo = { setId: string; setCode: string; language?: string; assetPath: string; sha256: string; width?: number; height?: number; bytes?: number; origin?: string; isOfficialHighResolutionOriginal?: boolean; sourceSha256?: string; provenancePath?: string; provenanceSha256?: string; permissionRecord?: string };
const root = 'assets/rev2/12-traditional-chinese-set-logo/';
const existing = JSON.parse(readFileSync(root + 'manifest.json', 'utf8')) as { logos: Logo[] };
const additions = JSON.parse(readFileSync(root + 'high-resolution-20261016.json', 'utf8')) as { language: string; logos: Logo[]; aiEnhancedLogoCount: number; officialHighResolutionOriginalCount: number; officialSourceCropCount: number };
const packArt = JSON.parse(readFileSync(root + 'owner-supplied-three-pack-art-20261018.json', 'utf8')) as {
  language: string; assetType: string; standaloneSetLogo: boolean; permissionRecord: string;
  assets: Array<Logo & { bytes: number }>;
};
const expectedCodes = ['S4a','S5I','S5R','S5a','S6H','S6K','S6a','SH','S7D','S7R','SP5','S8','S8b','S9','SJ','SK','S9a','SLD','SLL','S10D','S10P','S10a','S10b','S11','SP6','SPD','SPZ','S11a','S12','S12a','SV1V','SV1S','SV2P','SVC','SVP1','SVD'];
assert.equal(additions.language, 'zh-tw');
assert.equal(existing.logos.length, 6, 'Preserve the historical selection.');
assert.deepEqual(additions.logos.map(x => x.setCode).sort(), expectedCodes.sort());
const all = [...existing.logos, ...additions.logos];
assert.equal(new Set(all.map(x => x.setId)).size, 42);
const inventory = readFileSync('docs/releases/catalogue-current-set-population-20260912.csv', 'utf8').split(/\r?\n/);
for (const entry of additions.logos) {
  assert.equal(entry.language, 'zh-tw');
  assert.equal(inventory.filter(line => line.startsWith('zh-tw,') && line.includes(',' + entry.setId + ',' + entry.setCode + ',')).length, 1, 'Canonical ID/code: ' + entry.setCode);
  if (entry.setCode === 'SVP1') {
    assert.equal(entry.setId, '34e5af6e-66d0-4fea-98ce-b1fa1ec1d1dd');
    assert.equal(entry.assetPath, root + 'logos-native-source-20261019/svp1.png');
  } else {
    assert.match(entry.assetPath, /^assets\/rev2\/12-traditional-chinese-set-logo\/logos-hires-20261016\/[a-z0-9]+\.webp$/);
  }
  assert.ok(Math.max(entry.width ?? 0, entry.height ?? 0) >= 1200);
  assert.equal(createHash('sha256').update(readFileSync(entry.assetPath)).digest('hex'), entry.sha256);
}
const svp1 = additions.logos.find(entry => entry.setCode === 'SVP1')!;
assert.equal(svp1.origin, 'official_source_crop');
assert.equal(svp1.isOfficialHighResolutionOriginal, false);
assert.equal(svp1.sha256, '2f2acbc19616479cc93d22b4923f33a45b05c9debc82c30d94dfa3b9e3f5045d');
assert.equal(svp1.sourceSha256, '28335c48835c4f47a8b58554394b65b5a7ba813a85c8ddbd645733d5812ee6cc');
assert.equal(svp1.provenancePath, root + 'logos-native-source-20261019/provenance.json');
const provenanceBytes = readFileSync(svp1.provenancePath!);
assert.equal(createHash('sha256').update(provenanceBytes).digest('hex'), svp1.provenanceSha256);
const provenance = JSON.parse(provenanceBytes.toString('utf8'));
assert.equal(provenance.target.setId, svp1.setId);
assert.equal(provenance.target.language, 'zh-tw');
assert.equal(provenance.target.nativeTitle, 'ex特別組合');
assert.equal(provenance.origin, 'official_source_crop');
assert.equal(provenance.source.sha256, svp1.sourceSha256);
assert.equal(provenance.source.url, 'https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2023/04/tw_news_SVP1_SV2bundle_PKG_0316.png');
assert.deepEqual(provenance.derivative.rectangle, { left: 300, top: 2440, width: 1440, height: 270 });
assert.deepEqual(provenance.derivative.transforms, ['integer_rectangle_extraction', 'lossless_png_encoding']);
assert.equal(provenance.derivative.sha256, svp1.sha256);
assert.equal(provenance.derivative.retainedPixelsExact, true);
assert.equal(provenance.derivative.decodedRgbaSha256, '22058b67b0ca61322bebb94a7e9005dbc0cc0aa542431ce23e2a6958939e4844');
for (const flag of ['resized', 'sharpened', 'alphaEdited', 'generated', 'standaloneAlphaWordmark']) assert.equal(provenance.derivative[flag], false);
assert.equal(provenance.derivative.originalMetallicBackgroundRetained, true);
assert.equal(provenance.qualification.frozenIndependentReview.sha256, '92052a311c4abf590d63b521b735a2216d08c25c7a5c0c0ed725652a0d677726');
assert.equal(provenance.qualification.quantitativeSharpnessGainEstablished, false);
assert.equal(provenance.qualification.officialHighResolutionOriginalClaimed, false);
const nativeBytes = readFileSync(svp1.assetPath);
assert.equal(nativeBytes.length, svp1.bytes);
assert.equal(nativeBytes.toString('ascii', 1, 4), 'PNG');
assert.equal(nativeBytes.readUInt32BE(16), 1440);
assert.equal(nativeBytes.readUInt32BE(20), 270);
assert.equal(svp1.permissionRecord, 'catalogue/rights-reviews/svp1-native-title-owner-exact32.2026-10-19.json');
assert.equal(provenance.permissionRecord.path, svp1.permissionRecord);
const nativePermissionBytes = readFileSync(svp1.permissionRecord!);
assert.equal(createHash('sha256').update(nativePermissionBytes).digest('hex'), provenance.permissionRecord.sha256);
const nativePermission = JSON.parse(nativePermissionBytes.toString('utf8'));
assert.equal(nativePermission.publicRuntimeDisplayAuthorized, true);
assert.equal(nativePermission.assetPersistenceAuthorized, true);
assert.equal(nativePermission.cropDerivationAuthorized, true);
assert.equal(nativePermission.canonicalDatabaseWriteAuthorized, false);
assert.equal(nativePermission.scope.assetCount, 1);
assert.equal(nativePermission.scope.assetType, 'set_logo');
assert.equal(nativePermission.scope.setId, svp1.setId);
assert.equal(nativePermission.scope.language, 'zh-tw');
assert.equal(nativePermission.scope.originalSourceSha256, svp1.sourceSha256);
assert.deepEqual(nativePermission.scope.sha256, [svp1.sha256]);
assert.equal(nativePermission.ownerEvidence.originalReceipt.sha256, '7f07676cd46768956726c15619b74cc1c25d422f9d95ea52d04fddf3ee9a63d1');
assert.equal(nativePermission.ownerEvidence.originalProposal.sha256, '37285e6cc0df364a3a42d418d7f026fabc7d09f53043a65ea3311e847c4c58ed');
assert.equal(nativePermission.ownerEvidence.exactAnswer, 'Yes, my permission covers those exact sources and uses');
assert.equal(nativePermission.ownerEvidence.blanketOfficialSourceAuthority, false);
assert.equal(nativePermission.ownerEvidence.independentlyAuditedUpstreamLicence, false);
assert.equal(nativePermission.boundaries.globalSourceRegistryUnchanged, true);
assert.equal(nativePermission.boundaries.newBackendOrNativePublicationAuthorizedByThisRecord, false);
assert.deepEqual(nativePermission.boundaries.publicationQualifiedBatch, []);
const rollback = provenance.rollback;
assert.equal(rollback.priorAsset.assetPath, root + 'logos-hires-20261016/svp1.webp');
assert.equal(rollback.priorAsset.sha256, '3f9e60d5c6e6225a60c6ac8d0b1bc75794860b101318e3ed3a9cd82b0574272f');
assert.equal(createHash('sha256').update(readFileSync(rollback.priorAsset.assetPath)).digest('hex'), rollback.priorAsset.sha256);
assert.equal(rollback.priorFilePreserved.deletedOrOverwritten, false);
assert.equal(rollback.priorAsset.origin, 'ai_enhanced_derivative');
assert.deepEqual(rollback.restoreManifestEntry, rollback.priorAsset);
assert.equal(rollback.restoreRuntimeRequire, `require('../${rollback.priorAsset.assetPath}')`);
assert.equal(provenance.legacyReference.transformBridgeEstablished, false);
assert.equal(provenance.delivery.publicApiAssetPublicationProved, false);
assert.equal(additions.aiEnhancedLogoCount, additions.logos.filter(entry => entry.origin === 'ai_enhanced_derivative').length);
assert.equal(additions.officialHighResolutionOriginalCount, additions.logos.filter(entry => entry.isOfficialHighResolutionOriginal === true).length);
assert.equal(additions.officialSourceCropCount, additions.logos.filter(entry => entry.origin === 'official_source_crop').length);
assert.equal(additions.aiEnhancedLogoCount + additions.officialHighResolutionOriginalCount + additions.officialSourceCropCount, additions.logos.length);
const runtimeModule = { exports: {} };
const identityModule = { exports: {} };
const compiledIdentity = transformSync(readFileSync('lib/pokemonSetIdentity.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
new Function('module', 'exports', compiledIdentity)(identityModule, identityModule.exports);
const allowed = new Set([...all, ...packArt.assets].map(x => '../' + x.assetPath));
const compiled = transformSync(readFileSync('lib/traditionalChineseSetLogos.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
new Function('require', 'module', 'exports', compiled)((id: string) => {
  if (id === './pokemonSetIdentity') return identityModule.exports;
  assert.ok(allowed.has(id), 'Unexpected image: ' + id);
  assert.ok(existsSync(resolve('lib', id)), 'Metro asset require must resolve: ' + id);
  return id;
}, runtimeModule, runtimeModule.exports);
type Lookup = (input?: { id?: string | null; setId?: string | null; language?: string | null } | null, language?: string | null) => unknown;
const api = runtimeModule.exports as { getTraditionalChineseSetLogoSourceForSet: Lookup; getTraditionalChineseSetArtworkSourceForSet: Lookup };
const lookup = api.getTraditionalChineseSetLogoSourceForSet;
const artwork = api.getTraditionalChineseSetArtworkSourceForSet;
for (const entry of all) {
  const path = '../' + entry.assetPath;
  for (const language of ['zh-tw','zh-hant','zh_TW',' ZH-HANT ']) {
    assert.equal(lookup({ id: entry.setId, language }), path);
    assert.equal(lookup({ setId: entry.setId.toUpperCase(), language }), path);
    assert.equal(artwork({ id: entry.setId, language }), path, 'Existing reviewed standalone marks retain precedence.');
  }
  assert.equal(lookup({ id: entry.setId }, 'zh-tw'), path);
  for (const prefix of ['zh-tw', 'zh_tw', 'zhtw', 'zh-hant', 'zh_hant', 'zhhant', 'zh']) {
    assert.equal(lookup({ id: `${prefix}:${entry.setId}` }), path, 'Exact prefixed set identity must retain its bundled artwork.');
    assert.equal(lookup({ setId: `${prefix.toUpperCase()}:${entry.setId.toUpperCase()}`, language: 'zh-tw' }), path);
    assert.equal(lookup({ id: `${prefix}:${entry.setId}` }, 'zh-hant'), path);
    for (const language of ['en', 'ja', 'zh-cn', 'ko', '']) {
      assert.equal(lookup({ id: `${prefix}:${entry.setId}`, language }), null, 'Explicit conflicting language must remain rejected.');
      assert.equal(lookup({ id: `${prefix}:${entry.setId}` }, language), null, 'Fallback language is still an identity constraint.');
    }
  }
  for (const prefix of ['en', 'ja', 'jp', 'ko', 'zh-cn', 'zh-hans']) {
    assert.equal(lookup({ id: `${prefix}:${entry.setId}`, language: 'zh-tw' }), null, 'A foreign prefix must not be stripped into a Traditional Chinese match.');
  }
  for (const language of ['en','ja','zh-cn','ko','']) {
    assert.equal(lookup({ id: entry.setId, language }, 'zh-tw'), null);
  }
  assert.equal(lookup({ id: entry.setId.slice(0, -1), language: 'zh-tw' }), null);
}
assert.equal(lookup(null, 'zh-tw'), null);
assert.equal(lookup({ id: 'SP5', language: 'zh-tw' }), null);
assert.equal(lookup({ id: 'PROVIDED-FIFTH-ANNIVERSARY', language: 'zh-tw' }), null);
assert.equal(lookup({ id: '104c8230-fefa-450c-8b97-0773154d456b', language: 'zh-tw' }), '../' + root + 'logos-hires-20261016/sp5.webp');
assert.equal(lookup({ id: 'a7f84e96-a008-47f0-8b41-a05de3f23618', language: 'zh-tw' }), '../' + root + 'logos-hires-20261016/s11.webp');
assert.equal(additions.logos.filter(x => x.origin === 'official_source_original').length, 1);
assert.equal(additions.logos.find(x => x.setCode === 'S10b')?.origin, 'official_source_original');
assert.equal(packArt.language, 'zh-tw');
assert.equal(packArt.assetType, 'product_pack');
assert.equal(packArt.standaloneSetLogo, false);
assert.deepEqual(packArt.assets.map(x => x.setCode).sort(), ['SV10', 'SV9', 'SV9a']);
const permission = JSON.parse(readFileSync(packArt.permissionRecord, 'utf8'));
assert.equal(permission.publicRuntimeDisplayAuthorized, true);
assert.equal(permission.assetPersistenceAuthorized, true);
assert.equal(permission.canonicalDatabaseWriteAuthorized, false);
assert.equal(permission.scope.assetType, 'product_pack');
assert.equal(permission.scope.standaloneSetLogo, false);
assert.equal(permission.scope.assetCount, 3);
for (const evidence of permission.ownerEvidence) {
  assert.equal(createHash('sha256').update(readFileSync(evidence.path)).digest('hex'), evidence.sha256);
  assert.equal(JSON.parse(readFileSync(evidence.path, 'utf8')).status, 'OWNER_ATTESTED');
}
for (const entry of packArt.assets) {
  assert.equal(inventory.filter(line => line.startsWith('zh-tw,') && line.includes(',' + entry.setId + ',' + entry.setCode + ',')).length, 1);
  assert.ok(permission.scope.setIds.includes(entry.setId));
  assert.ok(permission.scope.sha256.includes(entry.sha256));
  const bytes = readFileSync(entry.assetPath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  assert.equal(bytes.readUInt32BE(16), entry.width);
  assert.equal(bytes.readUInt32BE(20), entry.height);
  const expected = '../' + entry.assetPath;
  for (const id of [entry.setId, `zh-tw:${entry.setId}`, `ZH_HANT:${entry.setId.toUpperCase()}`]) {
    assert.equal(artwork({ id, language: 'zh-tw' }), expected);
    assert.equal(lookup({ id, language: 'zh-tw' }), null, 'Native packaging must never become a standalone logo.');
    for (const language of ['en', 'ja', 'zh-cn', 'ko', '']) assert.equal(artwork({ id, language }), null);
  }
  assert.equal(artwork({ id: `zh-tw:${entry.setId}` }), expected);
  assert.equal(artwork({ id: `ja:${entry.setId}`, language: 'zh-tw' }), null);
  assert.equal(artwork({ id: entry.setCode, language: 'zh-tw' }), null, 'A shared code alone cannot identify a pack.');
}
assert.equal(artwork({ id: 'unknown', language: 'zh-tw' }), null);
console.log('PASS: 42 exact marks including the native SVP1 source crop, three exact pack-art fallbacks, immutable hashes, scoped owner receipts, rollback and language/logo-role boundaries.');
