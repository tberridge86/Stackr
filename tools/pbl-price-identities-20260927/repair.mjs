import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createVerifiedSupabasePostgresClient} from '../../scripts/deploy/verified-supabase-postgres.mjs';

export const SOURCE='2e69af6e-4ff0-401b-8a3e-86572522f4e3';
export const STAGING_SOURCE='a0bf02e4-b30c-4495-bd87-45102611c5fa';
export const OLD_SET='2f77da8e-8199-4634-b30d-385565560731';
export const SET='d6d58c17-5923-496e-94ef-5819f34ae10c';
export const VERSION='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
const HASH='027856dca58ceedb3783b4f48b0c13dd25eb1f55cb3d6fe3bfa593ce6dbfbb33';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function validatePairs(cohort,cards,provider) {
 assert.equal(cohort.length,120); assert.equal(new Set(cohort.map(r=>r.canonical_printing_id)).size,120);
 assert.equal(provider.id,'me05');
 return cohort.map(r=>{
  const old=cards.filter(c=>c.printing_id===r.duplicate_printing_id);
  const current=cards.filter(c=>c.printing_id===r.canonical_printing_id);
  assert.equal(old.length,1);assert(current.length>0);
  for(const c of [...old,...current]){
   assert.equal(c.language_code,'en');assert.equal(c.catalogue_version_id,VERSION);
   assert.equal(Number(c.collector_number),Number(r.collector_number));assert.equal(c.card_english_display_name,r.name);
  }
  assert.equal(old[0].set_id,OLD_SET);assert.equal(old[0].variant_code,'normal');assert.equal(old[0].finish_code,null);
  assert(current.every(c=>c.set_id===SET&&c.set_code==='me05'));
  const id=`me05-${String(r.collector_number).padStart(3,'0')}`;
  const live=provider.cards.filter(c=>c.id===id);
  assert.equal(live.length,1);assert.equal(live[0].name,r.name);assert.equal(Number(live[0].localId),Number(r.collector_number));
  // This is a printing identity correction, never a claim about the saved finish.
  return {external_id:`me5-${Number(r.collector_number)}`,printing_id:r.canonical_printing_id,old_variant_id:old[0].variant_id};
 });
}
export function validateAliases(rows,pairs,after=false){
 assert.equal(rows.length,121,'Expected exactly 120 card aliases and one set alias');
 const sets=rows.filter(r=>r.source_entity_type==='set');assert.equal(sets.length,1);
 assert.equal(sets[0].external_id,'me5');assert.equal(sets[0].set_id,after?SET:OLD_SET);
 for(const p of pairs){const matches=rows.filter(r=>r.external_id===p.external_id&&r.source_entity_type==='card');assert.equal(matches.length,1);
  const r=matches[0];assert.equal(r.set_id,null);assert.equal(r.printing_id,after?p.printing_id:null);assert.equal(r.variant_id,after?null:p.old_variant_id);
 }
}
export async function readAliases(db,source=SOURCE){
 const live=(await db.query("select * from ingest.external_identifiers where source_id=$1 and language_code='en' and is_current and deprecated_at is null and (external_id='me5' or external_id ~ '^me5-[0-9]+$') order by external_id",[source])).rows;
 const published=(await db.query("select * from catalog.catalogue_version_external_identifiers where catalogue_version_id=$1 and source_id=$2 and language_code='en' and (external_id='me5' or external_id ~ '^me5-[0-9]+$') order by external_id",[VERSION,source])).rows;
 return {live,published};
}
export async function repairAliases(db,pairs,source=SOURCE){
 assert([SOURCE,STAGING_SOURCE].includes(source));
 const before=await readAliases(db,source);validateAliases(before.live,pairs);validateAliases(before.published,pairs);
 for(const p of pairs){
  const live=await db.query("update ingest.external_identifiers set printing_id=$1,variant_id=null,updated_at=now() where source_id=$2 and language_code='en' and source_entity_type='card' and external_id=$3 and variant_id=$4 and printing_id is null and set_id is null and is_current and deprecated_at is null returning id",[p.printing_id,source,p.external_id,p.old_variant_id]);
  assert.equal(live.rows.length,1);
  const published=await db.query("update catalog.catalogue_version_external_identifiers set printing_id=$1,variant_id=null where catalogue_version_id=$2 and source_id=$3 and language_code='en' and source_entity_type='card' and external_id=$4 and variant_id=$5 and printing_id is null and set_id is null returning external_id",[p.printing_id,VERSION,source,p.external_id,p.old_variant_id]);
  assert.equal(published.rows.length,1);
 }
 assert.equal((await db.query("update ingest.external_identifiers set set_id=$1,updated_at=now() where source_id=$2 and language_code='en' and source_entity_type='set' and external_id='me5' and set_id=$3 and is_current and deprecated_at is null returning id",[SET,source,OLD_SET])).rows.length,1);
 assert.equal((await db.query("update catalog.catalogue_version_external_identifiers set set_id=$1 where catalogue_version_id=$2 and source_id=$3 and language_code='en' and source_entity_type='set' and external_id='me5' and set_id=$4 returning external_id",[SET,VERSION,source,OLD_SET])).rows.length,1);
 const after=await readAliases(db,source);validateAliases(after.live,pairs,true);validateAliases(after.published,pairs,true);
 return {before,after};
}
async function preservation(db){
 const result={};
 for(const name of ['public.user_card_variants','public.binders','public.binder_cards','catalog.assets']){
  result[name]=(await db.query(`select count(*)::int as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) as digest from ${name} t`)).rows[0];
 }
 return result;
}
function config(env){
 assert.equal(env.GITHUB_REF,'refs/heads/main');assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.equal(env.GITHUB_SHA,env.STACKR_EXPECTED_MAIN_SHA);
 assert(['true','false'].includes(env.STACKR_PBL_APPLY));
 for(const [key,ref]of [['SUPABASE_STAGING_DB_URL','lmwfhvexfcoyeuoyrlco'],['SUPABASE_DB_URL','oakdbbzdqwurpjnoqhmu']]){
  const u=new URL(env[key]);assert(['postgres:','postgresql:'].includes(u.protocol));assert(!u.search&&!u.hash);
  assert(u.hostname===`db.${ref}.supabase.co`||u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username)===`postgres.${ref}`);
 }
}
export async function main(){
 config(process.env);
 const bytes=await readFile(new URL('../queue1-pbl-relink-20260927/cohort.json',import.meta.url));assert.equal(digest(bytes),HASH);const cohort=JSON.parse(bytes);
 const response=await fetch('https://api.tcgdex.net/v2/en/sets/me05',{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const provider=await response.json();
 const output=process.env.STACKR_PBL_OUTPUT;assert(output);await mkdir(output,{recursive:true});
 const journal={source:process.env.GITHUB_SHA,cohortSha256:HASH,providerObservedAt:new Date().toISOString(),apply:process.env.STACKR_PBL_APPLY==='true',phases:[]};
 const save=()=>writeFile(`${output}/receipt.json`,JSON.stringify(journal,null,2));
 for(const [name,key,commit]of [['staging_rehearsal','SUPABASE_STAGING_DB_URL',false],['production_rehearsal','SUPABASE_DB_URL',false],...(journal.apply?[['production_publication','SUPABASE_DB_URL',true]]:[])]){
  const db=createVerifiedSupabasePostgresClient(process.env[key],'stackr-pbl-price-identities',{connectionTimeoutMillis:15000});let commitAttempted=false;
  const source=name==='staging_rehearsal'?STAGING_SOURCE:SOURCE;
  try{
   await db.connect();await db.query('begin isolation level serializable');await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");
   assert.deepEqual((await db.query('select code from ingest.sources where id=$1',[source])).rows,[{code:'pokemon_tcg_api'}]);
   const cards=(await db.query('select * from api.catalogue_cards where set_id=any($1::uuid[])',[ [OLD_SET,SET] ])).rows;
   const pairs=validatePairs(cohort,cards,provider);const preserved=await preservation(db);
   const aliases=await repairAliases(db,pairs,source);assert.deepEqual(await preservation(db),preserved);
   const phase={name,status:commit?'commit_pending':'rollback_pending',aliasRecords:242,preserved,before:aliases.before,after:aliases.after};journal.phases.push(phase);await save();
   commitAttempted=commit;await db.query(commit?'commit':'rollback');phase.status=commit?'committed':'rolled_back';
   const readback=await readAliases(db,source);assert.deepEqual(readback,commit?aliases.after:aliases.before);assert.deepEqual(await preservation(db),preserved);
   phase.status=commit?'committed_and_verified':'rehearsed_rolled_back_and_verified';await save();console.log(JSON.stringify({phase:name,status:phase.status,aliasRecords:242}));
  }catch(error){await db.query('rollback').catch(()=>{});journal.error={phase:name,commitAttempted,message:error.message};await save();throw error;}finally{await db.end();}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
