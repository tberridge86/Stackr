#!/usr/bin/env node
/** Bounded private ingestion of the already acquired Queue 1 artifact; never publishes. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';

export const STAGING='lmwfhvexfcoyeuoyrlco';
export const BUCKET='stackr-catalogue-review';
export const RECEIPTS_SHA='41a385fd98255accbd2fd7d51efcf4895ea3ce0cb6a04bec999ad801cc8e00b0';
export const SCOPE={'sm3.5':78,'sm7.5':78,'swsh4.5sv':122,'swsh12.5gg':70};
export const PREFIX='queue1-private-20260927:';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function check(ok,message){if(!ok)throw new Error(message);}
export function nameKey(value){return String(value).normalize('NFKC').toLowerCase().replaceAll('’',"'").replace(/[‐‑–—-](ex|gx)\b/g,' $1').replace(/\s+/g,' ').trim();}
export function assertEnvironment(url,execute){check(url===`https://${STAGING}.supabase.co`,'Only canonical staging is allowed');check(execute===true,'--execute is required for writes');}
export function assertSource(source){check(source?.code==='pokemon_tcg_api' && source.active===true && ['approved','under_review'].includes(source.licence_status),'Source is unavailable, restricted, denied or unknown');}
export function assertBucket(bucket){check(bucket?.id===BUCKET && bucket.public===false,'Review bucket must be private');}
export function selectScope(rows){
  check(Array.isArray(rows)&&rows.length===348,'Expected the fixed 348-receipt cohort');
  const seen=new Set(),hashes=new Set();
  for(const r of rows){
    check(SCOPE[r.set_code] && r.language_code==='en','Out-of-scope set or language');
    check(r.status==='downloaded_review_only' && r.provider==='pokemon_tcg_api_review_only','Unexpected source/status');
    check(r.publication_eligible===false && r.exact_finish_verified===false,'Unexpected publication/finish evidence');
    check(/^[a-f0-9]{64}$/.test(r.image_sha256),'Invalid image digest');
    check(r.image_file===`images/${r.image_sha256}.png`,'Invalid image file path');
    const key=`${r.set_code}:${r.collector_number}`;
    check(!seen.has(key)&&!hashes.has(r.image_sha256),'Duplicate card identity or image bytes');seen.add(key);hashes.add(r.image_sha256);
    const n=r.collector_number;
    const valid=r.set_code==='swsh4.5sv'?/^SV\d{3}$/.test(n)&&+n.slice(2)>=1&&+n.slice(2)<=122:r.set_code==='swsh12.5gg'?/^GG\d{2}$/.test(n)&&+n.slice(2)>=1&&+n.slice(2)<=70:/^[1-9]\d*$/.test(n)&&+n<=78;
    check(valid,'Collector number outside exact cohort');
    const u=new URL(r.image_url);
    check(u.protocol==='https:'&&u.hostname==='images.pokemontcg.io'&&!u.username&&!u.password,'Unexpected source URL');
  }
  for(const [code,total] of Object.entries(SCOPE))check(rows.filter(r=>r.set_code===code).length===total,`Wrong ${code} count`);
  return rows;
}
export function bindRows(rows,set,printings,variants){
  check(set.game_code==='pokemon'&&set.language_code==='en'&&SCOPE[set.set_code],'Wrong canonical set');
  const out=rows.map(r=>{
    const ps=printings.filter(p=>p.set_id===set.id&&p.collector_number===r.collector_number&&p.language_code==='en'&&p.game_code==='pokemon'&&!p.deprecated_at);
    check(ps.length===1,`Non-unique printing: ${set.set_code}/${r.collector_number}`);
    const p=ps[0];check(nameKey(p.english_display_name)===nameKey(r.card_name),`Name mismatch ${set.set_code}/${r.collector_number}`);
    const vs=variants.filter(v=>v.printing_id===p.id&&v.language_code==='en'&&v.game_code==='pokemon'&&v.variant_code===r.variant_code&&v.finish_code===r.finish_code&&!v.deprecated_at);
    check(vs.length===1,`Non-unique variant: ${set.set_code}/${r.collector_number}`);
    return {...r,staging_set_id:set.id,staging_printing_id:p.id,staging_variant_id:vs[0].id};
  });
  check(new Set(out.map(r=>r.staging_printing_id)).size===out.length,'Duplicate binding');return out;
}
export function assetRow(r,source,original,derivatives,stamp){
  return {asset_id:`${PREFIX}${r.staging_printing_id}:${r.image_sha256}`,asset_type:'card_image',game_code:'pokemon',
    set_id:r.staging_set_id,printing_id:r.staging_printing_id,variant_id:null,source_id:source.id,
    url:r.image_url,original_source_url:r.image_url,original_source_identifier:r.provider_card_id,
    storage_provider:'supabase_storage',storage_bucket:BUCKET,storage_key:original.key,storage_path:original.key,
    mime_type:'image/png',width:r.width,height:r.height,byte_size:r.byte_size,sha256:r.image_sha256,content_sha256:r.image_sha256,
    asset_visibility:'public_catalogue',publicly_servable:false,permission_status:'under_review',rights_status:'under_review',
    acquisition_source:'provider_url',recognition_reference_eligible:false,externally_referenced:false,
    retention_status:'active',cache_control:'private, max-age=0, no-store',derivative_list:derivatives,last_verified_at:stamp,
    attribution_text:'Pokémon card artwork; source: Pokémon TCG API / PokemonTCG datasets. Source approval pending.',
    source_attribution:'PokemonTCG/pokemon-tcg-data',
    licensing_review_notes:JSON.stringify({purpose:'owner-requested private staging ingestion; no publication',source_url:r.source_url,source_sha256:r.source_sha256,source_record_sha256:r.source_record_sha256,acquisition_run_id:36303082404,exact_finish_verified:false,artwork_scope:'printing_front',matched_variant_id:r.staging_variant_id,source_registry_status:source.licence_status})};
}
export function assertReviewAsset(a,r){check(a?.asset_id===`${PREFIX}${r.staging_printing_id}:${r.image_sha256}`&&a.printing_id===r.staging_printing_id&&a.set_id===r.staging_set_id&&a.variant_id===null&&a.content_sha256===r.image_sha256&&a.storage_bucket===BUCKET&&a.storage_provider==='supabase_storage'&&a.publicly_servable===false&&a.permission_status==='under_review'&&a.rights_status==='under_review'&&a.recognition_reference_eligible===false,'Existing record is not the exact private review asset');}

async function main(){
  const execute=process.argv.includes('--execute');
  const arg=(name,def)=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3)??def;
  const url=process.env.SUPABASE_URL;assertEnvironment(url,execute);
  check(process.env.SUPABASE_SECRET_KEY,'Missing staging credential');
  const input=path.resolve(arg('input','queue1-source')),output=path.resolve(arg('output','queue1-stage-result'));
  await mkdir(output,{recursive:true});
  const receiptBytes=await readFile(path.join(input,'receipts.json'));check(digest(receiptBytes)===RECEIPTS_SHA,'Acquisition receipt file changed');
  const rows=selectScope(JSON.parse(receiptBytes));
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const backendRequire=createRequire(path.join(root,'backend/package.json'));
  const {createClient}=backendRequire('@supabase/supabase-js'),sharp=backendRequire('sharp');
  const {SupabaseObjectStorageAdapter}=await import(pathToFileURL(path.join(root,'backend/lib/objectStorage.js')));
  const {CATALOGUE_DERIVATIVE_SPECS,contentHashStorageKey}=await import(pathToFileURL(path.join(root,'backend/lib/assetPipeline.js')));
  check(JSON.stringify(CATALOGUE_DERIVATIVE_SPECS.map(s=>[s.role,s.width,s.quality]))===JSON.stringify([['card-grid',240,82],['search-result',96,78],['detail-page',720,86]]),'Derivative contract changed; inspect before ingestion');
  const limitedFetch=(u,options={})=>fetch(u,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
  const client=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:limitedFetch}});
  const storage=new SupabaseObjectStorageAdapter(client);
  const result=async query=>{const {data,error}=await query;if(error)throw new Error(error.message);return data;};
  const source=await result(client.schema('ingest').from('sources').select('id,code,active,licence_status').eq('code','pokemon_tcg_api').single());assertSource(source);
  const plans=[];
  // Validate EVERY identity and input file before the first storage or database write.
  for(const code of Object.keys(SCOPE)){
    const set=await result(client.schema('catalog').from('sets').select('id,set_code,game_code,language_code').eq('set_code',code).eq('game_code','pokemon').eq('language_code','en').is('deprecated_at',null).single());
    const printings=await result(client.schema('catalog').from('card_printings').select('id,set_id,collector_number,english_display_name,language_code,game_code,deprecated_at').eq('set_id',set.id).is('deprecated_at',null).limit(500));
    const variants=await result(client.schema('catalog').from('card_variants').select('id,printing_id,variant_code,finish_code,language_code,game_code,deprecated_at').eq('set_id',set.id).is('deprecated_at',null).limit(1000));
    check(variants.length<1000&&printings.length<500,'Potential truncated identity export');
    const bound=bindRows(rows.filter(r=>r.set_code===code),set,printings,variants);
    for(const r of bound){const raw=await readFile(path.join(input,r.image_file));check(digest(raw)===r.image_sha256&&raw.length===r.byte_size,'Original hash/size mismatch');const m=await sharp(raw).metadata();check(m.format==='png'&&m.width===r.width&&m.height===r.height&&m.width===734&&m.height===1024,'Unexpected decoded original');}
    plans.push(...bound);
  }
  await writeFile(path.join(output,'binding-manifest.json'),JSON.stringify(plans,null,2));
  let {data:buckets,error:bucketListError}=await client.storage.listBuckets();if(bucketListError)throw new Error(bucketListError.message);
  if(!buckets.some(b=>b.id===BUCKET)){await result(client.storage.createBucket(BUCKET,{public:false,fileSizeLimit:10*1024*1024,allowedMimeTypes:['image/png','image/webp']}));}
  assertBucket(await result(client.storage.getBucket(BUCKET)));
  const journal=[];const startedAt=new Date().toISOString();
  async function save(){
    await writeFile(path.join(output,'receipts.json'),JSON.stringify(journal,null,2));
    const counts={};for(const code of Object.keys(SCOPE))counts[code]=journal.filter(r=>r.set_code===code&&r.status==='private_staging_verified').length;
    const summary={observed_at:new Date().toISOString(),started_at:startedAt,project:STAGING,bucket:BUCKET,target_count:348,private_staging_verified:Object.values(counts).reduce((a,b)=>a+b,0),by_set:counts,publicly_released:0,production_changes:0,source_status:source.licence_status,run_id:process.env.GITHUB_RUN_ID,revision:process.env.GITHUB_SHA};
    await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  }
  async function uploadAndVerify(raw,role,format,metadata){
    const hash=digest(raw),key=contentHashStorageKey({visibility:'private-review',assetType:'card_image',sha256:hash,role,extension:format});
    let created=true;
    try{await storage.putObject({bucket:BUCKET,key,body:raw,contentType:format==='png'?'image/png':'image/webp',cacheControl:'private, max-age=0, no-store',upsert:false});}
    catch(e){if(/already exists|duplicate/i.test(String(e?.message))||Number(e?.statusCode??e?.status)===409)created=false;else throw e;}
    const readback=await storage.getObject(BUCKET,key,{maxBytes:10*1024*1024});check(digest(readback)===hash,'Storage readback hash mismatch');
    const info=await sharp(readback).metadata();check(info.width===metadata.width&&info.height===metadata.height,'Storage dimensions mismatch');
    return {key,role,sha256:hash,byteSize:raw.length,width:metadata.width,height:metadata.height,mimeType:format==='png'?'image/png':'image/webp',created};
  }
  async function ingest(r){
    const aid=`${PREFIX}${r.staging_printing_id}:${r.image_sha256}`;
    const item={set_code:r.set_code,collector_number:r.collector_number,printing_id:r.staging_printing_id,asset_id:aid,status:'started',objects:[]};journal.push(item);
    const existing=await result(client.schema('catalog').from('assets').select('*').eq('asset_id',aid).maybeSingle());
    if(existing)assertReviewAsset(existing,r);
    const approved=await result(client.schema('catalog').from('assets').select('id').eq('printing_id',r.staging_printing_id).eq('asset_type','card_image').eq('publicly_servable',true).eq('rights_status','approved').is('deleted_at',null).is('deprecated_at',null).limit(1));
    check(approved.length===0,'New approved artwork exists; preserve it and replan this set');
    const raw=await readFile(path.join(input,r.image_file));
    const original=await uploadAndVerify(raw,'original','png',{width:r.width,height:r.height});item.objects.push(original);
    const derivatives=[];
    for(const spec of CATALOGUE_DERIVATIVE_SPECS){
      const buf=await sharp(raw).rotate().resize({width:spec.width,withoutEnlargement:true}).webp({quality:spec.quality}).toBuffer();
      const m=await sharp(buf).metadata();const o=await uploadAndVerify(buf,spec.role,'webp',m);item.objects.push(o);
      derivatives.push({role:o.role,storageProvider:'supabase_storage',storageBucket:BUCKET,storageKey:o.key,mimeType:o.mimeType,width:o.width,height:o.height,byteSize:o.byteSize,sha256:o.sha256});
    }
    const payload=assetRow(r,source,original,derivatives,new Date().toISOString());
    let stored=existing;
    if(!existing)stored=await result(client.schema('catalog').from('assets').insert(payload).select('*').single());
    assertReviewAsset(stored,r);check(isDeepStrictEqual(stored.derivative_list,derivatives),'Persisted derivative mapping differs');
    item.id=stored.id;item.asset_created=!existing;item.status='private_staging_verified';
    return item;
  }
  try{
    // First 78 must complete before the remaining sets enter this ingestion lane.
    for(const code of Object.keys(SCOPE)){
      const setPlans=plans.filter(r=>r.set_code===code);
      for(let i=0;i<setPlans.length;i+=2){
        const outcomes=await Promise.allSettled(setPlans.slice(i,i+2).map(ingest));
        if(outcomes.some(o=>o.status==='rejected')){await save();throw new Error(outcomes.filter(o=>o.status==='rejected').map(o=>o.reason?.message).join('; '));}
        if(i%20===0)await save();
      }
      assertBucket(await result(client.storage.getBucket(BUCKET)));
      const done=journal.filter(r=>r.set_code===code&&r.status==='private_staging_verified');check(done.length===SCOPE[code],'First-set/set acceptance incomplete');
      for(const sample of [done[0],done.at(-1)]){
        for(const obj of [sample.objects[0],sample.objects[3]]){
          const response=await fetch(`${url}/storage/v1/object/public/${BUCKET}/${obj.key}`,{signal:AbortSignal.timeout(15000)});
          check([400,401,403,404].includes(response.status),'Private image unexpectedly publicly accessible or privacy probe inconclusive');
          sample.public_access_status=response.status;
        }
      }
      await save();
    }
    const assets=await result(client.schema('catalog').from('assets').select('id,printing_id,asset_id,publicly_servable,rights_status,permission_status,storage_bucket').like('asset_id',`${PREFIX}%`).is('deleted_at',null).limit(500));
    check(assets.length===348&&new Set(assets.map(a=>a.printing_id)).size===348,'Final private asset census not 348');
    check(assets.every(a=>a.publicly_servable===false&&a.rights_status==='under_review'&&a.permission_status==='under_review'&&a.storage_bucket===BUCKET),'Private review policy changed');
    const sourceAfter=await result(client.schema('ingest').from('sources').select('id,code,active,licence_status').eq('id',source.id).single());check(isDeepStrictEqual(sourceAfter,source),'Source registry changed during import');
    await save();
  }catch(error){await save();await writeFile(path.join(output,'error.json'),JSON.stringify({error:String(error.message),at:new Date().toISOString()},null,2));throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
