import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {readPriceGuardState,rehearsePriceIdentityGuard} from './deploy/rehearse-price-identity-guard-core.mjs';
import {orderedVersionNameMd5,orderedRemoteStatementLedgerSha256} from './deploy/staging-migration-ledger.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const migration=readFileSync('supabase/migrations/20261005221812_bounded_provider_identity_guards.sql','utf8');
const oldSource=readFileSync('supabase/migrations/20261004190319_numbered_english_provider_set_titles.sql','utf8');
const legacy=oldSource.match(/create or replace function api\.english_exact_price_set_is_current[\s\S]*?\$function\$;/i)[0].replace('api.english_exact_price_set_is_current','api.legacy_english_exact_price_set_is_current');
let checks=0;
async function check(expected,message,group=100,set=id(10)){
 const result=(await db.query('select api.english_exact_price_set_is_current($1,$2) current,api.legacy_english_exact_price_set_is_current($1,$2) legacy',[group,set])).rows[0];
 assert.equal(result.current,result.legacy,'Parity: '+message);assert.equal(result.current,expected,message);checks++;
}
async function main(){
 try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema api;create schema catalog;create schema market;
 create table catalog.languages(code text primary key);
 create table catalog.catalogue_versions(id uuid primary key,status text,deprecated_at timestamptz);
 create table catalog.catalogue_version_sets(catalogue_version_id uuid,set_id uuid);
 create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid);
 create table catalog.sets(id uuid primary key,language_code text,english_display_name text,deprecated_at timestamptz);
 create table catalog.card_printings(id uuid primary key,set_id uuid,deprecated_at timestamptz);
 create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz);
 create table market.catalogue_provider_sets(category_id integer,group_id bigint,set_id uuid,method text);
 create table market.catalogue_bulk_feeds(feed_key text primary key,payload jsonb);
 create view api.catalogue_sets as select s.id set_id,s.language_code,s.english_display_name from catalog.catalogue_version_sets cvs join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id join catalog.sets s on s.id=cvs.set_id join catalog.languages l on l.code=s.language_code where cv.status='published' and cv.deprecated_at is null and s.deprecated_at is null;
 create view api.catalogue_cards as select v.id variant_id,p.set_id,v.language_code,v.variant_code,v.finish_code from catalog.catalogue_version_variants cvv join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id join catalog.card_variants v on v.id=cvv.variant_id join catalog.card_printings p on p.id=v.printing_id join catalog.sets s on s.id=p.set_id join catalog.languages l on l.code=v.language_code where cv.status='published' and cv.deprecated_at is null and v.deprecated_at is null and p.deprecated_at is null and s.deprecated_at is null;
 create function api.catalogue_provider_name(p_value text) returns text language sql immutable strict as $$select regexp_replace(replace(lower(normalize(p_value,NFKC)),'&','and'),'[[:space:][:punct:]・：]','','g')$$;
 create function api.catalogue_provider_subtype(p_variant text,p_finish text) returns text language sql immutable as $$select case when p_variant='normal' and p_finish='normal' then 'Normal' when p_variant='holo' and p_finish='holo' then 'Holofoil' when p_variant='reverse_holo' and p_finish='reverse_holo' then 'Reverse Holofoil' end$$;
 insert into catalog.languages values('en'),('ja');
 insert into catalog.catalogue_versions values('${id(1)}','published',null),('${id(2)}','draft',null),('${id(3)}','published',null);
 insert into catalog.sets values('${id(10)}','en','Lost Thunder',null),('${id(11)}','en','Lost Thunder',null),('${id(12)}','ja','Lost Thunder',null);
 insert into catalog.catalogue_version_sets values('${id(1)}','${id(10)}'),('${id(3)}','${id(10)}'),('${id(2)}','${id(11)}'),('${id(1)}','${id(12)}');
 insert into catalog.card_printings values('${id(20)}','${id(10)}',null);
 insert into catalog.card_variants values('${id(30)}','${id(20)}','en','normal','normal',null);
 insert into catalog.catalogue_version_variants values('${id(1)}','${id(30)}'),('${id(3)}','${id(30)}');
 insert into market.catalogue_provider_sets values(3,100,'${id(10)}','exact_set_title');
 insert into market.catalogue_bulk_feeds values('tcgplayer/3/groups','{"results":[{"categoryId":3,"groupId":100,"name":"SM - Lost Thunder"}]}');
 grant usage on schema api,catalog,market to service_role;
 grant select on all tables in schema api,catalog,market to service_role;
 `);
 await db.exec(legacy);await db.exec(legacy.replace('api.legacy_english_exact_price_set_is_current','api.english_exact_price_set_is_current'));
 await db.exec('begin;'+migration+'commit;');
 assert.ok(!/api\.catalogue_(cards|sets)/.test(migration),'guard must avoid display views');
 await check(true,'unique published title and supported card; duplicate publication rows ignored');
 await check(false,'unmapped group',101);await check(false,'wrong set',100,id(11));await check(false,'null group',null);await check(false,'null set',100,null);
 await db.exec(`update market.catalogue_bulk_feeds set payload='{"results":[{"categoryId":3,"groupId":100,"name":"SM - Lost Thunder"},{"categoryId":3,"groupId":101,"name":"Lost thunder"}]}'`);
 await check(false,'raw and stripped provider titles collide');
 await db.exec(`update market.catalogue_bulk_feeds set payload='{"results":[{"categoryId":3,"groupId":100,"name":"SM - Lost Thunder"}]}'`);
 await db.exec(`update catalog.catalogue_versions set status='published' where id='${id(2)}'`);await check(false,'another current English set with same title');
 await db.exec(`update catalog.catalogue_versions set deprecated_at=now() where id='${id(2)}'`);await check(true,'deprecated publication excluded');
 await db.exec(`update catalog.catalogue_versions set deprecated_at=null where id='${id(2)}';update catalog.sets set deprecated_at=now() where id='${id(11)}'`);await check(true,'deprecated duplicate set excluded');
 await db.exec(`update catalog.sets set english_display_name='Vivid Voltage' where id='${id(10)}';update market.catalogue_bulk_feeds set payload='{"results":[{"categoryId":3,"groupId":100,"name":"SWSH04: Vivid Voltage"}]}'`);
 await check(true,'numbered title prefix retained');
 await db.exec(`update market.catalogue_bulk_feeds set payload='{"results":[{"categoryId":3,"groupId":100,"name":"Vivid Voltage"}]}'`);await check(false,'bare provider name is not automatic exact-title evidence');
 await db.exec(`update market.catalogue_bulk_feeds set payload='{"results":[{"categoryId":3,"groupId":100,"name":"SWSH04: Vivid Voltage"}]}'`);
 for(const [table,column,value,reset] of [
 ['catalog.card_variants','finish_code',"'stamped'","'normal'"],
 ['catalog.card_variants','language_code',"'ja'","'en'"],
 ['catalog.card_variants','deprecated_at','now()','null'],
 ['catalog.card_printings','deprecated_at','now()','null'],
 ['catalog.sets','deprecated_at','now()','null']]){
 const where=table==='catalog.sets'?" where id='"+id(10)+"'":'';
 await db.exec('update '+table+' set '+column+'='+value+where);await check(false,'excludes '+table+'.'+column);await db.exec('update '+table+' set '+column+'='+reset+where);
 }
 await db.exec("update market.catalogue_provider_sets set method='reviewed'");await check(false,'reviewed maps do not masquerade as automatic title maps');await db.exec("update market.catalogue_provider_sets set method='exact_set_title'");
 await db.exec(`update catalog.catalogue_versions set status='draft' where id='${id(1)}'`);await check(true,'earlier published version is preserved');
 await db.exec(`update catalog.catalogue_versions set status='draft' where id='${id(3)}'`);await check(false,'no published card or set');
 await db.exec(`update catalog.catalogue_versions set status='published' where id in ('${id(1)}','${id(3)}')`);
 await db.exec('set role anon');await assert.rejects(db.query('select api.english_exact_price_set_is_current($1,$2)',[100,id(10)]),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select api.english_exact_price_set_is_current($1,$2)',[100,id(10)]),/permission denied/);
 await db.exec('reset role;set role service_role');assert.equal((await db.query('select api.english_exact_price_set_is_current($1,$2) valid',[100,id(10)])).rows[0].valid,true);
 await db.exec('reset role');
 await assert.rejects(db.exec('begin;'+migration+'commit;'),/unexpected English exact-title identity guard revision/);
 await db.exec('rollback');
 const candidateDefinitionMd5=(await db.query("select md5(replace(pg_get_functiondef('api.english_exact_price_set_is_current(bigint,uuid)'::regprocedure),E'\\r\\n',E'\\n')) hash")).rows[0].hash;
 const rollback=readFileSync('docs/releases/pricing-identity-guard-rollback-20261006.sql','utf8');
 await db.exec('begin;'+rollback+'commit;');
 await check(true,'forward rollback preserves native published identity');
 assert.equal((await db.query("select md5(replace(pg_get_functiondef('api.english_exact_price_set_is_current(bigint,uuid)'::regprocedure),E'\\r\\n',E'\\n')) hash")).rows[0].hash,'ca77044f82345cc18fdc7f2be1cca8f6','rollback restores the captured predecessor exactly');
 await db.exec('set role anon');await assert.rejects(db.query('select api.english_exact_price_set_is_current($1,$2)',[100,id(10)]),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select api.english_exact_price_set_is_current($1,$2)',[100,id(10)]),/permission denied/);
 await db.exec('reset role;set role service_role');assert.equal((await db.query('select api.english_exact_price_set_is_current($1,$2) valid',[100,id(10)])).rows[0].valid,true);
 await db.exec('reset role');
 await assert.rejects(db.exec('begin;'+rollback+'commit;'),/unexpected candidate identity guard revision for rollback/);
 await db.exec('rollback');
 await db.exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into supabase_migrations.schema_migrations values('20261004084131','fixture_guard',array['select 1']);");
 const client={query:(...args)=>db.query(...args),exec:text=>db.exec(text)};
 const state=await readPriceGuardState(client);
 const baseline={project:'lmwfhvexfcoyeuoyrlco',count:state.ledger.length,orderedVersionNameMd5:orderedVersionNameMd5(state.ledger),orderedStatementLedgerSha256:orderedRemoteStatementLedgerSha256(state.ledger)};
 const candidate={migrationVersion:'20261005221812',sourceLfSha256:createHash('sha256').update(migration.replaceAll('\r\n','\n')).digest('hex'),predecessorDefinitionMd5:'ca77044f82345cc18fdc7f2be1cca8f6',candidateDefinitionMd5};
 const options={client,projectRef:baseline.project,baseline,candidate,migrationSql:migration,readCanary:async()=> (await db.query('select api.english_exact_price_set_is_current($1,$2) valid',[100,id(10)])).rows};
 const rehearsed=await rehearsePriceIdentityGuard(options);
 assert.equal(rehearsed.rollbackVerified,true);assert.equal(rehearsed.persistedCandidate,false);
 assert.equal((await readPriceGuardState(client)).guard.hash,candidate.predecessorDefinitionMd5);
 await assert.rejects(rehearsePriceIdentityGuard({...options,projectRef:'oakdbbzdqwurpjnoqhmu'}),/price_guard_requires_staging/);
 await assert.rejects(rehearsePriceIdentityGuard({...options,migrationSql:migration+'\n-- changed source'}),/price_guard_source_hash_drift/);
 await db.exec("update supabase_migrations.schema_migrations set statements=array['select 2']");
 await assert.rejects(rehearsePriceIdentityGuard(options),/price_guard_ledger_statement_drift/);
 await db.exec("update supabase_migrations.schema_migrations set statements=array['select 1']");
 let canaryCalls=0;
 await assert.rejects(rehearsePriceIdentityGuard({...options,readCanary:async()=>{canaryCalls++;if(canaryCalls===2)throw Error('injected live control failure');return options.readCanary();}}),/injected live control failure/);
 assert.equal((await readPriceGuardState(client)).guard.hash,candidate.predecessorDefinitionMd5,'failed controls restore the exact predecessor');
 assert.equal((await readPriceGuardState(client)).ledger.length,baseline.count,'failed rehearsal never registers a migration');
 let parityCalls=0;
 await assert.rejects(rehearsePriceIdentityGuard({...options,readCanary:async()=>[{valid:++parityCalls===1}]}),/price_guard_api_response_drift/);
 assert.equal((await readPriceGuardState(client)).guard.hash,candidate.predecessorDefinitionMd5);
 let sqlFailureCalls=0;
 await assert.rejects(rehearsePriceIdentityGuard({...options,readCanary:async()=>{if(++sqlFailureCalls===2){await db.exec('set local role service_role');await db.query('select * from api.missing_rehearsal_control');}return options.readCanary();}}),/does not exist/);
 assert.equal((await readPriceGuardState(client)).guard.hash,candidate.predecessorDefinitionMd5,'aborted service-role query restores function and connection role');
 console.log(JSON.stringify({checks,legacyParity:true,serviceOnly:true,publishedVersionsPreserved:true,changedRevisionRejected:true,candidateDefinitionMd5,forwardRollbackRestoresExactPredecessor:true,rollbackAccessPreserved:true,alreadyRestoredRollbackRejected:true,canonicalRehearsal:{rollbackOnly:true,productionRejected:true,sourceDriftRejected:true,ledgerDriftRejected:true,failedControlsRestorePredecessor:true,apiParityDriftRestoresPredecessor:true,ledgerUnchanged:true}}));
 }finally{await db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
