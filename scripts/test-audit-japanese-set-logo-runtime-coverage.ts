import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { auditJapaneseSetLogoRuntimeCoverage } from './audit-japanese-set-logo-runtime-coverage';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'stackr-ja-logo-audit-'));
const outputDir = join(temporaryRoot, 'report');
const manifestPath = 'assets/rev2/11-japanese-set-logo/manifest.json';
const addendumPath = 'assets/rev2/11-japanese-set-logo/storm-m6-owner-supplied-20261018.json';
const runtimePath = 'lib/japaneseSetLogos.ts';
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const historicalManifestSha = hash(manifestPath);
try {
  const evidencePath = join(temporaryRoot, 'canonical-catalogue-row-evidence.jsonl');
  writeFileSync(evidencePath, [
    { entityType: 'set_art_slot', dimension: 'set_logo', entityId: '00000000-0000-4000-8000-000000000001', language: 'ja', facts: { setCode: 'PMCG6' } },
    { entityType: 'set_art_slot', dimension: 'set_symbol', entityId: '00000000-0000-4000-8000-000000000002', language: 'ja', facts: { setCode: 'MG' } },
    { entityType: 'set_art_slot', dimension: 'set_logo', entityId: '903d5baa-27c7-5690-b1d7-2395c770204a', language: 'ja', facts: { setCode: 'M6' } },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n');
  const result = auditJapaneseSetLogoRuntimeCoverage({ evidencePath, outputDir, expectedTargetSetCount: 3 });
  assert.equal(result.target_set_count, 3);
  assert.equal(result.manifest_logo_count, 224);
  assert.equal(result.historical_manifest_logo_count, 223);
  assert.equal(result.addendum_logo_count, 1);
  assert.equal(result.before.matched_current_sets, 2);
  assert.equal(result.after.matched_current_sets, 2);
  assert.deepEqual(result.proposed_exact_aliases, []);
  assert.deepEqual(result.resolution_counts, { exact_key: 2, exact_alias: 0, unique_manifest_code: 0, ambiguous_manifest_code: 1, no_manifest_bound_exact_identity: 0 });
  assert.equal(result.unused_manifest_logo_count, 222);
  assert.equal(existsSync(join(outputDir, 'manifest.json')), true);
  const rows = JSON.parse(readFileSync(join(outputDir, 'japanese-set-logo-runtime-coverage.json'), 'utf8'));
  assert.equal(rows.find((row: { set_code: string }) => row.set_code === 'MG')?.resolution, 'ambiguous_manifest_code');
  assert.equal(rows.find((row: { set_code: string }) => row.set_code === 'M6')?.runtime_logo_key, 'm6');
  const addendum = JSON.parse(readFileSync(addendumPath, 'utf8'));
  assert.equal(result.additive_logo.asset_path, addendum.assetPath);
  assert.equal(result.additive_logo.declared_asset_sha256, addendum.sha256);
  assert.equal(result.additive_logo.permission_record, addendum.permissionRecord);
  assert.equal(result.input_sha256[`addendum:${basename(addendumPath)}`], hash(addendumPath));
  assert.equal(result.artwork_accessed, false);
  assert.equal(result.network_accessed, false);
  assert.equal(result.database_accessed, false);

  // Custom paths must still select the actual input files, without executing
  // their require calls or assuming that every asset is an old PNG.
  const source = readFileSync(runtimePath, 'utf8');
  const customRuntime = join(temporaryRoot, 'custom-runtime.ts');
  const customManifest = join(temporaryRoot, 'custom-manifest.json');
  const customAddendum = join(temporaryRoot, 'custom-addendum.json');
  const m6Source = "source: require('../assets/rev2/11-japanese-set-logo/logos-owner-supplied-20261018/m6.png') as ImageSourcePropType,";
  assert.ok(source.includes(m6Source));
  writeFileSync(customRuntime, source.replace(m6Source, "source: (require(\n      '../assets/rev2/11-japanese-set-logo/logos-owner-supplied-20261018/m6.png'\n    )) as ImageSourcePropType,"));
  writeFileSync(customManifest, readFileSync(manifestPath));
  writeFileSync(customAddendum, readFileSync(addendumPath));
  const customArgs = { evidencePath, manifestPath: customManifest, addendumPath: customAddendum,
    runtimeSourcePath: customRuntime, expectedTargetSetCount: 3 };
  const custom = auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: join(temporaryRoot, 'custom-report') });
  assert.equal(custom.manifest_logo_count, 224);
  assert.equal(custom.input_sha256['runtime:custom-runtime.ts'], hash(customRuntime));
  assert.equal(custom.input_sha256['manifest:custom-manifest.json'], hash(customManifest));
  assert.equal(custom.input_sha256['addendum:custom-addendum.json'], hash(customAddendum));

  for (const [name, replacement, error] of [
    ['missing-source', '', /logo m6 source must be one literal require/],
    ['borrowed-next-entry', "source: require('../assets/rev2/11-japanese-set-logo/logos/m5.png') as ImageSourcePropType,", /m6 is not exactly manifest-bound/],
    ['unknown-asset', m6Source.replace('m6.png', 'unbound.png'), /m6 is not exactly manifest-bound/],
    ['dynamic-source', "source: getUnverifiedLogo(),", /logo m6 source must be one literal require/],
  ] as const) {
    writeFileSync(customRuntime, source.replace(m6Source, replacement));
    const failedOutput = join(temporaryRoot, name);
    assert.throws(() => auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: failedOutput }), error, name);
    assert.equal(existsSync(failedOutput), false, 'Invalid bindings must fail before publishing an audit receipt');
  }
  for (const [name, runtime, error] of [
    ['unknown-entry', source.replace('const JAPANESE_SET_LOGOS_BY_KEY: Record<string, JapaneseSetLogoMatch> = {',
      `const JAPANESE_SET_LOGOS_BY_KEY: Record<string, JapaneseSetLogoMatch> = {\n  "unbound": { key: "unbound", normalizedKey: "unbound", code: "UNKNOWN", ${m6Source} },`), /exactly 224/],
    ['unbound-alias', source.replace('const JAPANESE_SET_LOGO_ALIASES: Record<string, string> = {',
      'const JAPANESE_SET_LOGO_ALIASES: Record<string, string> = {\n  "unknown": "unbound",'), /alias unknown has an unbound/],
    ['malformed-entry', source.replace('"m6": {', '"m6": ['), /source is malformed/],
  ] as const) {
    assert.notEqual(runtime, source);
    writeFileSync(customRuntime, runtime);
    assert.throws(() => auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: join(temporaryRoot, name) }), error, name);
  }
  writeFileSync(customRuntime, source);
  const duplicateManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  duplicateManifest.logos[1].normalizedKey = duplicateManifest.logos[0].normalizedKey;
  writeFileSync(customManifest, JSON.stringify(duplicateManifest));
  assert.throws(() => auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: join(temporaryRoot, 'duplicate-inventory') }), /224 unique keys and asset paths/);
  writeFileSync(customManifest, readFileSync(manifestPath));
  writeFileSync(customAddendum, JSON.stringify({ ...addendum, assetPath: addendum.assetPath.replace('m6.png', 'unknown.png') }));
  assert.throws(() => auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: join(temporaryRoot, 'unbound-addendum') }), /addendum has invalid identity, asset or permission binding/);
  for (const [name, override] of [
    ['unapproved-permission', { permissionRecord: 'catalogue/rights-reviews/unapproved.json' }],
    ['unapproved-bytes', { sha256: '0'.repeat(64) }],
  ] as const) {
    writeFileSync(customAddendum, JSON.stringify({ ...addendum, ...override }));
    assert.throws(() => auditJapaneseSetLogoRuntimeCoverage({ ...customArgs, outputDir: join(temporaryRoot, name) }), /addendum has invalid identity, asset or permission binding/);
  }
  assert.equal(hash(manifestPath), historicalManifestSha, 'The historical 223-logo manifest remains byte-identical');
  console.log('Japanese set-logo audit binds 223 historical logos plus the exact owner-selected M6 PNG, hashes the additive input and rejects malformed, borrowed and unapproved entries without artwork reads.');
} finally {
  assert.equal(dirname(resolve(temporaryRoot)), resolve(tmpdir()));
  assert.ok(basename(temporaryRoot).startsWith('stackr-ja-logo-audit-'));
  rmSync(temporaryRoot, { recursive: true, force: true });
}
