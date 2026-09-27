import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {check,digest} from '../queue1-publish-20260927/publish.mjs';
import {assertConfig as guardTargets,validateEvidence,APPROVAL_PATH} from '../anniversary201-publish-20260927/publish.mjs';
import {validateCohort,writeMetadata,MIGRATION as METADATA_MIGRATION,COHORT_SHA as METADATA_SHA} from '../newsets480-publish-20260927/publish.mjs';
import {validateReferences,writeReferences} from '../newsets480-publish-20260927/references.mjs';
export const MIGRATION='20260927173200_include_printing_fronts_in_card_identity_read';
export const MIGRATION_SHA='a39234db108aeb32c2865defee132312ef77ccc44b32083f434f60815f4a5ecf';
export const BASELINE_SHA='7f231307922655cfb6e7435c436bd19cf8b2ecdda83cf10a1318822e4c959fba';
export function assertConfig(env,execute){
 check(env.STACKR_CARD_DETAIL_FRONT_CONFIRMATION==='REPAIR CARD DETAIL FRONT','Bounded read repair confirmation required');
 guardTargets({...env,STACKR_ANNIVERSARY201_CONFIRMATION:'PUBLISH ANNIVERSARY201'},execute);
}
export async function snapshot(db){return (await db.query("select pg_get_functiondef(p.oid) as definition,p.prosecdef,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service_role from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api' and p.proname='card_image_manifest_for_identities'")).rows[0]??null;}
export function validateSecurity(s){check(s && !s.prosecdef && !s.anon && !s.authenticated && s.service_role,'Function execution permissions changed');}
export async function apply(db,sql,baseline){
 check(digest(Buffer.from(sql))===MIGRATION_SHA,'Frozen migration changed');
 check(isDeepStrictEqual(await snapshot(db),baseline),'Live function differs from reviewed baseline');
 const version=MIGRATION.split('_')[0],name=MIGRATION.slice(version.length+1);
 check(!(await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rows.length,'Migration already present; inspect before retry');
 await db.query(sql);validateSecurity(await snapshot(db));
 await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,name,[sql]]);
}
export async function verify(db,metadata,refs,stored,environment){
 const expected=new Map(refs.records.map(r=>[r.bindings[environment].printing_id,r.sha256]));
 if(environment==='production')for(const r of stored)expected.set(r.printing_id,r.image_sha256);
 const counts=[];let matched=0;
 for(const set of metadata.sets){
  const start=Date.now(),cards=metadata.cards.filter(c=>c.provider_set_code===set.provider_set_code && c.language_code===set.language_code);
  let images=0;
  for(let offset=0;offset<cards.length;offset+=100){
   const batch=cards.slice(offset,offset+100), variants=batch.map(c=>c.bindings[environment].variant_id),printings=batch.map(c=>c.bindings[environment].printing_id);
   const rows=(await db.query('select * from api.card_image_manifest_for_identities($1,$2,null,null,1000)',[variants,printings])).rows;
   for(const c of batch){
    const id=c.bindings[environment].printing_id,hash=expected.get(id),assets=rows.filter(a=>a.printing_id===id);
    if(hash){check(assets.length===1 && assets[0].variant_id===null && assets[0].content_sha256===hash && assets[0].permission_status==='approved','Card detail printing-front mismatch');images++;matched++;}
    else check(assets.length===0,'Unexpected staging artwork');
   }
  }
  counts.push({set:set.set_code,language:set.language_code,cards:cards.length,images,elapsed_ms:Date.now()-start});
 }
 check(matched===(environment==='production'?480:279),'RPC image population mismatch');
 return {matched_images:matched,sets:counts};
}
export async function rehearse(db,e,baseline,sql,metadata,refs,stored,metadataSql){
 await db.query('begin isolation level serializable');
 try {
  await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");
  if(e==='staging'){await writeMetadata(db,metadata,e,metadataSql);await writeReferences(db,refs,e,metadata.versions.ja);}
  await apply(db,sql,baseline);return {status:'passed_and_rolled_back',...await verify(db,metadata,refs,stored,e)};
 } finally {await db.query('rollback');}
}
async function main(){
 assertConfig(process.env,process.argv.includes('--execute'));
 const sql=await readFile(new URL(`../../supabase/migrations/${MIGRATION}.sql`,import.meta.url),'utf8');
 const bytes=await readFile(new URL('./baseline.json',import.meta.url));check(digest(bytes)===BASELINE_SHA,'Frozen baseline changed');const baseline=JSON.parse(bytes);
 const metadata=validateCohort(await readFile(new URL('../newsets480-publish-20260927/cohort.json',import.meta.url)));
 const refs=validateReferences(await readFile(new URL('../newsets480-publish-20260927/references.json',import.meta.url)),METADATA_SHA);
 const stored=validateEvidence(await readFile(new URL('../anniversary201-publish-20260927/cohort.json',import.meta.url)),await readFile(new URL('../../'+APPROVAL_PATH,import.meta.url)));
 const metadataSql=await readFile(new URL(`../../supabase/migrations/${METADATA_MIGRATION}.sql`,import.meta.url),'utf8');
 const out=process.env.STACKR_CARD_DETAIL_FRONT_OUTPUT;check(out,'Receipt directory required');await mkdir(out,{recursive:true});
 const journal={status:'preflight',revision:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,started_at:new Date().toISOString(),migration_sha256:MIGRATION_SHA,previous_function:baseline.production,production_catalogue_writes:0,storage_writes:0,ownership_changes:0,device_verified:false};
 const save=()=>writeFile(`${out}/receipt.json`,JSON.stringify(journal,null,2));await save();
 const {createVerifiedSupabasePostgresClient}=await import('../../scripts/deploy/verified-supabase-postgres.mjs');let db,committed=false,commitAttempted=false;
 try {
  for(const e of ['staging','production']){
   db=createVerifiedSupabasePostgresClient(process.env[e==='staging'?'SUPABASE_STAGING_DB_URL':'SUPABASE_DB_URL'],`stackr-card-detail-front-${e}`,{connectionTimeoutMillis:15000});await db.connect();
   journal[`${e}_rehearsal`]=await rehearse(db,e,baseline[e],sql,metadata,refs,stored,metadataSql);
   check(isDeepStrictEqual(await snapshot(db),baseline[e]),'Rehearsal did not restore function');await save();console.log(`${e} printing-front read rehearsal passed and rolled back`);
   if(e==='staging'){await db.end();db=null;}
  }
  await db.query('begin isolation level serializable');await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");
  await apply(db,sql,baseline.production);journal.verification=await verify(db,metadata,refs,stored,'production');journal.new_function=await snapshot(db);journal.status='commit_intent';await save();commitAttempted=true;await db.query('commit');committed=true;
  journal.published_at=new Date().toISOString();journal.post_commit_verification=await verify(db,metadata,refs,stored,'production');journal.status='published_and_rpc_verified';journal.verified_at=new Date().toISOString();await save();console.log(JSON.stringify({status:journal.status,images:480}));
 }catch(e){if(db&&!committed)await db.query('rollback').catch(()=>{});journal.status=committed?'published_verification_failed':commitAttempted?'commit_outcome_unknown':'failed_before_publication';journal.error=e.message;await save();throw e;}finally{if(db)await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
