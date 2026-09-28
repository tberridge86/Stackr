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
// Retain verified originals as bounded recovery artifacts before the older
// source artifacts expire. This copies existing bytes; it never reacquires art.
const originalRoot=`${output}-originals`,originalParts=[];
let part=1,partBytes=0;
for(const r of rows){
  const source=path.resolve(root,r.source_file);
  if(!source.startsWith(path.resolve(root)+path.sep))throw new Error('Invalid source path');
  const bytes=await readFile(source);
  if(hash(bytes)!==r.sha256||bytes.length!==r.byte_size)throw new Error(`Original drift ${r.provider_id}`);
  const info=await sharp(bytes).metadata();
  if(info.width!==r.width||info.height!==r.height||info.format!=='png')throw new Error('Original dimensions changed');
  await sharp(bytes).raw().toBuffer();
  if(partBytes&&partBytes+bytes.length>430*1024*1024){part++;partBytes=0;}
  if(part>2)throw new Error('Frozen originals exceed the reviewed two-part archive scope');
  const originalPart=`part-${String(part).padStart(2,'0')}`;
  const originalCopy=path.resolve(originalRoot,originalPart,r.source_file);
  if(!originalCopy.startsWith(path.resolve(originalRoot,originalPart)+path.sep))throw new Error('Invalid original output path');
  await mkdir(path.dirname(originalCopy),{recursive:true});await writeFile(originalCopy,bytes);
  if(hash(await readFile(originalCopy))!==r.sha256)throw new Error('Original preservation checksum mismatch');
  partBytes+=bytes.length;
  originalParts[part-1]??={part:originalPart,byte_size:0,rows:[]};
  originalParts[part-1].byte_size+=bytes.length;
  originalParts[part-1].rows.push({...r,original_file:r.source_file});
  const derivatives=[];
  for(const spec of CATALOGUE_DERIVATIVE_SPECS){
    const b=await sharp(bytes).rotate().resize({width:spec.width,withoutEnlargement:true}).webp({quality:spec.quality}).toBuffer();
    const digest=hash(b),m=await sharp(b).metadata();await sharp(b).raw().toBuffer();
    const key=`derivatives/${digest}/${spec.role}.webp`;
    await mkdir(path.dirname(path.join(output,key)),{recursive:true});await writeFile(path.join(output,key),b);
    derivatives.push({role:spec.role,file:key,sha256:digest,byte_size:b.length,width:m.width,height:m.height,mime_type:'image/webp'});
  }
  prepared.push({...r,derivatives,original_artifact_part:originalPart,preparation_status:'DERIVATIVES_PREPARED_ORIGINALS_REUSED',permission_status:'REVIEW_REQUIRED',publication_status:'NOT_PUBLISHED',production_writes:0});
  if(prepared.length%25===0)console.log(JSON.stringify({prepared:prepared.length,total:365}));
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(prepared,null,2));
if(originalParts.length!==2||originalParts.reduce((n,p)=>n+p.rows.length,0)!==365)throw new Error('Original preservation cohort incomplete');
for(const p of originalParts)await writeFile(path.join(originalRoot,p.part,'manifest.json'),JSON.stringify(p,null,2));
await writeFile(path.join(output,'summary.json'),JSON.stringify({prepared:365,verified_originals:365,derivatives:1095,original_preservation_parts:originalParts.map(p=>({part:p.part,count:p.rows.length,byte_size:p.byte_size})),source_artifact_ids:[10917120115,10916269076],source_permission_status:'REVIEW_REQUIRED',publication_status:'NOT_PUBLISHED',production_writes:0,at:new Date().toISOString(),encoder_versions:sharp.versions},null,2));
