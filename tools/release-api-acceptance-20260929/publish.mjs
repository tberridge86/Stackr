import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {check,digest} from '../queue1-publish-20260927/publish.mjs';
import {assertConfig as guardTargets} from '../anniversary201-publish-20260927/publish.mjs';

export const MIGRATION='20260929073406_expose_published_card_details';
export const MIGRATION_SHA='1198a53c9ef375563eb7e83e19422dcb99126b03cc735d0d61822780bedf3318';
export const BASELINE_SHA='3f3477d8b0d2e0c91f5d2a9818a501d3d3e25d0b0f7c720fc545c7334f362d1c';
const canonical=text=>text.replace(/\r\n/g,'\n');
export function assertConfig(env,execute){
  check(env.STACKR_CARD_DETAILS_CONFIRMATION==='EXPOSE STORED CARD DETAILS','Bounded metadata-read confirmation required');
  guardTargets({...env,STACKR_ANNIVERSARY201_CONFIRMATION:'PUBLISH ANNIVERSARY201'},execute);
}
export async function snapshot(db){return (await db.query("select pg_get_viewdef('api.catalogue_cards'::regclass,true) as definition,c.reloptions,c.relacl::text as acl,pg_get_userbyid(c.relowner) as owner from pg_class c where c.oid='api.catalogue_cards'::regclass")).rows[0];}
export function assertSecurity(before,after){
  check(isDeepStrictEqual(before.reloptions,after.reloptions)&&after.reloptions?.includes('security_invoker=true'),'View security changed');
  check(before.acl===after.acl&&before.owner===after.owner,'View privileges or owner changed');
}
export async function apply(db,sql,baseline){
  check(digest(Buffer.from(canonical(sql)))===MIGRATION_SHA,'Frozen migration changed');
  check(isDeepStrictEqual(await snapshot(db),baseline),'Live view differs from reviewed baseline');
  await db.query(sql);
  assertSecurity(baseline,await snapshot(db));
}
export async function captureRows(db){
  // Snapshot only this already-public read model. No holdings, prices or image writes.
  await db.query('create temporary table release_card_details_before on commit drop as select * from api.catalogue_cards');
}
export async function verify(db){
  const oldColumns=(await db.query("select attname from pg_attribute where attrelid='pg_temp.release_card_details_before'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(r=>r.attname);
  const columns=oldColumns.map(n=>'"'+n.replaceAll('"','""')+'"').join(',');
  const drift=(await db.query(`select count(*)::int as count from ((select ${columns} from release_card_details_before except all select ${columns} from api.catalogue_cards) union all (select ${columns} from api.catalogue_cards except all select ${columns} from release_card_details_before)) d`)).rows[0].count;
  check(drift===0,'Existing published rows changed');
  const checks=(await db.query(`select c.language_code,count(*)::int as variants,count(distinct c.printing_id)::int as printings,
    count(*) filter(where c.artist is distinct from p.artist or c.supertype is distinct from p.supertype or c.subtypes is distinct from p.subtypes or c.card_concept_id is distinct from p.card_concept_id or c.concept_english_display_name is distinct from cc.default_english_name)::int as mismatches
    from api.catalogue_cards c join catalog.card_printings p on p.id=c.printing_id
    left join catalog.card_concepts cc on cc.id=p.card_concept_id and cc.deprecated_at is null group by c.language_code order by c.language_code`)).rows;
  check(checks.length>0&&checks.every(r=>r.mismatches===0),'Stored metadata parity failed');
  const sample=(await db.query("select set_id,language_code from api.catalogue_cards order by variant_id limit 1")).rows[0];
  const bundle=(await db.query('select card_row from api.catalogue_set_card_rows($1,$2,null,1)',[sample.set_id,sample.language_code])).rows;
  check(bundle.length>0&&bundle.every(r=>['artist','supertype','subtypes','card_concept_id','concept_english_display_name'].every(k=>Object.hasOwn(r.card_row,k))),'Fast set-card RPC omits metadata');
  return {unchanged_existing_rows:true,metadata_parity:checks,fast_set_rpc_fields_present:true};
}
export async function rehearse(db,sql,baseline){
  await db.query('begin isolation level repeatable read');
  try{await db.query("set local statement_timeout='90s'");await db.query("set local lock_timeout='5s'");await captureRows(db);await apply(db,sql,baseline);return await verify(db);}finally{await db.query('rollback');}
}
async function main(){
  assertConfig(process.env,process.argv.includes('--execute'));
  const sql=canonical(await readFile(new URL(`../../supabase/migrations/${MIGRATION}.sql`,import.meta.url),'utf8'));
  const raw=canonical(await readFile(new URL('./baseline.json',import.meta.url),'utf8'));check(digest(Buffer.from(raw))===BASELINE_SHA,'Frozen baseline changed');const baseline=JSON.parse(raw);
  const output=process.env.STACKR_CARD_DETAILS_OUTPUT;check(output,'Receipt directory required');await mkdir(output,{recursive:true});
  const journal={status:'preflight',revision:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,started_at:new Date().toISOString(),migration_sha256:MIGRATION_SHA,baseline,metadata_writes:0,artwork_writes:0,holdings_writes:0,pricing_writes:0,device_verified:false};
  const save=()=>writeFile(`${output}/receipt.json`,JSON.stringify(journal,null,2));await save();
  const {createVerifiedSupabasePostgresClient}=await import('../../scripts/deploy/verified-supabase-postgres.mjs');let db,committed=false,commitAttempted=false;
  try{
    for(const environment of ['staging','production']){
      db=createVerifiedSupabasePostgresClient(process.env[environment==='staging'?'SUPABASE_STAGING_DB_URL':'SUPABASE_DB_URL'],`stackr-card-details-${environment}`,{connectionTimeoutMillis:15000});await db.connect();
      journal[environment+'_rehearsal']={status:'passed_and_rolled_back',...await rehearse(db,sql,baseline[environment])};
      check(isDeepStrictEqual(await snapshot(db),baseline[environment]),'Rehearsal did not restore view');await save();
      if(environment==='staging'){await db.end();db=null;}
    }
    await db.query('begin isolation level repeatable read');await db.query("set local statement_timeout='90s'");await db.query("set local lock_timeout='5s'");
    const version=MIGRATION.split('_')[0];check(!(await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version])).rows.length,'Migration already present; inspect receipt before retry');
    await captureRows(db);await apply(db,sql,baseline.production);journal.verification=await verify(db);journal.new_view=await snapshot(db);
    check(journal.new_view.definition===baseline.staging.definition,'Repaired production view differs from verified staging');
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,MIGRATION.slice(version.length+1),[sql]]);
    journal.status='commit_intent';await save();commitAttempted=true;await db.query('commit');committed=true;
    check(isDeepStrictEqual(await snapshot(db),journal.new_view),'Post-commit view drift');journal.status='published_and_database_verified';journal.verified_at=new Date().toISOString();await save();
    console.log(JSON.stringify({status:journal.status,metadata_parity:journal.verification.metadata_parity}));
  }catch(e){if(db&&!committed)await db.query('rollback').catch(()=>{});journal.status=committed?'published_verification_failed':commitAttempted?'commit_outcome_unknown':'failed_before_publication';journal.error=e.message;await save();throw e;}finally{if(db)await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
