import { createNativePostgresFixture, nativeFixtureEnabled } from './test-fixtures/native-postgres-fixture.mjs';
// Default: local PGlite. Explicit CI mode uses only its isolated localhost PG17 service.
// Neither mode accepts a remote database URL or production credentials.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { baselineFunction, baselineQuery, materializedQuery, candidateFunction, candidateQuery, createPreparedDatabase, ownerA, ownerB, id } from './test-fixtures/prepared-valuation-db.mjs';
const proposedSql=readFileSync(new URL('../docs/releases/evidence/prepared-valuation-measurement-20261026/proposed-function.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const rollbackSql=readFileSync(new URL('../docs/releases/evidence/prepared-valuation-measurement-20261026/rollback-function.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const stripComments=s=>s.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n').trim();
assert.equal(stripComments(proposedSql),stripComments('begin;\n'+candidateFunction+'\ncommit;'));
assert.equal(stripComments(rollbackSql),stripComments('begin;\n'+baselineFunction.replace('create function','create or replace function')+'\ncommit;'));
const nativeFixture=await createNativePostgresFixture();
let preparedFixture;
try { preparedFixture=await createPreparedDatabase(nativeFixture); }
catch(error) { await nativeFixture?.close(); throw error; }
const {db,seed}=preparedFixture;
const hash=s=>createHash('sha256').update(s).digest('hex');
const output={environment:nativeFixtureEnabled()?'Isolated CI PostgreSQL 17; synthetic rows with observed full column/index shapes':'Local in-memory PGlite; synthetic rows with observed full column/index shapes',executedAnalysis:true,hostedAnalysis:false,newIndexes:[],samplesPerVariant:6,workMem:'2184kB (observed hosted setting)',hostedPostgres:'17.6; local version reported separately',sourceFunctionSha256:hash(baselineFunction),candidateFunctionSha256:hash(candidateFunction),cohorts:[],limitations:['No authenticated client or installed-screen timing.','No device network, disk-cold or concurrent-session simulation.','Foreign-row stress population is synthetic, not a copy of production.','Six measured warm rounds use all permutations of baseline/materialized/barrier order.','Wall samples include local result deserialization; plan execution timings are separate.','This changes duplicate JSON aggregation only: full rows and byte count remain unchanged.']};
function nodes(plan,type){let total=plan['Node Type']===type?1:0;for(const p of plan.Plans??[])total+=nodes(p,type);return total}
function tempBlocks(plan){return {read:plan['Temp Read Blocks']??0,written:plan['Temp Written Blocks']??0}}
const run=async(q,owner=ownerA)=>(await db.query(q,[owner])).rows[0];
const json=async(q,owner=ownerA)=>Object.values(await run(q,owner))[0];
const stats=a=>{ const ordered=[...a].sort((a,b)=>a-b), midpoint=Math.floor(a.length/2); return {samples:a,medianMs:(ordered[midpoint-1]+ordered[midpoint])/2,minMs:ordered[0],maxMs:ordered.at(-1)}; };
try{
 output.postgres=(await db.query('select version() version')).rows[0].version;
 for(const [name,n,o,multi] of [['empty',0,0,false],['small',24,18,false],['large',1702,1323,false],['multilingual',250,200,true]]){
  const population=await seed(n,o,multi),row={name,population,variants:[]};
  const baseline=await json(baselineQuery),candidate=await json(candidateQuery);assert.deepEqual(candidate,baseline);
  assert.equal(baseline.binderCards.length,n);assert.equal(baseline.ownedRows.length,o);assert.equal(baseline.binders.length,population.binders);
  assert.ok(baseline.binders.every(b=>b.user_id===ownerA));assert.ok(baseline.ownedRows.every(o=>o.user_id===ownerA&&o.quantity>0));
  assert.ok(baseline.binderCards.every(c=>c.binder_id!==id(99)));
  row.jsonBytes=Buffer.byteLength(JSON.stringify(baseline));row.jsonBytesMeaning='Internal complete input payload, not the compact prepared API response';row.exactPayloadAndRevisionEqual=true;
  if(multi){const sameNumber=baseline.binderCards.filter(c=>c.card_number==='0');assert.equal(new Set(sameNumber.map(c=>c.language)).size,5);row.sameCollectorNumberLanguagesRetained=5;}
  const timing={before:[],materialized:[],after:[]};
  const queries=[['before',baselineQuery],['materialized',materializedQuery],['after',candidateQuery]];
  const orders=[[0,1,2],[2,1,0],[1,2,0],[0,2,1],[2,0,1],[1,0,2]];
  for(const order of orders)for(const index of order){
   const [label,q]=queries[index];
   const start=performance.now();const result=await json(q);timing[label].push(performance.now()-start);assert.deepEqual(result,baseline);
  }
  for(const [label,q]of [['before',baselineQuery],['materialized',materializedQuery],['after',candidateQuery]]){
   const plan=(await db.query('explain (analyze,buffers,format json) '+q,[ownerA])).rows[0]['QUERY PLAN'][0];
   const agg=nodes(plan.Plan,'Aggregate');assert.equal(agg,label==='before'?6:3);
   row.variants.push({label,...stats(timing[label]),aggregateNodes:agg,planExecutionMs:plan['Execution Time'],tempBlocks:tempBlocks(plan.Plan),plan});
  }
  // Actual installed SQL function equality; CREATE OR REPLACE preserves its existing grants.
  await db.exec('reset role; '+proposedSql+'; set role service_role;');
  assert.deepEqual((await db.query('select api.collection_valuation_inputs($1) body',[ownerA])).rows[0].body,baseline);
  const foreign=await json(candidateQuery,ownerB);assert.equal(foreign.binderCards.length,population.foreignSaved);assert.ok(foreign.binders.every(b=>b.user_id===ownerB));
  row.foreignPublicBinderExcluded=true;
  if(n){
   // Full-width metadata, multilingual identity and zero/positive edits must retain revision behavior.
   const changes=[
    ['binder_cards','notes',"'Updated note and private metadata'",id(1000)],
    ['binder_cards','language',"'ko'",id(1000)],
    ['binder_cards','owned_quantity','owned_quantity+1',id(1000)],
    ['binders','edition',"'first_edition'",id(1)],
    ['user_card_variants','variant',"'reverse_holo'",id(50000)],
    ['user_card_variants','quantity','quantity+1',id(50000)],
    ['user_card_variants','quantity','1',id(90000)],
    ['user_card_variants','quantity','0',id(50000)],
   ];
   row.revisionEditChecks=[];
   for(const [table,column,value,key]of changes){
    const prior=await json(candidateQuery);await db.exec('reset role');await db.query('update public.'+table+' set '+column+'='+value+' where id=$1',[key]);await db.exec('set role service_role');
    const a=await json(baselineQuery),b=await json(candidateQuery);assert.deepEqual(b,a);assert.notEqual(b.collectionRevision,prior.collectionRevision);row.revisionEditChecks.push(table+'.'+column);
   }
   // Physical insertion order does not affect ordered JSON arrays or revision.
   const prior=await json(candidateQuery);await db.exec('reset role; create temp table reversed_cards as select * from public.binder_cards order by id desc; truncate public.binder_cards; insert into public.binder_cards select * from reversed_cards; drop table reversed_cards; set role service_role;');
   assert.deepEqual(await json(candidateQuery),prior);row.insertionOrderIndependent=true;
   // Exercise a wide payload under a constrained local work_mem; report spill rather than hide it.
   await db.exec("reset role; update public.binder_cards set notes=repeat('wide unicode ピカチュウ ',2000) where id='"+id(1000)+"'; set role service_role; set work_mem='64kB';");
   assert.deepEqual(await json(candidateQuery),await json(baselineQuery));
   row.widePayloadPlans=[];
   for(const [label,q]of [['before',baselineQuery],['after',candidateQuery]]){const p=(await db.query('explain (analyze,buffers,format json) '+q,[ownerA])).rows[0]['QUERY PLAN'][0];row.widePayloadPlans.push({label,tempBlocks:tempBlocks(p.Plan),plan:p});}
   await db.exec("set work_mem='2184kB'");
  }

  // Exercise the unchanged GET wrapper locally, including its writes, without network.
  row.requestWrapperChecks=[];
  const current=await json(candidateQuery);
  for(const state of ['missing','fresh','stale','changed']){
   const responses=[];
   for(const fn of [baselineFunction.replace('create function','create or replace function'),candidateFunction]){
    await db.exec('reset role; '+fn+'; delete from public.collection_valuation_generations;');
    if(state!=='missing')await db.query("insert into public.collection_valuation_generations(owner_id,collection_revision,summary,calculated_at,requested_at) values($1,$2,$3::jsonb,case when $4='stale' then now()-interval '4 minutes' else now()+interval '1 hour' end,now()-interval '1 minute')",[ownerA,state==='changed'?'old-revision':current.collectionRevision,JSON.stringify({total:123,totalUnits:current.ownedRows.length}),state]);
    await db.exec('set role service_role');
    responses.push((await db.query('select api.request_collection_valuation($1,false) body',[ownerA])).rows[0].body);
   }
   assert.deepEqual(responses[1],responses[0]);assert.equal(responses[0].state,{missing:'pending',fresh:'ready',stale:'updating',changed:'updating'}[state]);row.requestWrapperChecks.push({scenario:state,state:responses[0].state,exactResponseEqual:true});
  }

  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(()=>db.query('select api.collection_valuation_inputs($1)',[ownerA]),e=>e.code==='42501');
  }
  await db.exec('reset role');
  const contract=(await db.query("select provolatile,prosecdef,proconfig,proacl::text from pg_proc where oid='api.collection_valuation_inputs(uuid)'::regprocedure")).rows[0];
  assert.equal(contract.provolatile,'s');assert.equal(contract.prosecdef,false);assert.ok(contract.proacl.includes('service_role=X/'));row.functionContract=contract;

  const privileges=(await db.query("select has_function_privilege('anon','api.collection_valuation_inputs(uuid)','EXECUTE') as anon, has_function_privilege('authenticated','api.collection_valuation_inputs(uuid)','EXECUTE') as authenticated, has_function_privilege('service_role','api.collection_valuation_inputs(uuid)','EXECUTE') as service, exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='api.collection_valuation_inputs(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public")).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:false,service:true,public:false});
  assert.deepEqual(contract.proconfig,['search_path=""']);row.functionPrivileges=privileges;

  // Restore baseline definition without touching ACL for the next independent population.
  await db.exec(rollbackSql);output.cohorts.push(row);
 }
 console.log(JSON.stringify(output,null,2));
}finally{await db.close();}
