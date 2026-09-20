import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { assertCatalogueCapacity, catalogueRefreshPlan, refreshOutcome } from './refresh-catalogue-prices.mjs';
import { mergeValuationTrend, valuationTrendEvidence, ownedValuationUnits, prepareCollectionValuation, readPages, resolveValuationUnit, setValuationUnits, summarisePreparedUnits } from './lib/prepared-collection-valuation.mjs';
import { createMarketPricingService } from '../backend/lib/marketPricing/service.js';
import { summariseTcgdexExactVariantPricing } from '../backend/lib/tcgdex.js';
import { ownerQueueRetryAfter, prepareStoredValuationIfEnabled } from './refresh-owner-provider-prices.mjs';

const providerCard={id:'sv01-1',set:{id:'sv01'},localId:'1',language:'en',variants:{normal:true,holo:true,reverse:true},
 pricing:{tcgplayer:{unit:'USD',updated:'2026-09-18T00:00:00Z',normal:{marketPrice:5},holofoil:{marketPrice:10},'reverse-holofoil':{marketPrice:15}}}};
const normalQuote=summariseTcgdexExactVariantPricing(providerCard,'en','normal');
const holoQuote=summariseTcgdexExactVariantPricing(providerCard,'en','holo');
const reverseQuote=summariseTcgdexExactVariantPricing(providerCard,'en','reverse_holo');
assert(normalQuote && holoQuote && reverseQuote);
assert.equal(holoQuote.price,normalQuote.price*2);assert.equal(reverseQuote.price,Math.round(normalQuote.price*300)/100);
assert.equal(reverseQuote.pricingUpdatedAt,'2026-09-18T00:00:00Z');
assert.equal(summariseTcgdexExactVariantPricing(providerCard,'ja','holo'),null,'no English counterpart for Japanese');
assert.equal(summariseTcgdexExactVariantPricing({...providerCard,variants:{normal:true}},'en','reverse_holo'),null,'explicit finish proof required');
assert.equal(summariseTcgdexExactVariantPricing({...providerCard,pricing:{cardmarket:{unit:'EUR',trend:9,'trend-holo':20}}},'en','holo'),null,'ambiguous Cardmarket finish rejected');
assert(Date.parse(ownerQueueRetryAfter(0,'3600'))>=Date.now()+3599000,'priority queue honours provider Retry-After');
assert(refreshOutcome({status:401}).systemic);assert(refreshOutcome({status:503}).systemic);

const rows=Array.from({length:1201},(_,i)=>({id:i}));
const paginated=await readPages(()=>({range:async(a,b)=>({data:rows.slice(a,b+1)})}));
assert.equal(paginated.length,1201);
assert.equal(paginated.at(-1).id,1200);
assert.equal(catalogueRefreshPlan([{language_code:'ja',variant_code:'normal',finish_code:'normal'}]).fits,false);
assert.throws(()=>assertCatalogueCapacity(catalogueRefreshPlan(Array.from({length:52773},()=>({language_code:'en',variant_code:'normal',finish_code:'normal'})),{requestBudget:100000})),/do not fit/);
assert.doesNotThrow(()=>assertCatalogueCapacity(catalogueRefreshPlan([{language_code:'en',variant_code:'normal',finish_code:'normal'}],{requestBudget:10})));
assert.equal(refreshOutcome({status:429,retryAfter:'3600'}).delay,3600);
assert.equal(refreshOutcome({code:'unresolved_provider_identity'}).outcome,'unresolved_identity');

const variants=[{variant_id:'normal',printing_id:'p',variant_code:'normal'},
  {variant_id:'holo',printing_id:'p',variant_code:'holo'}, {variant_id:'reverse',printing_id:'p',variant_code:'reverse_holo'}];
assert.equal(setValuationUnits(variants,'standard').length,1);
assert.equal(setValuationUnits(variants,'master').length,3);
assert.equal(setValuationUnits(variants,'standard')[0].variantId,'normal');
assert.equal(setValuationUnits(variants.slice(1),'standard')[0].variantId,'holo');
assert.equal(setValuationUnits([...variants,{variant_id:'first',printing_id:'p',variant_code:'first_edition'}],'standard','1st_edition')[0].variantId,'first');
assert.equal(resolveValuationUnit({quantity:1,grade:'10',condition:'near_mint'},[],[]).reason,'unsupported_scope');
const ownerInput={ownedRows:[{id:'o',card_id:'c',set_id:'s',quantity:2,variant:'normal',condition:'near_mint'}],
  binders:[{id:'b',type:'custom'},{id:'b2',type:'custom'}],
  binderCards:[{binder_id:'b',card_id:'c',set_id:'s',owned:true,owned_quantity:2}, {binder_id:'b2',card_id:'c',set_id:'s',owned:true,owned_quantity:2}]};
assert.equal(ownedValuationUnits(ownerInput).length,1);
assert.equal(ownedValuationUnits(ownerInput)[0].quantity,2);
const price={currency:'GBP',status:'market_estimate',estimates:{central:4},freshness:'fresh',staleAfter:'2099-01-01',calculatedAt:'2026-09-19'};
assert.equal(summarisePreparedUnits([{variantId:'v',quantity:2}],new Map(),new Map([['v',price]])).total,8);
assert.equal(summarisePreparedUnits([{variantId:'v',quantity:2}],new Map(),new Map([['v',{...price,estimates:{central:0}}]])).total,0);

assert.equal(setValuationUnits([...variants,{...variants[1],variant_id:'duplicate'}],'master').length,3);
assert.equal(setValuationUnits([...variants,{...variants[1],variant_id:'duplicate'}],'master')[1].reason,'unresolved_identity');
assert.equal(ownedValuationUnits({ownedRows:[],binders:[{id:'b',edition:'unlimited'}],binderCards:[{binder_id:'b',card_id:'c',set_id:'s',owned:true} ]})[0].variant,'normal');
const trendSummary={totalUnits:2,freshUnits:2,unpricedUnits:0};
const trendUnits=[{variantId:'v',quantity:2}];const trendPrices=new Map([['v',price]]);
const evidence=valuationTrendEvidence(trendUnits,trendPrices,trendSummary);
assert(evidence.eligible);
assert.notEqual(evidence.scope,valuationTrendEvidence([{variantId:'v',quantity:1}],trendPrices,trendSummary).scope);
assert.notEqual(evidence.scope,valuationTrendEvidence(trendUnits,new Map([['v',{...price,primarySource:'new-source'}]]),trendSummary).scope);
assert(!valuationTrendEvidence(trendUnits,trendPrices,{...trendSummary,freshUnits:1}).eligible);
const point={at:'2026-09-19T01:00:00Z',total:8,evidence:'a'};
assert.equal(mergeValuationTrend([point],{...point,at:'2026-09-19T02:00:00Z'},true).length,1,'re-reading the same quote does not invent history');
assert.equal(mergeValuationTrend([point],{...point,total:9,evidence:'b'},true).length,1,'one point per time bucket');
assert.equal(mergeValuationTrend([point],{...point,total:9,evidence:'b',at:'2026-09-19T02:00:00Z'},false).length,1,'partial generations add no trend');
assert.equal(await prepareStoredValuationIfEnabled({env:{},dryRun:false}),null,'default-off worker does not touch database');
assert.equal(await prepareStoredValuationIfEnabled({env:{STACKR_PREPARED_VALUATIONS_ENABLED:'true'},dryRun:true}),null,'dry run does not publish');
const db=new PGlite();
await db.exec("create function public.test_uuid(v text) returns uuid language sql immutable as $$ select (substr(md5(v),1,8)||'-'||substr(md5(v),9,4)||'-4'||substr(md5(v),14,3)||'-8'||substr(md5(v),18,3)||'-'||substr(md5(v),21,12))::uuid $$;");
await db.exec(`create schema api; create schema auth; create schema catalog;
 create table catalog.catalogue_version_external_identifiers(catalogue_version_id uuid,language_code text,variant_id uuid,printing_id uuid,external_id text,set_id uuid);
 create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key);
 create table api.catalogue_cards(variant_id uuid,printing_id uuid,set_id uuid,language_code text,variant_code text,finish_code text,catalogue_version_id uuid);
 create table public.binders(id uuid,user_id uuid);
 create table public.user_card_variants(id uuid,user_id uuid,quantity int);
 create table public.binder_cards(id uuid,binder_id uuid);
 create table public.market_price_snapshots(id uuid,card_id text,user_id uuid,calculated_at timestamptz,pricing_identity_json jsonb);
 create table api.market_price_estimates(variant_id uuid,product_kind text,condition_code text,display_currency_code text,fallback_identity_key text,calculated_at timestamptz);
 insert into api.catalogue_cards select test_uuid(i::text)::text::uuid,test_uuid(i::text)::text::uuid,test_uuid('set')::text::uuid,
   (array['en','ja','zh-cn','zh-tw','ko'])[1+i%5],'normal','normal',test_uuid('revision')::text::uuid from generate_series(1,1201) i;
 insert into auth.users values(test_uuid('owner')::text::uuid),(test_uuid('other')::text::uuid);
 insert into public.user_card_variants select test_uuid(i::text)::text::uuid,test_uuid('owner')::text::uuid,1 from generate_series(1,1201) i;`);
const migrationSql=await readFile(new URL('../supabase/migrations/20260919100104_catalogue_pricing_cycles.sql',import.meta.url),'utf8');
await db.exec('begin');
await db.exec(migrationSql);
assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.collection_valuation_generations'::regclass")).rows[0].relrowsecurity,true);
await db.exec('rollback');
assert.equal((await db.query("select to_regclass('public.collection_valuation_generations') as relation")).rows[0].relation,null,'rehearsal rolls back created tables');
assert.equal((await db.query("select to_regprocedure('api.collection_valuation_inputs(uuid)') as routine")).rows[0].routine,null,'rehearsal rolls back created routines');
assert.equal((await db.query('select count(*)::int as count from public.user_card_variants')).rows[0].count,1201,'rehearsal preserves holdings');
await db.exec(migrationSql);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const cycle=await scalar('select api.begin_catalogue_price_cycle()');
assert.equal(await scalar('select api.begin_catalogue_price_cycle()'),cycle,'overlapping schedulers reuse cycle');
assert.equal(await scalar('select population from public.catalogue_price_cycles'),1201);
const claim=(await db.query('select * from api.claim_catalogue_prices($1,100)',[cycle])).rows;
const second=(await db.query('select * from api.claim_catalogue_prices($1,100)',[cycle])).rows;
assert.equal(new Set([...claim,...second].map((r)=>r.variant_id)).size,200,'leases prevent duplicate work');
assert.equal(await scalar('select api.finish_catalogue_price($1,$2,gen_random_uuid(),$3,60,null)',[cycle,claim[0].variant_id,'priced']),false,'stale writer rejected');
await db.exec("update public.catalogue_price_items set lease_until=now()-interval '1 second' where ordinal=1");
const resumed=(await db.query('select * from api.claim_catalogue_prices($1,100)',[cycle])).rows;
assert(!resumed.some((r)=>r.ordinal===1),'fresh unattempted work is not starved by retry');
assert.equal(await scalar("select api.reserve_catalogue_provider_request('tcgdex',1,1000)"),true);
assert.equal(await scalar("select api.reserve_catalogue_provider_request('tcgdex',1,1000)"),false);
const request=await scalar("select api.request_collection_valuation(test_uuid('owner')::text::uuid)");
assert.equal(request.state,'pending');
const generation=await scalar("select api.claim_collection_valuation(test_uuid('owner')::text::uuid)");
assert.equal(generation.inputs.ownedRows.length,1201,'no 1000-row ownership truncation');
assert.equal(await scalar("select api.claim_collection_valuation(test_uuid('owner')::text::uuid)"),null,'generation lease excludes overlapping work');
await db.exec("update public.user_card_variants set quantity=2 where id=test_uuid('1')::text::uuid");
assert.equal(await scalar("select api.publish_collection_valuation(test_uuid('owner')::text::uuid,$1,$2,$3,null)",
  [generation.lease,generation.inputs.collectionRevision,{valuationRevision:'11111111-1111-4111-8111-111111111111'}]),false,'ownership change prevents mixed generation');
assert.equal(await scalar("select has_function_privilege('authenticated','api.collection_valuation_inputs(uuid)','EXECUTE')"),false);
assert.equal(await scalar("select has_table_privilege('anon','public.collection_valuation_generations','SELECT')"),false);
assert.equal(await scalar("select has_function_privilege('anon','api.claim_catalogue_prices(uuid,integer)','EXECUTE')"),false);
// Execute the real preparation worker, stored-price service, and SQL publication
// together. The transport shim translates Supabase queries to the isolated DB.
await db.exec(`alter table public.user_card_variants add card_id text,add set_id text,add variant text,add condition text;
 alter table public.binders add source_set_id text,add type text,add language text,add edition text;
 alter table public.binder_cards add card_id text,add set_id text,add owned boolean,add owned_card_variant_id uuid;
 alter table api.catalogue_cards add set_code text,add collector_number text;
 create table api.catalogue_external_identifiers(source_entity_type text,external_id text,language_code text,set_id uuid,printing_id uuid,variant_id uuid);
 alter table public.market_price_snapshots add set_id text,add language text,add primary_source text,add tcgdex_price numeric,
   add snapshot_at timestamptz,add stale_after timestamptz,add price_type text;
 insert into public.user_card_variants(id,user_id,quantity,card_id,set_id,variant,condition)
 values(test_uuid('holding')::text::uuid,test_uuid('other')::text::uuid,2,test_uuid('1')::text,test_uuid('set')::text,'normal','near_mint');
 insert into public.binders(id,user_id,source_set_id,type,language,edition)
 values(test_uuid('binder')::text::uuid,test_uuid('other')::text::uuid,test_uuid('set')::text,'official','ja','normal');
 insert into public.market_price_snapshots(id,card_id,set_id,language,primary_source,tcgdex_price,calculated_at,snapshot_at,stale_after,price_type,pricing_identity_json)
 values(test_uuid('quote')::text::uuid,test_uuid('1')::text,test_uuid('set')::text,'ja','tcgdex',4,now(),now(),now()+interval '6 hours','market_estimate',
 jsonb_build_object('canonicalVariantId',test_uuid('1')::text,'productType','raw_card','rawCondition','raw_near_mint'));`);
class Query {
 constructor(schema,table){this.schema=schema;this.table=table;this.fields='*';this.where=[];this.values=[];this.orders=[];}
 select(fields){this.fields=fields;return this;}
 eq(field,value){this.values.push(value);this.where.push(`${field}=$${this.values.length}`);return this;}
 in(field,values){this.values.push(values);this.where.push(`${field}=any($${this.values.length})`);return this;}
 order(field){this.orders.push(field);return this;}
 range(a,b){this.offset=a;this.limit=b-a+1;return this;}
 async then(resolve,reject){try { const sql=`select ${this.fields} from ${this.schema}.${this.table}${this.where.length?' where '+this.where.join(' and '):''}${this.orders.length?' order by '+this.orders.join(','):''}${this.limit?' limit '+this.limit+' offset '+this.offset:''}`;
   return resolve({data:(await db.query(sql,this.values)).rows,error:null}); }catch(error){return reject(error);} }
}
const transport=(schema='public')=>({from:(table)=>new Query(schema,table),schema:transport,
 rpc:async(name,args)=>{
   const names=Object.keys(args);const call=`api.${name}(${names.map((n,i)=>`${n}=>$${i+1}`).join(',')})`;
   const rows=(await db.query(`select ${call} data`,Object.values(args))).rows;
   return {data:name==='latest_stored_exact_prices'?rows.map((r)=>r.data):rows[0]?.data,error:null};
 }});
const other=await scalar("select test_uuid('other')::text::uuid");const supabase=transport();
const service=createMarketPricingService({supabase,fetchTcgdexNormalCardPrice:()=>{throw Error('Provider called during stored valuation');}});
await service.collectionValuation(other);
const prepared=await prepareStoredValuationIfEnabled({supabase,service,ownerId:other,dryRun:false,env:{STACKR_PREPARED_VALUATIONS_ENABLED:'true'}});
assert.equal(prepared.published,true);assert.equal(prepared.summary.total,8);assert.equal(prepared.summary.totalUnits,2);
const readback=await service.collectionValuation(other);
assert.equal(readback.state,'ready');assert.equal(readback.summary.total,8);
assert.equal(await scalar('select count(*)::int from public.collection_valuation_history'),1);
assert.equal((await scalar('select api.collection_valuation_trend($1,$2)',[other,prepared.summary.trend.scope])).length,1);
assert.equal((await scalar("select api.collection_valuation_trend(test_uuid('owner'),$1)",[prepared.summary.trend.scope])).length,0,'history is owner-scoped');
assert.equal(await scalar("select has_table_privilege('authenticated','public.collection_valuation_history','SELECT')"),false);
await db.exec("update public.collection_valuation_generations set calculated_at=now()-interval '4 minutes' where owner_id=test_uuid('other')");
await prepareCollectionValuation({supabase,service,ownerId:other});
assert.equal(await scalar('select count(*)::int from public.collection_valuation_history'),1,'unchanged provider evidence cannot create trend points');
await db.exec("update public.user_card_variants set quantity=1 where id=test_uuid('holding')::text::uuid");
const updating=await service.collectionValuation(other);
assert.equal(updating.state,'updating');assert.equal(updating.summary.totalUnits,2,'old summary retains its own quantities');
const replacement=await prepareCollectionValuation({supabase,service,ownerId:other});
assert.equal(replacement.summary.total,4);assert.equal(replacement.summary.totalUnits,1);
// Manual refresh enumeration crosses 1,000 identities without a repeated prefix.
const owner=await scalar("select test_uuid('owner')::text");
await db.exec("update public.user_card_variants set card_id=id::text,set_id=test_uuid('set')::text,variant='normal',condition='near_mint' where user_id=test_uuid('owner')");
await service.collectionValuation(owner,true);
const queued=new Set();const enqueueService={...service,requestSnapshotRefresh:async(id)=>{
 assert(!queued.has(id),'persisted refresh cursor must not restart the first batch');queued.add(id);return {status:'queued'};
}};
let passes=0,collectionRefresh;
do {
 collectionRefresh=await prepareCollectionValuation({supabase,service:enqueueService,ownerId:owner,providerCapacityVerified:true});
 assert.equal(collectionRefresh.published,true);passes++;
 if(passes===1) {assert.equal(queued.size,50);assert.equal((await service.collectionValuation(owner)).refreshRequest.pending,true);}
 assert(passes<=25);
}while(collectionRefresh.summary.refresh.remaining>0);
assert.equal(queued.size,1201);assert.equal(passes,25);
assert.equal((await service.collectionValuation(owner)).refreshRequest.pending,false);
assert.equal(collectionRefresh.summary.refresh.accepted,1201);

// A corrected published identity must stop an old exact snapshot being reused.
await db.exec("update api.catalogue_cards set language_code='ko' where variant_id=test_uuid('1')");
assert.equal((await service.storedExactPrices([await scalar("select test_uuid('1')::text")])).length,0);
await db.exec("update api.catalogue_cards set language_code='ja' where variant_id=test_uuid('1')");
const publicationPriority=async()=>(await db.query('select * from api.catalogue_price_priority_candidates(12)')).rows;
assert.equal((await publicationPriority()).length,0,'initial catalogue is handled by the full cycle, not a priority flood');
await db.exec("update api.catalogue_cards set catalogue_version_id=test_uuid('new revision') where variant_id=test_uuid('1')");
const priority=(await publicationPriority())[0].catalogue_price_priority_candidates;
assert.equal(priority.variantId,await scalar("select test_uuid('1')::text"));
await db.query('insert into public.catalogue_price_priority_markers(variant_id,identity) values($1,$2)',[priority.variantId,priority]);
assert.equal((await publicationPriority()).length,0,'publication markers avoid repeating the first priority page');
await db.exec("update api.catalogue_cards set catalogue_version_id=test_uuid('revision') where variant_id=test_uuid('1')");
await db.exec("insert into catalog.catalogue_version_external_identifiers(catalogue_version_id,language_code,variant_id,printing_id,external_id) values(test_uuid('revision'),'ja',test_uuid('1'),test_uuid('1'),'old-alias')");
const repair=(await publicationPriority())[0].catalogue_price_priority_candidates;
assert(repair.repairRevision,'alias-only change creates priority work without publication change');
await db.query('update public.catalogue_price_priority_markers set identity=$2 where variant_id=$1',[repair.variantId,repair]);
assert.equal((await publicationPriority()).length,0);
await db.exec("update catalog.catalogue_version_external_identifiers set external_id='fixed-alias'");
const repaired=(await publicationPriority())[0].catalogue_price_priority_candidates;
assert.notEqual(repaired.repairRevision,repair.repairRevision);
await db.query('update public.catalogue_price_priority_markers set identity=$2 where variant_id=$1',[repaired.variantId,repaired]);
await db.exec("delete from catalog.catalogue_version_external_identifiers");
assert.notEqual((await publicationPriority())[0].catalogue_price_priority_candidates.repairRevision,repaired.repairRevision,'removing an incorrect alias also signals repair');
const identityLease=await scalar("select api.claim_price_identity(test_uuid('1'))");
assert(identityLease);assert.equal(await scalar("select api.claim_price_identity(test_uuid('1'))"),null,'priority and catalogue cannot fetch the same identity concurrently');
await db.exec("update public.catalogue_price_items set lease_until=now()-interval '1 second'");
let completed=0;
while(true) {
 const batch=(await db.query('select * from api.claim_catalogue_prices($1,100)',[cycle])).rows;
 if(!batch.length)break;
 for(const item of batch) {
  assert.equal(await scalar("select api.finish_catalogue_price($1,$2,$3,'no_provider_quote',86400,null)",[cycle,item.variant_id,item.lease_token]),true);
  completed++;
 }
}
assert.equal(completed,1201);
assert.equal(await scalar('select checkpoint from public.catalogue_price_cycles where id=$1',[cycle]),1201);
assert(await scalar('select completed_at from public.catalogue_price_cycles where id=$1',[cycle]));
assert.equal(await scalar('select api.begin_catalogue_price_cycle()'),cycle,'completed cycle waits for the 12-hour cadence');
await db.exec("update public.catalogue_price_cycles set due_at=now()-interval '1 second'");
const nextCycle=await scalar('select api.begin_catalogue_price_cycle()');
assert.notEqual(nextCycle,cycle);
assert.equal(await scalar('select checkpoint from public.catalogue_price_cycles where id=$1',[nextCycle]),1201,'negative cache accounts for every identity without repeated provider calls');
assert(await scalar('select completed_at from public.catalogue_price_cycles where id=$1',[nextCycle]));
await db.close();
console.log('Catalogue pricing: pagination, exact quantities, set modes, persistent leases, backoff, private generation and ownership consistency passed.');
