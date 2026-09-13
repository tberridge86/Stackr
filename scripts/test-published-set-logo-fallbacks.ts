import assert from 'node:assert/strict';
import { getPublishedSetCoverFallback, getPublishedSetLogoFallback } from '../lib/publishedSetLogoFallbacks';
import published from '../lib/generated/publishedSetLogos.generated.json';
import simplified from '../lib/generated/publishedSimplifiedChineseCovers.generated.json';

const abyss = '91be8fc7-b2ed-4169-b41e-0d374e4d466a';
const mega = '42d59aab-eccf-413f-8c19-d88f63664057';
const megaEnergy = '6f4ff21c-f7e5-42bd-9ac1-ce0212ae1061';
assert.match(getPublishedSetLogoFallback({id:abyss,language:'ja'}) ?? '', /d719c4bffba1376171c4ff680cd86fb7a1badb3510b2ed2482820c4b07bfb260\/original.png$/);
assert.equal(getPublishedSetLogoFallback({id:abyss,language:'en'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'ja:M5',language:'zh-cn'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'M5'}), undefined, 'A code without a language must not borrow a foreign logo.');
assert.equal(getPublishedSetLogoFallback({id:'M5',language:'ja'}), getPublishedSetLogoFallback({id:abyss,language:'ja'}));
assert.equal(getPublishedSetLogoFallback({id:megaEnergy,language:'en'}), getPublishedSetLogoFallback({id:mega,language:'en'}));
assert.equal(getPublishedSetLogoFallback({id:'mee',language:'en'}), getPublishedSetLogoFallback({id:mega,language:'en'}));
assert.equal(getPublishedSetLogoFallback({id:megaEnergy,language:'ja'}), undefined);
assert.equal(getPublishedSetLogoFallback({id:'unknown-set',language:'ja'}), undefined);
for(const row of published.logos) {
  const url = getPublishedSetLogoFallback({id:row.setId,language:row.language});
  assert.ok(url?.endsWith(row.storageKey));
  assert.match(row.storageKey, /^public\/set_logo\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\/original\.(png|webp|jpg)$/);
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
