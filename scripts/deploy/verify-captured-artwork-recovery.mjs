import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const backendRequire = createRequire(process.env.STACKR_BACKEND_PACKAGE || new URL('../../backend/package.json',import.meta.url));
const sharp = backendRequire('sharp');

const [phase = 'before'] = process.argv.slice(2);
assert.ok(['before','after'].includes(phase));
const plan = JSON.parse(await readFile('docs/releases/captured-artwork-recovery-plan-20260910.json','utf8'));
const results = [];
for (const sample of plan.samples) {
  const start = performance.now();
  const response = await fetch('https://api.stackrtcg.com/v1/cards/' + sample.variant_id, { signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  const apiElapsedMs = Math.round(performance.now()-start);
  assert.equal(response.status, 200, JSON.stringify(body.error));
  const card = body.data.card;
  const variant = card.variants.find(item => item.variantId === sample.variant_id);
  assert.ok(variant);
  assert.equal(card.languageCode,sample.language_code);
  assert.equal(variant.finishCode,sample.finish_code);
  assert.equal(variant.canonicalId,sample.canonical_key);
  if (phase === 'before') assert.equal(variant.image,null);
  else {
    assert.equal(variant.nativeImageStatus,'same_artwork_reference');
    assert.equal(variant.imageVariantId,sample.target_variant_id);
    assert.equal(variant.sameArtworkAsVariantId,sample.target_variant_id);
    assert.ok(variant.image?.deliveryUrl);
  }
  const files = [{role:'original',storageKey:sample.storage_key,contentSha256:sample.content_sha256,width:sample.width,height:sample.height},...sample.derivative_list];
  const images = await Promise.all(files.map(async file => {
    const url = 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/' + file.storageKey;
    const imageStart = performance.now();
    const imageResponse = await fetch(url,{signal:AbortSignal.timeout(20000)});
    assert.equal(imageResponse.status,200,url);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.contentSha256);
    const decoded = await sharp(bytes).raw().toBuffer({resolveWithObject:true});
    assert.equal(decoded.info.width,file.width);
    assert.equal(decoded.info.height,file.height);
    return {role:file.role,width:decoded.info.width,height:decoded.info.height,bytes:bytes.length,sha256:file.contentSha256,elapsedMs:Math.round(performance.now()-imageStart)};
  }));
  results.push({language:sample.language_code,variantId:sample.variant_id,finish:variant.finishCode,nativeImageStatus:variant.nativeImageStatus,imageVariantId:variant.imageVariantId,image:variant.image,apiElapsedMs,images});
}
await mkdir('outputs/acceptance',{recursive:true});
const result = {generatedAt:new Date().toISOString(),phase,requestId:plan.requestId,results};
await writeFile('outputs/acceptance/captured-artwork-'+phase+'-20260910.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({phase,samples:results.map(r=>({language:r.language,variant:r.variantId,status:r.nativeImageStatus,imagesVerified:r.images.length}))},null,2));
