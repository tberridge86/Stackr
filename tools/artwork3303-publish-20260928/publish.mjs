// Bounded artwork release. Uses the existing public asset schema, storage and release lane.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, digest, retryStorageRead } from '../queue1-publish-20260927/publish.mjs';
import { resolveServerKey } from '../queue1-publish-20260927/credentials.mjs';

export const PROJECTS = { staging:'lmwfhvexfcoyeuoyrlco', production:'oakdbbzdqwurpjnoqhmu' };
export const BUCKET = 'stackr-catalogue-public';
export const PREFIX = 'artwork-recovered-20260928:';
export const COHORT_SHA = '20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd';
export const FRONTS = 7911;
export const STAGE_JA = 'd560cd01-de2a-4713-9518-b967fb4c5ac9';
export const STAGE_ALIASES = {'SM1+':'SM1p','SM2+':'SM2p','SM5+':'SM5p'};
export const SOURCE_COUNTS = {"pokemon_card_tw_official":4926,"pokemon_card_jp_official":2063,"pokedata_japanese":335,"tcgdex":163,"pokemon_tcg_api":424};
const approvalFile = new URL('./approval.json',import.meta.url);
const publicUrl = key => `https://${PROJECTS.production}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`;
const normalize = x => String(x).normalize('NFKC');
export function objectKey(o) {
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[o.mime_type];
  if(o.role==='original') {
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(o.printing_id??''),'Original storage requires its exact printing identity');
    return `public/card_image/printing/${o.printing_id}/${o.sha256}/original.${extension}`;
  }
  return `public/card_image/${o.sha256.slice(0,2)}/${o.sha256.slice(2,4)}/${o.sha256}/${o.role}.${extension}`;
}
export const publicationObjects = rows => [...new Map(rows.flatMap(r=>r.objects.map(o=>o.role==='original'?{...o,printing_id:r.printing_id}:o)).map(o=>[objectKey(o),o])).values()];
export async function uploadImmutable(upload,wait) {
  return retryStorageRead(async()=>{
    const result=await upload();
    if(!result.error)return true;
    const error=result.error,status=Number(error.statusCode??error.status);
    if(status===409||(status===400&&/already exists|duplicate/i.test(error.message??'')))return false;
    const code=/^[A-Za-z0-9_]{1,80}$/.test(error.code??'')?error.code:'unspecified';
    const transport=/fetch failed|ECONNRESET|timed? ?out|timeout/i.test(error.message??'');
    throw Object.assign(new Error(`Storage upload failed (HTTP ${Number.isFinite(status)?status:'unknown'}, ${code}${transport?', fetch failed':''})`),{status});
  },wait);
}
export const assetId = r => `${PREFIX}${r.printing_id}:${r.objects[0].sha256}`;
export const chunks = (rows,size=100) => Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));
export function safePath(root,relative) {
  check(typeof relative==='string' && !relative.includes('\\') && !path.isAbsolute(relative),'Unsafe package path');
  const target=path.resolve(root,relative);check(target.startsWith(path.resolve(root)+path.sep),'Escaped package path');return target;
}
export function assertNoConflictingFronts(rows) {
  const seen=new Map();
  for(const r of rows) {
    const hash=r.objects[0].sha256,prior=seen.get(hash);
    if(prior) {
      const sameName=normalize(prior.card_native_name).replace(/[【】]/g,'')===normalize(r.card_native_name).replace(/[【】]/g,'');
      const sameLanguage=prior.language_code===r.language_code;
      const sameIdentity=sameName&&sameLanguage&&prior.set_code===r.set_code&&prior.collector_number===r.collector_number;
      const sharedEnergy=sameName&&sameLanguage&&/^[A-Z]{3}$/.test(r.collector_number)&&prior.collector_number===r.collector_number&&r.card_native_name.includes('能量');
      check(sameIdentity||sharedEnergy,'One original image maps to conflicting card identities');
    } else seen.set(hash,r);
  }
}
export function validatePlan(bytes,receipt) {
  check(receipt.cohort_sha256===COHORT_SHA && digest(bytes)===COHORT_SHA,'Frozen cohort bytes changed');
  const rows=JSON.parse(gunzipSync(bytes));
  check(rows.length===FRONTS && new Set(rows.map(r=>r.printing_id)).size===FRONTS,'Wrong printing cohort');
  for(const [code,count] of Object.entries(SOURCE_COUNTS)) check(rows.filter(r=>r.source_code===code).length===count,'Source cohort changed');
  const allowed={pokemon_card_jp_official:['ja','www.pokemon-card.com'],pokedata_japanese:['ja','pokemoncardimages.pokedata.io'],pokemon_tcg_api:['en','images.pokemontcg.io'],tcgdex:[['zh-tw','en'],'assets.tcgdex.net'],pokemon_card_tw_official:['zh-tw','asia.pokemon-card.com']};
  for(const r of rows) {
    const u=new URL(r.image_url),scope=allowed[r.source_code];
    check(scope && (Array.isArray(scope[0])?scope[0].includes(r.language_code):r.language_code===scope[0]) && u.protocol==='https:' && u.hostname===scope[1] && !u.username && !u.password,'Wrong source scope');
    for(const key of ['printing_id','set_id','catalogue_version_id'])check(/^[a-f0-9-]{36}$/.test(r[key]),'Invalid catalogue identity');
    check(r.objects.length===4 && r.objects[0].role==='original' && new Set(r.objects.map(o=>o.role)).size===4,'Incomplete object cohort');
    for(const o of r.objects) {
      check(['original','card-grid','search-result','detail-page'].includes(o.role),'Unexpected role');
      check(/^[a-f0-9]{64}$/.test(o.sha256) && o.byte_size>0 && o.byte_size<12_000_000 && o.width>0 && o.height>0,'Invalid object evidence');
      check(o.role==='original' ? ['image/png','image/jpeg','image/webp'].includes(o.mime_type) : o.mime_type==='image/webp','Wrong object format');
      check(receipt.artifacts.some(a=>a.id===o.artifact_id),'Unknown artifact');
      safePath('/packages',`${o.artifact_id}/${o.file}`);
    }
  }
  assertNoConflictingFronts(rows);
  return rows;
}
export function validateApproval(approval,receipt) {
  check(approval.approved===true && approval.cohort_sha256===receipt.cohort_sha256 && approval.fronts===FRONTS,'Specific publication approval is pending');
  check(approval.store_resize_display_official_tw===true && approval.official_tw_fronts===SOURCE_COUNTS.pokemon_card_tw_official,'Official Taiwanese source permission is pending');
  check(typeof approval.owner_statement==='string' && approval.owner_statement.trim().length>0 && approval.approved_at,'Owner evidence missing');
}
export function assertConfig(env) {
  check(env.GITHUB_REF==='refs/heads/main' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'') && env.GITHUB_SHA===env.STACKR_EXPECTED_MAIN_SHA,'Protected exact main required');
  check(env.STACKR_ARTWORK3303_CONFIRMATION==='PUBLISH ARTWORK3303','Bounded confirmation required');
  for(const [kind,key] of [['staging','SUPABASE_STAGING_DB_URL'],['production','SUPABASE_DB_URL']]) {
    const u=new URL(env[key]),project=PROJECTS[kind];
    check(['postgres:','postgresql:'].includes(u.protocol)&&!u.search&&!u.hash,'Invalid database URL');
    check(u.hostname===`db.${project}.supabase.co`||(u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username)===`postgres.${project}`),'Wrong database project');
  }
}
export function bind(rows,cards,environment) {
  const ids=new Set(rows.map(r=>r.printing_id));check(cards.every(c=>ids.has(c.printing_id)),'Unexpected catalogue rows');
  for(const r of rows) {
    const matches=cards.filter(c=>c.printing_id===r.printing_id);check(matches.length>0,'Missing printing');
    const expected={...r};
    if(environment==='staging'&&r.language_code==='ja'){expected.catalogue_version_id=STAGE_JA;expected.set_code=STAGE_ALIASES[r.set_code]??r.set_code;}
    for(const c of matches) {
      check(c.game_code==='pokemon'&&!c.same_artwork_as_variant_id,'Wrong game or existing artwork reference');
      for(const k of ['set_id','set_code','printing_id','language_code','collector_number','card_native_name','catalogue_version_id'])check(normalize(c[k])===normalize(expected[k]),`Catalogue identity changed: ${k}`);
    }
  }
}
export async function cardsFor(db,rows) {
  const out=[];
  for(const batch of chunks(rows,500))out.push(...(await db.query('select game_code,language_code,set_id,set_code,printing_id,collector_number,card_native_name,variant_id,same_artwork_as_variant_id,catalogue_version_id from api.catalogue_cards where printing_id=any($1::uuid[])',[batch.map(r=>r.printing_id)])).rows);
  return out;
}
export async function visibleAssets(db,rows,cards) {
  const ids=(await db.query(`select id from catalog.assets where asset_type='card_image' and (printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]))
    union select asset_id as id from catalog.catalogue_version_assets where asset_type='card_image' and (printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]))`,[rows.map(r=>r.printing_id),cards.map(c=>c.variant_id)])).rows.map(r=>r.id);
  if(!ids.length)return [];
  return (await db.query('select * from api.asset_manifest where asset_row_id=any($1::uuid[]) and catalogue_version_id=any($2::uuid[])',[ids,[...new Set(cards.map(c=>c.catalogue_version_id))]])).rows;
}
export function assertManifest(rows,found,complete=false) {
  if(complete)check(found.length===rows.length&&new Set(found.map(a=>a.printing_id)).size===rows.length,'Incomplete public manifest');
  const byId=new Map(rows.map(r=>[r.printing_id,r]));
  for(const a of found){const r=byId.get(a.printing_id);check(r&&a.asset_id===assetId(r)&&a.variant_id===null&&a.content_sha256===r.objects[0].sha256,'Existing artwork requires review');}
}
export function payload(r,sourceId,receipt,approval,environment) {
  const o=r.objects[0],key=objectKey({...o,printing_id:r.printing_id}),url=`https://${PROJECTS[environment]}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`;
  return {asset_id:assetId(r),asset_type:'card_image',game_code:'pokemon',set_id:r.set_id,printing_id:r.printing_id,variant_id:null,source_id:sourceId,
    url,original_source_url:r.image_url,original_source_identifier:`${r.set_code}/${r.collector_number}`,storage_provider:'supabase_storage',storage_bucket:BUCKET,storage_key:key,storage_path:key,
    mime_type:o.mime_type,width:o.width,height:o.height,byte_size:o.byte_size,sha256:o.sha256,content_sha256:o.sha256,asset_visibility:'public_catalogue',publicly_servable:true,permission_status:'approved',rights_status:'approved',
    acquisition_source:'provider_url',recognition_reference_eligible:false,externally_referenced:false,retention_status:'active',cache_control:'public, max-age=31536000, immutable',
    derivative_list:r.objects.slice(1).map(d=>({role:d.role,storageProvider:'supabase_storage',storageBucket:BUCKET,storageKey:objectKey(d),mimeType:d.mime_type,width:d.width,height:d.height,byteSize:d.byte_size,sha256:d.sha256})),
    attribution_text:`Pokémon card artwork; image source: ${r.source_code}.`,source_attribution:r.source_code,
    licensing_review_notes:JSON.stringify({cohort_sha256:receipt.cohort_sha256,approval_sha256:digest(Buffer.from(JSON.stringify(approval))),artwork_scope:'printing_front',exact_finish_verified:false,recognition_approved:false,source_evidence:r.evidence})};
}
async function sourcesFor(db,receipt) {
  const notes=`Provenance only; acquisition inactive. Exactly ${SOURCE_COUNTS.pokemon_card_tw_official} Taiwanese fronts in the frozen recovered-artwork cohort ${receipt.cohort_sha256}; no source-wide approval.`;
  await db.query("insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values('pokemon_card_tw_official','Pokémon Taiwan official artwork','image','https://asia.pokemon-card.com/tw','under_review',true,false,$1) on conflict(code) do nothing",[notes]);
  const sources=(await db.query('select * from ingest.sources where code=any($1::text[]) for share',[Object.keys(SOURCE_COUNTS)])).rows;
  check(sources.length===5,'Missing provenance source');
  for(const s of sources) {
    check(!s.deprecated_at,'Source deprecated');
    if(s.code==='pokemon_card_tw_official')check(s.active===false&&s.licence_status==='under_review'&&s.base_url==='https://asia.pokemon-card.com/tw'&&s.internal_notes===notes,'Taiwan provenance conflict');
    else check(s.active===true&&s.licence_status===(s.code==='pokemon_tcg_api'?'under_review':'approved'),'Existing source policy changed');
  }
  return new Map(sources.map(s=>[s.code,s.id]));
}
export async function writeMetadata(db,rows,receipt,approval,environment,journal,sourceResolver=sourcesFor,catalogueCorrection=null,nativeNameCorrections=null) {
  if(catalogueCorrection){
    const correction=await catalogueCorrection(db,environment);
    check(Array.isArray(correction)&&correction.length===1&&correction[0].table==='catalog.sets'&&correction[0].column==='printed_total'&&typeof correction[0].changed==='boolean','Invalid bounded catalogue correction audit');
    journal.catalogue_corrections??=[];journal.catalogue_corrections.push(...correction.map(a=>({...a,environment})));journal.metadata_changes+=correction.filter(a=>a.changed).length;
  }
  if(nativeNameCorrections){
    const expectedNativeCorrections=receipt.native_name_corrections??53;
    check(Number.isInteger(expectedNativeCorrections)&&[53,70,71,72,74,81,97].includes(expectedNativeCorrections),'Unsupported native-name correction count');
    const audit=await nativeNameCorrections(db,environment);
    check(Array.isArray(audit)&&audit.length===expectedNativeCorrections&&audit.every(a=>a.table==='catalog.card_printings'&&a.column==='native_name'&&typeof a.changed==='boolean'&&typeof a.id==='string'&&typeof a.native_name_row_id==='string'&&typeof a.before==='string'&&typeof a.after==='string'&&a.environment===environment),'Invalid native-name correction audit');
    check(new Set(audit.map(a=>a.id)).size===expectedNativeCorrections&&new Set(audit.map(a=>a.native_name_row_id)).size===expectedNativeCorrections,'Native-name correction audit identities are not unique');
    journal.native_name_corrections??=[];journal.native_name_corrections.push(...audit.map(a=>({...a,environment})));
    const changed=audit.filter(a=>a.changed).length;
    journal.native_name_correction_counts={total:journal.native_name_corrections.length,changed,printing_changes:changed,card_name_changes:changed};journal.metadata_changes+=changed;
  }
  const cards=await cardsFor(db,rows);bind(rows,cards,environment);
  const versions=[...new Set(cards.map(c=>c.catalogue_version_id))];
  check((await db.query("select id from catalog.catalogue_versions where id=any($1::uuid[]) and status='published' and deprecated_at is null for share",[versions])).rows.length===versions.length,'Catalogue version changed');
  assertManifest(rows,await visibleAssets(db,rows,cards));
  const sources=await sourceResolver(db,receipt,environment);
  const plans=rows.map(r=>payload(r,sources.get(r.source_code),receipt,approval,environment));
  for(const batch of chunks(plans)) {
    const keys=Object.keys(batch[0]);
    const inserted=(await db.query(`insert into catalog.assets(${keys.join(',')}) select ${keys.map(k=>'x.'+k).join(',')} from jsonb_populate_recordset(null::catalog.assets,$1::jsonb) x on conflict do nothing returning id`,[JSON.stringify(batch)])).rows;
    const saved=(await db.query('select * from catalog.assets where asset_id=any($1::text[])',[batch.map(p=>p.asset_id)])).rows;
    check(saved.length===batch.length,'Asset insertion conflict');
    for(const p of batch){const a=saved.find(a=>a.asset_id===p.asset_id);check(!a.deleted_at&&!a.deprecated_at&&!a.unavailable_reason,'Unavailable asset');a.byte_size=Number(a.byte_size);for(const k of keys)check(isDeepStrictEqual(a[k],p[k]),`Stored asset drift: ${k}`);journal.assets.push({id:a.id,printing_id:p.printing_id,created:inserted.some(i=>i.id===a.id)});}
    const links=saved.map(a=>({catalogue_version_id:cards.find(c=>c.printing_id===a.printing_id).catalogue_version_id,language_code:rows.find(r=>r.printing_id===a.printing_id).language_code,set_id:a.set_id,printing_id:a.printing_id,variant_id:null,asset_id:a.id,asset_type:'card_image'}));
    const keysL=Object.keys(links[0]);const added=(await db.query(`insert into catalog.catalogue_version_assets(${keysL.join(',')}) select ${keysL.map(k=>'x.'+k).join(',')} from jsonb_populate_recordset(null::catalog.catalogue_version_assets,$1::jsonb) x on conflict do nothing returning asset_id,catalogue_version_id`,[JSON.stringify(links)])).rows;
    journal.links.push(...links.map(l=>({...l,created:added.some(a=>a.asset_id===l.asset_id&&a.catalogue_version_id===l.catalogue_version_id)})));
  }
  const visible=await visibleAssets(db,rows,cards);assertManifest(rows,visible,true);
  for(const p of plans){const a=visible.find(a=>a.asset_id===p.asset_id);check(a.storage_key===p.storage_key&&isDeepStrictEqual(a.derivative_list,p.derivative_list),'Manifest object drift');}
}
export async function rehearse(db,write) {
  await db.query('begin isolation level serializable');
  try{await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");await write();}finally{await db.query('rollback');}
}
export async function validateBytes(sharp,bytes,o) {
  check(bytes.length===o.byte_size&&digest(bytes)===o.sha256,'Object bytes changed');
  const m=await sharp(bytes).metadata(),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  check(m.format===({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[o.mime_type])&&decoded.info.width===o.width&&decoded.info.height===o.height,`Decoded image changed: ${o.sha256}/${o.role}; expected ${o.mime_type} ${o.width}x${o.height}; observed ${m.format} ${decoded.info.width}x${decoded.info.height}`);
}
async function main() {
  assertConfig(process.env);check(process.argv.includes('--execute'),'Explicit execution required');
  const receipt=JSON.parse(await readFile(new URL('./plan-receipt.json',import.meta.url))),approval=JSON.parse(await readFile(approvalFile));
  validateApproval(approval,receipt);const rows=validatePlan(await readFile(new URL('./cohort.json.gz',import.meta.url)),receipt);
  const root=process.env.STACKR_ARTWORK3303_PACKAGES,output=process.env.STACKR_ARTWORK3303_OUTPUT;check(root&&output,'Package and receipt directories required');await mkdir(output,{recursive:true});
  await publishFrozenCohort({rows,receipt,approval,root,output});
}
// Shared verified transfer/transaction path; callers retain their own frozen scope guards.
export async function publishFrozenCohort({rows,receipt,approval,root,output,sourceResolver=sourcesFor,catalogueCorrection=null,nativeNameCorrections=null}) {
  check(root&&output&&rows.length>0,'Package, receipt and frozen rows required');await mkdir(output,{recursive:true});
  const journal={status:'preflight',revision:process.env.GITHUB_SHA,started_at:new Date().toISOString(),cohort_sha256:receipt.cohort_sha256,assets:[],links:[],objects:[],ownership_changes:0,metadata_changes:0,pricing_changes:0,device_verified:false};
  const save=()=>writeFile(path.join(output,'receipt.json'),JSON.stringify(journal,null,2));await save();
  const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sharp=require('sharp');sharp.concurrency(2);
  const objects=publicationObjects(rows);
  const source=o=>readFile(safePath(root,`${o.artifact_id}/${o.file}`));
  const read=url=>retryStorageRead(async()=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok){await r.body?.cancel();throw Object.assign(new Error(`Public object read ${r.status}`),{status:r.status});}const b=Buffer.from(await r.arrayBuffer());check(b.length<12_000_000,'Oversized object');return b;});
  // Verify every frozen byte before opening a database or uploading anything.
  for(const batch of chunks(objects,3)){const results=await Promise.allSettled(batch.map(async o=>validateBytes(sharp,await source(o),o)));const bad=results.find(x=>x.status==='rejected');if(bad)throw bad.reason;}
  journal.local_files_verified=objects.length;await save();
  const {createVerifiedSupabasePostgresClient}=await import('../../scripts/deploy/verified-supabase-postgres.mjs');
  let db,connected=false,committed=false,commitAttempted=false;
  try {
    for(const environment of ['staging','production']) {
      db=createVerifiedSupabasePostgresClient(process.env[environment==='staging'?'SUPABASE_STAGING_DB_URL':'SUPABASE_DB_URL'],`stackr-artwork3303-${environment}`,{connectionTimeoutMillis:15000});await db.connect();connected=true;
      const rehearsal={assets:[],links:[],metadata_changes:0,catalogue_corrections:[],native_name_corrections:[]};await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,environment,rehearsal,sourceResolver,catalogueCorrection,nativeNameCorrections));
      journal[environment+'_rehearsal']={status:'passed_and_rolled_back',assets:rehearsal.assets.length,links:rehearsal.links.length,catalogue_corrections:rehearsal.catalogue_corrections.length,native_name_correction_counts:rehearsal.native_name_correction_counts??{total:0,changed:0},native_name_corrections:rehearsal.native_name_corrections,metadata_changes:rehearsal.metadata_changes};await save();
      if(environment==='staging'){await db.end();connected=false;}
    }
    const secret=await resolveServerKey({project:PROJECTS.production,configuredKey:process.env.SUPABASE_PRODUCTION_SECRET_KEY,accessToken:process.env.SUPABASE_ACCESS_TOKEN,mask:key=>{if(process.env.GITHUB_ACTIONS==='true')process.stdout.write(`::add-mask::${key}\n`);}});
    const client=require('@supabase/supabase-js').createClient(`https://${PROJECTS.production}.supabase.co`,secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(60000),redirect:'error'})}});
    const bucket=await client.storage.getBucket(BUCKET);check(!bucket.error&&bucket.data?.public===true,'Wrong public bucket');
    const existing=new Set((await db.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])',[BUCKET,objects.map(objectKey)])).rows.map(r=>r.name));
    // Six immutable transfers fit this cohort within the bounded runner window.
    // Local validation remains at three; retry and post-upload byte checks are unchanged.
    for(const batch of chunks(objects,6)) {
      const results=await Promise.allSettled(batch.map(async o=>{
        const key=objectKey(o),entry={key,sha256:o.sha256,created:false,verified:false};journal.objects.push(entry);
        if(!existing.has(key)) {const b=await source(o);await validateBytes(sharp,b,o);entry.created=await uploadImmutable(()=>client.storage.from(BUCKET).upload(key,b,{contentType:o.mime_type,cacheControl:'31536000',upsert:false}));}
        await validateBytes(sharp,await read(publicUrl(key)),o);entry.verified=true;
      }));await save();const bad=results.find(r=>r.status==='rejected');if(bad)throw bad.reason;
    }
    await db.query('begin isolation level serializable');await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");await db.query("select pg_advisory_xact_lock(hashtext('stackr-artwork3303-publication'))");
    await writeMetadata(db,rows,receipt,approval,'production',journal,sourceResolver,catalogueCorrection,nativeNameCorrections);journal.status='commit_intent';await save();commitAttempted=true;await db.query('commit');committed=true;
    journal.status='published';await save();
    const cards=await cardsFor(db,rows);bind(rows,cards,'production');assertManifest(rows,await visibleAssets(db,rows,cards),true);
    journal.status='published_manifest_and_public_bytes_verified';journal.fronts=rows.length;journal.derivatives=rows.length*3;journal.verified_at=new Date().toISOString();await save();
  } catch(e) {if(connected&&!committed)await db.query('rollback').catch(()=>{});journal.status=committed?'published_verification_failed':commitAttempted?'commit_outcome_unknown':'failed_before_publication';journal.error=e.message;await save();throw e;}
  finally {if(connected)await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
