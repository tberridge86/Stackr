import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { transformSync } from 'esbuild';
import published from '../lib/generated/publishedSetLogos.generated.json';
import simplified from '../lib/generated/publishedSimplifiedChineseCovers.generated.json';
import reviewedSupersessions from '../lib/generated/publishedSetAssetSupersessions.generated.json';
const compiled = transformSync(readFileSync(new URL('../lib/publishedSetLogoFallbacks.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function loadForEnvironment(supabaseUrl: string, environment = 'staging') {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    if (id === './generated/publishedSetLogos.generated.json') return published;
    if (id === './generated/publishedSimplifiedChineseCovers.generated.json') return simplified;
    if (id === './mobileRuntimeConfig') return { MOBILE_RUNTIME_CONFIG: { supabaseUrl, environment } };
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
  if (!isReviewedCrown) assert.match(row.storageKey, /^public\/set_logo\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\/original\.(png|webp|jpg)$/);
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

const production = loadForEnvironment('https://production-test.invalid', 'production');
const centralUrl = (row: { storageKey: string; deliveryUrl?: string; detailUrl?: string }) => row.detailUrl ?? row.deliveryUrl ?? storageRoot + row.storageKey;
const supersessionsById = new Map(reviewedSupersessions.supersessions.map(row => [row.setId, row]));
assert.equal(published.deliveryEnvironment, 'production');
assert.equal(simplified.deliveryEnvironment, 'production');
for (const row of published.logos) {
  assert.equal(new URL(row.deliveryUrl).origin, 'https://assets.stackrtcg.com', 'every production logo has a recorded central original');
  assert.equal(new URL(centralUrl(row)).origin, 'https://assets.stackrtcg.com');
  const replacement = supersessionsById.get(row.setId);
  if (replacement) {
    assert.equal(row.assetId, replacement.assetId);
    assert.equal(row.contentSha256, replacement.contentSha256);
    assert.equal(row.deliveryUrl, replacement.deliveryUrl);
    assert.ok(row.storageKey.includes(replacement.previousContentSha256), 'preserve the superseded original pointer');
    assert.ok(published.deliveryEvidence.some(capture => capture.requestId === replacement.captureRequestId
      && capture.generatedAt === replacement.captureGeneratedAt), 'replacement remains bound to its captured evidence');
  } else {
    assert.ok(row.storageKey.includes(row.contentSha256), 'an unchanged original keeps its exact content hash');
  }
  assert.equal(production.getPublishedSetLogoFallback({ id: row.setId, language: row.language }), centralUrl(row));
}
for (const row of simplified.covers) {
  assert.equal(new URL(row.deliveryUrl).origin, 'https://assets.stackrtcg.com', 'every production cover has a recorded central original');
  assert.ok(row.storageKey.includes(row.contentSha256));
  assert.equal(production.getPublishedSetCoverFallback({ id: row.setId, language: 'zh-cn' }), centralUrl(row));
}
// Pin the independently observed Crown migration URL, not a host substitution.
const crownR2 = 'https://assets.stackrtcg.com/public/set_logo/ff9a66a8-eb6f-4f35-957d-32d6425fb826/38b2f73ebcefaa1937a018d658dc23cd393faf2dcb144a05e7064166fe1b6ab2/dcc01afe69d851972c3c5a05a64fb9c939d1a5df6906e8d0b4be33f682627c92/original.png';
assert.equal(production.getPublishedSetLogoFallback({ id: crown, language: 'en' }), crownR2);
assert.equal(production.getPublishedSetLogoFallback({ id: gallery, language: 'en' }), crownR2);

// Keep the companion runtime matrix inside the existing integration/CI entry point.
execFileSync(process.execPath, ['--test', fileURLToPath(new URL('./test-crown-zenith-logo-fallback.cjs', import.meta.url))], { stdio: 'inherit' });
execFileSync(process.execPath, [fileURLToPath(new URL('./test-published-set-asset-delivery.mjs', import.meta.url))], { stdio: 'inherit' });
