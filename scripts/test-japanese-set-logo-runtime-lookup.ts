import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compileModule(path: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleBox = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(compiled, {
    module: moduleBox,
    exports: moduleBox.exports,
    require: (request: string) => {
      if (/\.(png|webp)$/.test(request)) return `bundled:${request}`;
      if (request in dependencies) return dependencies[request];
      throw new Error(`Unexpected dependency: ${request}`);
    },
  });
  return moduleBox.exports;
}

const englishLogos = compileModule('lib/englishSetLogos.ts', {});
const japaneseLogos = compileModule('lib/japaneseSetLogos.ts', {});
const simplifiedChineseLogos = compileModule('lib/simplifiedChineseSetLogos.ts', {});
const traditionalChineseLogos = compileModule('lib/traditionalChineseSetLogos.ts', {});
const getEnglishSetLogoSourceForSet = englishLogos.getEnglishSetLogoSourceForSet as (input: Record<string, unknown>) => string | null;
const getJapaneseSetLogoSourceForSet = japaneseLogos.getJapaneseSetLogoSourceForSet as (input: Record<string, unknown>, fallbackLanguage?: string | null) => string | null;
const getJapaneseSetLogoSource = japaneseLogos.getJapaneseSetLogoSource as (setId?: string | null, language?: string | null) => string | null;
const getTraditionalChineseSetLogoSourceForSet = traditionalChineseLogos.getTraditionalChineseSetLogoSourceForSet as (input: Record<string, unknown>, fallbackLanguage?: string | null) => string | null;
const localArtwork = compileModule('lib/localSetArtwork.ts', {
  './englishSetLogos': { getEnglishSetLogoSourceForSet },
  './japaneseSetLogos': { getJapaneseSetLogoSourceForSet },
  './simplifiedChineseSetLogos': simplifiedChineseLogos,
  './traditionalChineseSetLogos': { getTraditionalChineseSetLogoSourceForSet },
  './magazineSetCovers': { getMagazineSetCoverSourceForSet: () => null },
});
const getLocalSetArtworkSourceForSet = localArtwork.getLocalSetArtworkSourceForSet as (input: Record<string, unknown>) => string | null;

const japaneseSm6 = {
  id: '04fe9fe1-7206-4215-b9ab-ccea25916593',
  language: 'ja',
  setCode: 'SM6',
  localName: '禁断の光',
};
const japaneseSource = getLocalSetArtworkSourceForSet(japaneseSm6);
assert.match(japaneseSource ?? '', /sm6\.png$/, 'The Japanese SM6 set must resolve its exact bundled presentation logo.');
assert.equal(
  getLocalSetArtworkSourceForSet({ ...japaneseSm6, language: 'en' }),
  null,
  'The ambiguous SM6 key must not assign a Japanese logo to an English set.',
);

for (const promoCode of ['bwp', 'dpp', 'smp', 'sp', 'svp', 'xyp']) {
  assert.equal(
    getJapaneseSetLogoSourceForSet({ id: promoCode, language: 'en' }),
    null,
    `English promo identity ${promoCode} must not inherit a Japanese bundled mark.`,
  );
  assert.ok(
    getJapaneseSetLogoSourceForSet({ id: promoCode, language: 'ja' }),
    `Explicit Japanese promo identity ${promoCode} must retain its Japanese bundled mark.`,
  );
}

for (const [setCode, expectedAsset] of [['SVLS', 'svls.png'], ['SVLN', 'svln.png'], ['SVK', 'svk.png'], ['PCG1', 'pcg1.png'], ['PCG10', 'pcg10.png'], ['ADV2', 'adv2.png'], ['E3', 'e3.png'], ['WEB1', 'web1.png']] as const) {
  assert.match(getJapaneseSetLogoSourceForSet({ id: `ja:${setCode}`, language: 'ja', setCode }) ?? '', new RegExp(`${expectedAsset.replace('.', '\\.')}$`), `Japanese ${setCode} must resolve its prepared exact mark.`);
  assert.equal(getJapaneseSetLogoSourceForSet({ id: setCode, language: 'en', setCode }), null, `Japanese ${setCode} must not cross into English.`);
}

for (const language of ['zh-tw', 'zh-cn', 'zh-Hant', 'zh-Hans', 'en', 'ko']) {
  const foreignSet = { id: 'foreign-canonical-set', setCode: 'S8b', language, externalIds: { tcgdex: 'S8b' } };
  assert.equal(getJapaneseSetLogoSource('S8b', language), null, `${language} must not use a Japanese logo for a shared code.`);
  assert.equal(getLocalSetArtworkSourceForSet(foreignSet), null, `${language} must stay within its own artwork sources.`);
  assert.equal(getJapaneseSetLogoSourceForSet({ id: 'S8b' }, language), null, 'The supplied fallback language must also prevent a foreign logo.');
  assert.equal(getJapaneseSetLogoSource('ja:S8b', language), null, 'A legacy prefix must not override a conflicting explicit language.');
  assert.equal(getJapaneseSetLogoSourceForSet({ ...foreignSet, id: 'ja:S8b' }), null, 'A legacy object ID must not override a conflicting explicit language.');
}
for (const language of ['ja', 'jp', 'jpn', 'japanese', 'japan', 'ja-JP', 'ja_JP', 'ja-Jpan', 'ja-Jpan-JP', 'ja-JP-u-ca-japanese', ' JA ']) {
  assert.ok(getJapaneseSetLogoSource('S8b', language), `${language} must retain its exact Japanese logo.`);
  assert.ok(getJapaneseSetLogoSourceForSet({ id: 'japanese-canonical-set', language, setCode: 'S8b' }), `${language} must also resolve in the set-object path.`);
}
assert.ok(getJapaneseSetLogoSource('ja:S8b'), 'An unambiguous Japanese-prefixed legacy lookup remains supported.');
assert.ok(getJapaneseSetLogoSource('S8b'), 'A language-omitted legacy lookup remains supported.');

const traditionalChineseSca = { id: '41251d8a-6a1c-4f91-8e84-22e2fe7737fd', language: 'zh-tw' };
assert.match(
  getLocalSetArtworkSourceForSet(traditionalChineseSca) ?? '',
  /traditional-chinese-set-logo\/logos\/sca\.webp$/,
  'The reviewed Traditional Chinese SCA mark must resolve only for its exact set and language.',
);
for (const language of ['en', 'ja', 'zh-cn', 'ko']) {
  assert.equal(
    getLocalSetArtworkSourceForSet({ ...traditionalChineseSca, language }),
    null,
    `Traditional Chinese artwork must not cross into ${language}.`,
  );
}
assert.equal(
  getLocalSetArtworkSourceForSet({ id: 'unknown-traditional-chinese-set', language: 'zh-tw' }),
  null,
  'Traditional Chinese artwork must never be selected by an unverified code or name.',
);

const explore = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const search = readFileSync('app/(tabs)/search.tsx', 'utf8');
assert.match(explore, /getLocalSetArtworkSourceForSet\(\{[\s\S]*?language: item\.language,[\s\S]*?setCode: item\.externalIds\?\.setCode/s);
assert.match(search, /getLocalSetArtworkSourceForSet\(\{[\s\S]*?language: set\.language,[\s\S]*?setCode: set\.externalIds\?\.setCode/s);
console.log('Japanese bundled fallbacks reject explicit foreign languages, including shared Chinese set codes, while preserving Japanese and language-omitted legacy lookups.');
