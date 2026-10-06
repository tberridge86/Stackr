import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readPriceGuardState,rehearsePriceIdentityGuard,CARDMARKET_LEDGER_SIGNATURE,PRICE_GUARD_STAGING_PROJECT} from './deploy/rehearse-price-identity-guard-core.mjs';
import {orderedRemoteStatementLedgerSha256,orderedVersionNameMd5} from './deploy/staging-migration-ledger.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const old=readFileSync('docs/releases/pricing-cardmarket-ledger-predecessor-20261006.sql','utf8');
const candidate=readFileSync('docs/releases/pricing-cardmarket-ledger-candidate-20261006.sql','utf8');
let checks=0;
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema api; create schema catalog; create schema market;
 create table catalog.catalogue_versions(id uuid primary key,language_code text,status text,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz);
 create table catalog.card_printings(id uuid primary key,language_code text,deprecated_at timestamptz);
 create table catalog.sets(id uuid primary key,deprecated_at timestamptz);
 create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,set_id uuid,deprecated_at timestamptz);
 create index on catalog.card_variants(printing_id);
 create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id));
 create table market.cardmarket_printing_mappings(provider_product_id bigint,provider_category_id integer,printing_id uuid primary key,catalogue_version_id uuid,language_evidence jsonb,variant_evidence jsonb,finish_evidence jsonb,review_reference text);
 insert into catalog.catalogue_versions values
 ('${id(1)}','en','published',null,'2026-10-06','2026-10-06'),
 ('${id(2)}','en','published',null,'2026-10-05','2026-10-05'),
 ('${id(3)}','ja','published',null,null,'2026-10-06'),
 ('${id(4)}','ja','published','2026-10-06','2026-10-07','2026-10-07'),
 ('${id(5)}','en','draft',null,'2026-10-07','2026-10-07');
 insert into catalog.sets values ('${id(10)}',null),('${id(11)}','2026-10-06');
 grant usage on schema api,catalog,market to service_role;
 grant select on all tables in schema catalog,market to service_role;
 `);
 for(let n=1;n<=350;n++){
  const language=n%2?'en':'ja';
  const version=n%17===0?id(2):n%19===0?id(5):n%23===0?id(4):id(language==='en'?1:3);
  await db.query('insert into catalog.card_printings values($1,$2,$3)',[id(1000+n),language,n%7===0?'2026-10-06':null]);
  await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5)',[id(2000+n),id(1000+n),n%11===0?'wrong':language,id(n%13===0?11:10),n%5===0?'2026-10-06':null]);
  if(n%3!==0)await db.query('insert into catalog.catalogue_version_variants values($1,$2)',[version,id(2000+n)]);
  await db.query('insert into market.cardmarket_printing_mappings values($1,51,$2,$3,$4,$4,$4,$5)',[n,id(1000+n),version,{native:language,source:n},'review-'+n]);
 }
 await db.exec(old);
 const originalDefinition=(await db.query("select pg_get_functiondef('api.list_reviewed_cardmarket_printing_mappings(bigint,integer)'::regprocedure) definition")).rows[0].definition;
 await db.exec(old.replace('api.list_reviewed_cardmarket_printing_mappings','api.legacy_reviewed_cardmarket_mappings'));
 await db.exec("revoke all on function api.list_reviewed_cardmarket_printing_mappings(bigint,integer),api.legacy_reviewed_cardmarket_mappings(bigint,integer) from public; grant execute on function api.list_reviewed_cardmarket_printing_mappings(bigint,integer),api.legacy_reviewed_cardmarket_mappings(bigint,integer) to service_role;");
 await db.exec('begin;'+candidate);
 await db.exec('set local role service_role');
 const cases=[[0,100],[100,100],[250,100],[0,500],[0,1],[349,100],[350,100],[null,100],[0,null],[0,0],[0,-1],[0,501]];
 for(const [cursor,limit] of cases){
  const current=(await db.query('select * from api.list_reviewed_cardmarket_printing_mappings($1,$2)',[cursor,limit])).rows;
  const legacy=(await db.query('select * from api.legacy_reviewed_cardmarket_mappings($1,$2)',[cursor,limit])).rows;
  assert.deepEqual(current,legacy,'native/provenance/full response parity for '+JSON.stringify([cursor,limit]));checks++;
 }
 const first=(await db.query('select * from api.list_reviewed_cardmarket_printing_mappings(0,100)')).rows;
 assert.equal(first.length,100,'invalid raw candidates must not truncate a valid 100-row page');
 assert(first.at(-1).cardmarket_product_id>100,'fixture must cross raw mapping-page boundary');
 let cursor=0,all=[];
 for(let page=0;page<10;page++){
  const rows=(await db.query('select * from api.list_reviewed_cardmarket_printing_mappings($1,100)',[cursor])).rows;
  all.push(...rows); if(rows.length<100)break;cursor=Number(rows.at(-1).cardmarket_product_id);
 }
 const entire=(await db.query('select * from api.legacy_reviewed_cardmarket_mappings(0,500)')).rows;
 assert.deepEqual(all,entire,'keyset ledger has no omission/duplication from rejected native candidates');checks++;
 await db.exec('reset role');
 for(const role of ['anon','authenticated']){
  const access=(await db.query("select has_function_privilege($1,'api.list_reviewed_cardmarket_printing_mappings(bigint,integer)','execute') ok",[role])).rows[0];
  assert.equal(access.ok,false);checks++;
 }
 const proc=(await db.query("select prosecdef from pg_proc where oid='api.list_reviewed_cardmarket_printing_mappings(bigint,integer)'::regprocedure")).rows[0];
 const candidateDefinition=(await db.query("select pg_get_functiondef('api.list_reviewed_cardmarket_printing_mappings(bigint,integer)'::regprocedure) definition")).rows[0].definition;
 assert.equal(proc.prosecdef,false,'candidate must retain invoker security');
 await db.exec('rollback');
 const restored=(await db.query("select pg_get_functiondef('api.list_reviewed_cardmarket_printing_mappings(bigint,integer)'::regprocedure) definition")).rows[0].definition;
 assert.equal(restored,originalDefinition,'rollback restores exact predecessor');
 await db.exec('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text,name text,statements text[]);');
 const before=await readPriceGuardState(db,CARDMARKET_LEDGER_SIGNATURE);
 const baseline={project:PRICE_GUARD_STAGING_PROJECT,count:0,orderedVersionNameMd5:orderedVersionNameMd5(before.ledger),orderedStatementLedgerSha256:orderedRemoteStatementLedgerSha256(before.ledger)};
 const sourceCandidate={predecessorDefinitionMd5:before.guard.hash,candidateDefinitionMd5:createHash('md5').update(candidateDefinition).digest('hex'),sourceLfSha256:createHash('sha256').update(candidate.replaceAll('\r\n','\n')).digest('hex')};
 const readCanary=async client=>{await client.exec('set local role service_role');try{return (await client.query('select * from api.list_reviewed_cardmarket_printing_mappings(0,100)')).rows;}finally{await client.exec('reset role');}};
 const rehearsal={client:db,projectRef:PRICE_GUARD_STAGING_PROJECT,signature:CARDMARKET_LEDGER_SIGNATURE,candidate:sourceCandidate,baseline,migrationSql:candidate,readCanary};
 const result=await rehearsePriceIdentityGuard(rehearsal);
 assert.equal(result.rollbackVerified,true);assert.equal(result.persistedCandidate,false);assert.equal(result.canaryCount,100);checks++;
 await assert.rejects(()=>rehearsePriceIdentityGuard({...rehearsal,signature:'api.unreviewed()'}),/unreviewed_function/);checks++;
 await assert.rejects(()=>rehearsePriceIdentityGuard({...rehearsal,readCanary:async client=>{const rows=await readCanary(client);if((await readPriceGuardState(client,CARDMARKET_LEDGER_SIGNATURE)).guard.hash!==before.guard.hash)throw Error('injected Cardmarket control failure');return rows;}}),/injected Cardmarket/);checks++;
 assert.equal((await readPriceGuardState(db,CARDMARKET_LEDGER_SIGNATURE)).guard.hash,before.guard.hash);
 console.log(JSON.stringify({checks,nativeResponseParity:true,fullKeysetLedgerParity:true,invalidRawCandidatesDoNotTruncate:true,invokerAccessPreserved:true,rollbackRestored:true,canonicalRollbackOnly:true,unreviewedFunctionRejected:true,failedControlsRestorePredecessor:true,sourceOnly:true,predecessorDefinitionMd5:sourceCandidate.predecessorDefinitionMd5,candidateDefinitionMd5:sourceCandidate.candidateDefinitionMd5,candidateLfSha256:sourceCandidate.sourceLfSha256}));
} finally {await db.close();}
