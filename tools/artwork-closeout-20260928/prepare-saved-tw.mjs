// Prepare derivatives from existing reviewed bytes. No network or database clients.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {CATALOGUE_DERIVATIVE_SPECS} from '../../backend/lib/assetPipeline.js';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const sharp=require('sharp');
const root=process.argv[2],output=process.argv[3];
if(!root||!output)throw new Error('Originals directory and output required');
const rows=JSON.parse(await readFile(new URL('./tw365-cohort.json',import.meta.url),'utf8'));
if(rows.length!==365||new Set(rows.map(r=>r.production_printing_id)).size!==365)throw new Error('Cohort changed');
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});const prepared=[];
for(const r of rows){
  const source=path.resolve(root,r.source_file);
  if(!source.startsWith(path.resolve(root)+path.sep))throw new Error('Invalid source path');
  const bytes=await readFile(source);
  if(hash(bytes)!==r.sha256||bytes.length!==r.byte_size)throw new Error(`Original drift ${r.provider_id}`);
  const info=await sharp(bytes).metadata();
  if(info.width!==r.width||info.height!==r.height||info.format!=='png')throw new Error('Original dimensions changed');
  await sharp(bytes).raw().toBuffer();
  const derivatives=[];
  for(const spec of CATALOGUE_DERIVATIVE_SPECS){
    const b=await sharp(bytes).rotate().resize({width:spec.width,withoutEnlargement:true}).webp({quality:spec.quality}).toBuffer();
    const digest=hash(b),m=await sharp(b).metadata();await sharp(b).raw().toBuffer();
    const key=`derivatives/${digest}/${spec.role}.webp`;
    await mkdir(path.dirname(path.join(output,key)),{recursive:true});await writeFile(path.join(output,key),b);
    derivatives.push({role:spec.role,file:key,sha256:digest,byte_size:b.length,width:m.width,height:m.height,mime_type:'image/webp'});
  }
  prepared.push({...r,derivatives,preparation_status:'DERIVATIVES_PREPARED_ORIGINALS_REUSED',permission_status:'REVIEW_REQUIRED',publication_status:'NOT_PUBLISHED',production_writes:0});
  if(prepared.length%25===0)console.log(JSON.stringify({prepared:prepared.length,total:365}));
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(prepared,null,2));
await writeFile(path.join(output,'summary.json'),JSON.stringify({prepared:365,verified_originals:365,derivatives:1095,source_artifact_ids:[10917120115,10916269076],source_permission_status:'REVIEW_REQUIRED',publication_status:'NOT_PUBLISHED',production_writes:0,at:new Date().toISOString(),encoder_versions:sharp.versions},null,2));
