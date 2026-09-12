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
      if (/\.png$/.test(request)) return `bundled:${request}`;
      if (request in dependencies) return dependencies[request];
      throw new Error(`Unexpected dependency: ${request}`);
    },
  });
  return moduleBox.exports;
}

const englishLogos = compileModule('lib/englishSetLogos.ts', {});
const japaneseLogos = compileModule('lib/japaneseSetLogos.ts', {});
const getEnglishSetLogoSourceForSet = englishLogos.getEnglishSetLogoSourceForSet as (input: Record<string, unknown>) => string | null;
const getJapaneseSetLogoSourceForSet = japaneseLogos.getJapaneseSetLogoSourceForSet as (input: Record<string, unknown>) => string | null;
const localArtwork = compileModule('lib/localSetArtwork.ts', {
  './englishSetLogos': { getEnglishSetLogoSourceForSet },
  './japaneseSetLogos': { getJapaneseSetLogoSourceForSet },
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

const explore = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const search = readFileSync('app/(tabs)/search.tsx', 'utf8');
assert.match(explore, /getLocalSetArtworkSourceForSet\(\{[\s\S]*?language: item\.language,[\s\S]*?setCode: item\.externalIds\?\.setCode/s);
assert.match(search, /getLocalSetArtworkSourceForSet\(\{[\s\S]*?language: set\.language,[\s\S]*?setCode: set\.externalIds\?\.setCode/s);
console.log('Japanese bundled fallbacks resolve only for Japanese identities; English promo and expansion collisions are blocked.');
