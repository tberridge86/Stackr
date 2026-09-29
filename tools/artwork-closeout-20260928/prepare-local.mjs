// Offline preparation only. This file has no network, storage or database client.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: prepare-local.mjs acquired-directory output-directory');
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
if(!runtime)throw Error('Codex primary runtime required for this offline preparation');
const require=createRequire(path.join(runtime,'sharp','package.json'));
const sharp=require('sharp');sharp.concurrency(2);
const hash=b=>createHash('sha256').update(b).digest('hex');
const specs=[{role:'card-grid',width:240,quality:82},{role:'search-result',width:96,quality:78},{role:'detail-page',width:720,quality:86}];
const pipeline=await readFile(new URL('../../backend/lib/assetPipeline.js',import.meta.url),'utf8');
for(const s of specs){
  if(!pipeline.includes(`{ role: '${s.role}', width: ${s.width}, format: 'webp', quality: ${s.quality} }`))throw Error('Derivative specifications changed; review before regenerating');
}
await mkdir(path.join(output,'results'),{recursive:true});
const names=(await readdir(path.join(input,'results'))).filter(f=>f.endsWith('.json')).sort();
const rows=[];for(const name of names){const r=JSON.parse(await readFile(path.join(input,'results',name),'utf8'));if(r.status==='acquired_for_review')rows.push(r);}
if(new Set(rows.map(r=>r.printing_id)).size!==rows.length)throw Error('Duplicate printing');
const prepared=[];let next=0;
async function prepare(r){
  const source=path.resolve(input,r.image_file);
  if(!source.startsWith(path.resolve(input)+path.sep))throw Error('Unsafe source path');
  const b=await readFile(source);
  if(hash(b)!==r.sha256||b.length!==r.byte_size)throw Error(`Original drift: ${r.printing_id}`);
  const m=await sharp(b).metadata();await sharp(b).raw().toBuffer();
  if(m.width!==r.width||m.height!==r.height)throw Error('Original dimension drift');
  const derivatives=[];
  for(const spec of specs){
    const bytes=await sharp(b).rotate().resize({width:spec.width,withoutEnlargement:true}).webp({quality:spec.quality}).toBuffer();
    const digest=hash(bytes),info=await sharp(bytes).metadata();await sharp(bytes).raw().toBuffer();
    const file=`objects/${digest}/${spec.role}.webp`;
    await mkdir(path.dirname(path.join(output,file)),{recursive:true});await writeFile(path.join(output,file),bytes);
    derivatives.push({role:spec.role,file,sha256:digest,byte_size:bytes.length,width:info.width,height:info.height,mime_type:'image/webp'});
  }
  const result={...r,derivatives,preparation_status:'ORIGINAL_AND_THREE_DERIVATIVES_VERIFIED',publication_status:'NOT_PUBLISHED',production_writes:0,exact_finish_verified:false};
  await writeFile(path.join(output,'results',r.printing_id+'.json'),JSON.stringify(result,null,2));
  prepared.push(result);if(prepared.length%250===0)console.log(JSON.stringify({prepared:prepared.length,total:rows.length}));
}
await Promise.all(Array.from({length:3},async()=>{while(next<rows.length){const row=rows[next++];await prepare(row);}}));
prepared.sort((a,b)=>a.set_code.localeCompare(b.set_code)||a.collector_number.localeCompare(b.collector_number));
await writeFile(path.join(output,'manifest.json'),JSON.stringify(prepared,null,2));
const summary={at:new Date().toISOString(),prepared_printings:prepared.length,verified_originals:prepared.length,verified_derivatives:prepared.length*3,original_bytes:prepared.reduce((n,r)=>n+r.byte_size,0),derivative_bytes:prepared.reduce((n,r)=>n+r.derivatives.reduce((s,d)=>s+d.byte_size,0),0),publication_status:'NOT_PUBLISHED',production_writes:0,encoder_versions:sharp.versions,pipeline_file_sha256:hash(pipeline),specifications:specs};
await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
