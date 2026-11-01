import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BATCH, PROJECT, BUCKET, REVISION, SOURCE_JPEG, sourceUrl, sourceIdentifier } from './batch.mjs';
import { buildApprovedCatalogueAsset } from './pipeline/assetPipeline.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
const sourcePath = 'D:/Stackr/assets/rev2/11-japanese-set-logo/WhatsApp Image 2026-07-24 at 14.31.55 (4).jpeg';
assert.equal(sha(await fs.readFile(sourcePath)), SOURCE_JPEG);
const objects = [], assets = [];
const storage = {id:'s3_compatible',catalogueStorage:true,catalogueBucket:BUCKET,
 async putObject(input) {
  assert.equal(input.bucket,BUCKET);assert.equal(input.upsert,false);
  assert.ok(input.key.startsWith('public/set_logo/'));assert.ok(!input.key.includes('..'));
  const localPath = path.join(root,'publication/objects',input.key);
  await fs.mkdir(path.dirname(localPath),{recursive:true});await fs.writeFile(localPath,input.body,{flag:'wx'});
  objects.push({key:input.key,localPath,sha256:sha(input.body),bytes:input.body.length,mimeType:input.contentType,
    desiredCacheControl:input.cacheControl,plannedDeliveryUrl:'https://assets.stackrtcg.com/'+input.key});
  return {provider:storage.id,bucket:BUCKET,key:input.key};
 }};
for(const item of BATCH) {
 const inputPath=`D:/Stackr/assets/rev2/11-japanese-set-logo/logos/${item.code}.png`;
 const buffer=await fs.readFile(inputPath);
 assert.equal(sha(buffer),item.sha256);assert.equal(buffer.length,item.bytes);assert.equal(gitBlob(buffer),item.gitBlob);
 const asset=await buildApprovedCatalogueAsset({buffer,mimeType:'image/png',assetType:'set_logo',
  assetId:`reviewed:set-logo:${item.setId}:${item.sha256}`,permissionStatus:'approved',rightsStatus:'approved',storage,
  sourceUrl:sourceUrl(item),sourceIdentifier:sourceIdentifier(item),
  sourceAttribution:'Existing owner-supplied Japanese title crop reviewed in PR203; exact committed PNG retained unchanged. No new upstream acquisition or independently audited vendor licence is asserted.'});
 assert.equal(asset.content_sha256,item.sha256);assert.equal(asset.width,item.width);assert.equal(asset.height,item.height);
 assets.push({target:item,inputPath,asset});
}
assert.equal(objects.length,8);
const sharp=createRequire(path.resolve('backend/package.json'))('sharp');
for(const object of objects) {const bytes=await fs.readFile(object.localPath);await sharp(bytes).raw().toBuffer();
 const meta=await sharp(bytes).metadata();object.width=meta.width;object.height=meta.height;}
const manifest={schemaVersion:'stackr-jp-crop-local-objects-v1',preparedAt:new Date().toISOString(),projectRef:PROJECT,bucket:BUCKET,
 pipelineMainRevision:REVISION,pipelineBlobs:{assetPipeline:'7c34fe02f4a1359f0c15bdf78ab9363744599389',objectStorage:'770ccab72ad2abea207b3bdcbff6814dcb83a229',assetValidation:'7452eea489339d8bca06a0bfacd3dec1e53eaaae'},
 provenance:{sourceFile:sourcePath,sourceSha256:SOURCE_JPEG,manifestGitBlob:'54c00529ca2ad3256aa96840fde417eaca2bf174',
   basis:'Exact existing committed crops, extracted from supplied JPEG and resized by the historic crop repair; no new image generation or claim of unaltered JPEG pixels.',
   standingApprovedReplacement:true,sourceWideAuthority:false,independentlyAuditedVendorLicence:false},
 sharpVersions:sharp.versions,assets,objects,effects:{remoteStorageWrites:0,databaseWrites:0,newSourceRequests:0,published:false}};
await fs.writeFile(path.join(root,'publication/object-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({objects:objects.map(({key,bytes,width,height,sha256})=>({key,bytes,width,height,sha256})),remoteWrites:0}));
