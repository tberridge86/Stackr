import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import published from '../lib/generated/publishedSetLogos.generated.json';
import simplified from '../lib/generated/publishedSimplifiedChineseCovers.generated.json';
const compiled = transformSync(readFileSync('lib/publishedSetLogoFallbacks.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function loadForEnvironment(supabaseUrl: string) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    if (id === './generated/publishedSetLogos.generated.json') return published;
    if (id === './generated/publishedSimplifiedChineseCovers.generated.json') return simplified;
    if (id === './mobileRuntimeConfig') return { MOBILE_RUNTIME_CONFIG: { supabaseUrl } };
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports as typeof import('../lib/publishedSetLogoFallbacks');
}
const { getPublishedSetCoverFallback, getPublishedSetLogoFallback } = loadForEnvironment('https://production-test.invalid');

const abyss = '91be8fc7-b2ed-4169-b41e-0d374e4d466a';
const mega = '42d59aab-eccf-413f-8c19-d88f63664057';
const megaEnergy = '6f4ff21c-f7e5-42bd-9ac1-ce0212ae1061';
assert.ok(getPublishedSetLogoFallback({ id: abyss, language: 'ja' })?.startsWith('https://production-test.invalid/'));
assert.ok(loadForEnvironment('https://staging-test.invalid').getPublishedSetLogoFallback({ id: abyss, language: 'ja' })?.startsWith('https://staging-test.invalid/'));
assert.match(getPublishedSetLogoFallback({id:abyss,language:'ja'}) ?? '', /d719c4bffba1376171c4ff680cd86fb7a1badb3510b2ed2482820c4b07bfb260\/original.png$/);
assert.equal(getPublishedSetLogoFallback({id:abyss,language:'en'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'ja:M5',language:'zh-cn'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'M5'}), undefined, 'A code without a language must not borrow a foreign logo.');
assert.equal(getPublishedSetLogoFallback({id:'M5',language:'ja'}), getPublishedSetLogoFallback({id:abyss,language:'ja'}));
assert.equal(getPublishedSetLogoFallback({id:megaEnergy,language:'en'}), getPublishedSetLogoFallback({id:mega,language:'en'}));
assert.equal(getPublishedSetLogoFallback({id:'mee',language:'en'}), getPublishedSetLogoFallback({id:mega,language:'en'}));
assert.equal(getPublishedSetLogoFallback({id:megaEnergy,language:'ja'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'unknown-set',language:'ja'}), undefined);
// Pin the one reviewed replacement independently of the implementation. All
// other generated entries must retain their exact existing storage key.
const crown = '42096fc0-51f2-4805-a114-e6f2811a0c49';
const gallery = '8bb033f3-6059-4f5f-a021-c363241092a1';
const reviewedCrownKey = 'public/set_logo/reviewed/catalogue/' + crown
  + '/dcc01afe69d851972c3c5a05a64fb9c939d1a5df6906e8d0b4be33f682627c92/delivery.png';
const storageRoot = 'https://production-test.invalid/storage/v1/object/public/stackr-catalogue-public/';
let reviewedReplacementCount = 0;
for(const row of published.logos) {
  const url = getPublishedSetLogoFallback({id:row.setId,language:row.language});
  const isReviewedCrown = row.setId === crown && row.language === 'en';
  const expectedKey = isReviewedCrown ? reviewedCrownKey : row.storageKey;
  if (isReviewedCrown) reviewedReplacementCount += 1;
  assert.equal(url, storageRoot + expectedKey, `${row.language}:${row.setCode} must select its exact approved fallback`);
  assert.match(row.storageKey, /^public\/set_logo\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\/original\.(png|webp|jpg)$/);
}
assert.equal(reviewedReplacementCount, 1, 'The reviewed exception must match exactly one Crown Zenith snapshot row.');
for (const id of [crown, gallery, 'swsh12.5', 'swsh12pt5', 'swsh12.5gg', 'swsh12pt5gg']) {
  assert.equal(getPublishedSetLogoFallback({ id, language: 'en' }), storageRoot + reviewedCrownKey);
  assert.equal(getPublishedSetLogoFallback({ id, language: 'ja' }), undefined);
}
console.log(`Published set-logo identity checks passed for ${published.logos.length} existing assets, including exact-language and parent-logo controls.`);
for (const row of simplified.covers) {
  assert.equal(getPublishedSetCoverFallback({ id: row.setId }), undefined);
  assert.ok(getPublishedSetCoverFallback({ id: row.setId, language: 'zh-cn' })?.endsWith(row.storageKey));
  assert.equal(getPublishedSetCoverFallback({ id: row.setId, language: 'ja' }), undefined);
  assert.equal(getPublishedSetCoverFallback({ id: row.setId, language: 'zh-tw' }), undefined);
  assert.equal(getPublishedSetLogoFallback({ id: row.setId, language: 'zh-cn' }), undefined);
  assert.equal(getPublishedSetCoverFallback({ id: row.setCode, language: 'zh-cn' }), undefined);
  assert.match(row.storageKey, /^public\/sealed_product_image\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\/original\.jpg$/);
}
console.log(`Exact Simplified Chinese cover checks passed for ${simplified.covers.length} existing assets without substituting logos or crossing languages.`);

// Keep the companion runtime matrix inside the existing integration/CI entry point.
execFileSync(process.execPath, ['--test', 'scripts/test-crown-zenith-logo-fallback.cjs'], { stdio: 'inherit' });
