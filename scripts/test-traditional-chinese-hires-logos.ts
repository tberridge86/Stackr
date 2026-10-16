import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

type Logo = { setId: string; setCode: string; language?: string; assetPath: string; sha256: string; width?: number; height?: number; origin?: string };
const root = 'assets/rev2/12-traditional-chinese-set-logo/';
const existing = JSON.parse(readFileSync(root + 'manifest.json', 'utf8')) as { logos: Logo[] };
const additions = JSON.parse(readFileSync(root + 'high-resolution-20261016.json', 'utf8')) as { language: string; logos: Logo[] };
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
  assert.match(entry.assetPath, /^assets\/rev2\/12-traditional-chinese-set-logo\/logos-hires-20261016\/[a-z0-9]+\.webp$/);
  assert.ok(Math.max(entry.width ?? 0, entry.height ?? 0) >= 1200);
  assert.equal(createHash('sha256').update(readFileSync(entry.assetPath)).digest('hex'), entry.sha256);
}
const runtimeModule = { exports: {} };
const allowed = new Set(all.map(x => '../' + x.assetPath));
const compiled = transformSync(readFileSync('lib/traditionalChineseSetLogos.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
new Function('require', 'module', 'exports', compiled)((id: string) => {
  assert.ok(allowed.has(id), 'Unexpected image: ' + id);
  assert.ok(existsSync(resolve('lib', id)), 'Metro asset require must resolve: ' + id);
  return id;
}, runtimeModule, runtimeModule.exports);
const api = runtimeModule.exports as { getTraditionalChineseSetLogoSourceForSet: (input?: { id?: string | null; setId?: string | null; language?: string | null } | null, language?: string | null) => unknown };
const lookup = api.getTraditionalChineseSetLogoSourceForSet;
for (const entry of all) {
  const path = '../' + entry.assetPath;
  for (const language of ['zh-tw','zh-hant','zh_TW',' ZH-HANT ']) {
    assert.equal(lookup({ id: entry.setId, language }), path);
    assert.equal(lookup({ setId: entry.setId.toUpperCase(), language }), path);
  }
  assert.equal(lookup({ id: entry.setId }, 'zh-tw'), path);
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
console.log('PASS: 36 exact additions, six preserved marks, hashes, runtime assets and language/unknown-ID boundaries.');
