const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compileModule(filePath, dependencies) {
  const compiled = ts.transpileModule(readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleBox,
    exports: moduleBox.exports,
    require: (request) => {
      if (/\.png$/.test(request)) return `bundled:${request}`;
      if (request in dependencies) return dependencies[request];
      throw new Error(`Unexpected dependency while compiling ${filePath}: ${request}`);
    },
  });
  return moduleBox.exports;
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const manifestPath = 'data/catalogue/official-english-set-logos.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.length, 15, 'The reviewed cohort must contain exactly 15 unique canonical logo assets.');

const allCodes = manifest.flatMap((row) => row.codes.map((code) => String(code).toLowerCase()));
assert.equal(allCodes.includes('pbl'), false, 'PBL must not be reintroduced as a Pitch Black identity.');
assert.equal(new Set(allCodes).size, allCodes.length, 'Every provider/set-code alias must have one canonical owner.');

const pitchBlack = manifest.filter((row) => row.title === 'Pitch Black');
assert.equal(pitchBlack.length, 1, 'Pitch Black must have one canonical asset.');
assert.equal(pitchBlack[0].canonical_asset_id, 'me5', 'Stackr canonical Pitch Black identity must remain me5.');
assert.deepEqual([...pitchBlack[0].codes].sort(), ['me05', 'me5']);

const fileHashes = new Set();
for (const row of manifest) {
  assert.equal(row.language, 'en');
  assert.equal(row.official_artwork_verified, true);
  assert.equal(row.display_scope, 'in_app_set_identification');
  assert.equal(sha256(row.image_file), row.sha256, `${row.canonical_asset_id} binary hash must match the reviewed manifest.`);
  assert.equal(fileHashes.has(row.sha256), false, `${row.canonical_asset_id} duplicates another binary instead of sharing one canonical asset.`);
  fileHashes.add(row.sha256);
}
assert.equal(fileHashes.size, 15);

const englishLogos = compileModule('lib/englishSetLogos.ts', {});
const japaneseLogos = compileModule('lib/japaneseSetLogos.ts', {});
const getEnglishSetLogoMatch = englishLogos.getEnglishSetLogoMatch;
const getEnglishSetLogoMatchForSet = englishLogos.getEnglishSetLogoMatchForSet;
const getEnglishSetLogoSourceForSet = englishLogos.getEnglishSetLogoSourceForSet;
const getJapaneseSetLogoSourceForSet = japaneseLogos.getJapaneseSetLogoSourceForSet;

for (const row of manifest) {
  const expectedSource = `bundled:../${row.image_file}`;
  for (const code of row.codes) {
    const match = getEnglishSetLogoMatch(code, 'en');
    assert.equal(match?.canonicalAssetId, row.canonical_asset_id, `${code} must resolve to ${row.canonical_asset_id}.`);
    assert.equal(match?.source, expectedSource, `${code} must resolve the reviewed bundled file.`);
  }
  for (const name of row.names) {
    const match = getEnglishSetLogoMatchForSet({ name, language: 'en' });
    assert.equal(match?.canonicalAssetId, row.canonical_asset_id, `${name} must resolve to ${row.canonical_asset_id}.`);
  }
}

assert.equal(getEnglishSetLogoMatch('me5', 'en')?.source, getEnglishSetLogoMatch('me05', 'en')?.source);
assert.equal(getEnglishSetLogoMatch('PBL', 'en'), null, 'Removed duplicate PBL must never resolve as a second set.');
assert.equal(getEnglishSetLogoMatchForSet({ id: 'PBL', setCode: 'ME05', language: 'en' }), null);
assert.equal(getEnglishSetLogoMatch('sv05', 'ja'), null, 'English logos must not override explicit Japanese identities.');
assert.equal(getEnglishSetLogoMatchForSet({ id: 'sv05', language: 'fr' }), null, 'English logos must not be used for other languages.');

for (const code of ['sve', 'xya', 'bog', 'sp', 'miscp']) {
  assert.equal(getEnglishSetLogoMatch(code, 'en'), null, `${code} has no reviewed standalone English logo and must remain unresolved.`);
}

const sharedMcDonalds = ['2021swsh', '2019sm', '2018sm', '2017sm', '2016xy', '2015xy', '2014xy', '2012bw', '2011bw']
  .map((code) => getEnglishSetLogoMatch(code, 'en')?.source);
assert.equal(new Set(sharedMcDonalds).size, 1, 'Shared McDonald’s artwork must be stored once and mapped by aliases.');
const sharedPop = ['pop9', 'pop7', 'pop6', 'pop5', 'pop4', 'pop3', 'pop2', 'pop1']
  .map((code) => getEnglishSetLogoMatch(code, 'en')?.source);
assert.equal(new Set(sharedPop).size, 1, 'The shared POP Series logo must be stored once.');

const localArtwork = compileModule('lib/localSetArtwork.ts', {
  './englishSetLogos': { getEnglishSetLogoSourceForSet },
  './japaneseSetLogos': { getJapaneseSetLogoSourceForSet },
  './magazineSetCovers': {
    getMagazineSetCoverSourceForSet: (input) => input?.id === 'magazine:test' ? 'bundled:magazine' : null,
  },
});
const getLocalSetArtworkSourceForSet = localArtwork.getLocalSetArtworkSourceForSet;
assert.equal(getLocalSetArtworkSourceForSet({ id: 'magazine:test', language: 'en' }), 'bundled:magazine');
assert.match(getLocalSetArtworkSourceForSet({ id: 'me05', language: 'en' }) ?? '', /me05\.png$/);
assert.equal(getLocalSetArtworkSourceForSet({ id: 'sp', language: 'en' }), null, 'English Sample must not fall through to the Japanese S-P promo mark.');
assert.ok(getLocalSetArtworkSourceForSet({ id: 'sp', language: 'ja' }), 'Explicit Japanese S-P must retain its Japanese mark.');

const resolverSource = readFileSync('lib/englishSetLogos.ts', 'utf8');
const bundledRequires = [...resolverSource.matchAll(/require\('([^']+\.png)'\)/g)].map((match) => match[1]);
assert.equal(bundledRequires.length, 15, 'The runtime resolver must statically bundle all 15 and only 15 canonical files.');
assert.equal(new Set(bundledRequires).size, 15);
for (const requiredPath of bundledRequires) {
  const absolute = path.resolve('lib', requiredPath);
  assert.ok(readFileSync(absolute).length > 100, `${requiredPath} must be a non-empty bundled asset.`);
}

console.log('Official English set logos: 15 unique reviewed assets, 47 aliases, one Pitch Black identity, and no wrong-language fallthrough.');
