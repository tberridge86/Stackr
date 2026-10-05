import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createCataloguePriceRead } from '../backend/lib/marketPricing/cataloguePriceRead.js';
import { validateMappingRepairs, mainCataloguePriceGuide } from './catalogue-price-guide.mjs';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite(); const encode = JSON.stringify;
async function rpc(name: string, args: unknown[] = []) { const placeholders = args.map((_, i) => `$${i + 1}`).join(','); return (await db.query<any>(`select api.${name}(${placeholders}) as result`, args)).rows.map((r) => r.result); }
async function main() { try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema api; create schema catalog; create schema market;
    create table catalog.catalogue_versions(id uuid primary key, status text not null default 'published', deprecated_at timestamptz); create table catalog.sets(id uuid primary key, language_code text, deprecated_at timestamptz); create table catalog.languages(code text primary key);
    create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id)); create table catalog.catalogue_version_sets(catalogue_version_id uuid,set_id uuid,primary key(catalogue_version_id,set_id));
    create table catalog.card_printings(id uuid primary key,collector_number text,language_code text,set_id uuid,deprecated_at timestamptz);
    create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz,is_default boolean);
    create table api.catalogue_cards(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,variant_code text,finish_code text,catalogue_version_id uuid,collector_number text,card_english_display_name text,card_native_name text);
    create table api.catalogue_sets(set_id uuid,language_code text,native_name text,english_display_name text);
    create table catalog.catalogue_version_external_identifiers(external_id text,language_code text,catalogue_version_id uuid,printing_id uuid,variant_id uuid); create view api.catalogue_external_identifiers as select * from catalog.catalogue_version_external_identifiers;
    create table api.market_price_estimates(variant_id uuid,product_kind text,display_currency_code text,condition_code text,language_code text,grader_code text,grade_value numeric,fallback_identity_key text,calculated_at timestamptz,price_estimate_id uuid);
    create table public.market_price_snapshots(id bigint,card_id text,language text,calculated_at timestamptz,user_id uuid,pricing_identity_json jsonb,set_id text);
    insert into catalog.catalogue_versions values('${id(1)}','published',null); insert into catalog.languages values('en'),('ja'),('ko'),('zh-cn'),('zh-tw'); insert into catalog.sets values('${id(10)}','en',null),('${id(11)}','ja',null),('${id(12)}','ko',null);
    insert into api.catalogue_sets values('${id(10)}','en','Silver Tempest','Silver Tempest'),('${id(11)}','ja','ストームエメラルダ',null),('${id(12)}','ko','Korean Set',null);
    insert into catalog.card_printings(id,collector_number,language_code,set_id) values('${id(20)}','139','en','${id(10)}'),('${id(21)}','001','ja','${id(11)}'),('${id(22)}','001','ko','${id(12)}');
    insert into catalog.card_variants values('${id(30)}','${id(20)}','en','normal','normal',null,true),('${id(31)}','${id(20)}','en','reverse_holo','reverse_holo',null,false),('${id(32)}','${id(21)}','ja','normal','normal',null,true),('${id(33)}','${id(22)}','ko','normal','normal',null,true),('${id(34)}','${id(20)}','en','holo','holo',null,false);
    insert into catalog.catalogue_version_variants values('${id(1)}','${id(30)}'),('${id(1)}','${id(31)}'),('${id(1)}','${id(32)}'),('${id(1)}','${id(33)}'),('${id(1)}','${id(34)}');
    insert into catalog.catalogue_version_sets values('${id(1)}','${id(10)}'),('${id(1)}','${id(11)}'),('${id(1)}','${id(12)}');
    insert into api.catalogue_cards values ('${id(30)}','${id(20)}','${id(10)}','en','normal','normal','${id(1)}','139','Lugia VSTAR',null),('${id(31)}','${id(20)}','${id(10)}','en','reverse_holo','reverse_holo','${id(1)}','139','Lugia VSTAR',null),('${id(32)}','${id(21)}','${id(11)}','ja','normal','normal','${id(1)}','001',null,'ピカチュウ'),('${id(33)}','${id(22)}','${id(12)}','ko','normal','normal','${id(1)}','001',null,'Pikachu'),('${id(34)}','${id(20)}','${id(10)}','en','holo','holo','${id(1)}','139','Lugia VSTAR',null);
    grant usage on schema api,catalog,market,public to service_role; grant select on all tables in schema api,catalog,public to service_role;`);
  await db.exec('alter table api.catalogue_sets add column set_code text');
  for (const file of ['20261003224016_catalogue_price_bulk_cache.sql','20261003224031_restore_full_catalogue_price_guide.sql','20261003224558_catalogue_price_feed_access_indexes.sql','20261003225316_catalogue_price_repair_reads.sql','20261003225832_cardmarket_general_price_backup.sql','20261003231006_batch_catalogue_price_identity_reads.sql','20261003232812_japanese_exact_price_identities.sql','20261003234257_bounded_published_price_read.sql','20261003234442_cover_general_price_foreign_keys.sql','20261004091559_catalogue_bulk_sweep_bounded_initialisation.sql','20261004091600_bounded_collector_search_identity_view.sql','20261004093356_bounded_catalogue_bulk_sweep_finish.sql']) await db.exec(`begin; ${readFileSync(`supabase/migrations/${file}`, 'utf8')} commit;`);
  await db.exec('set role anon'); await assert.rejects(rpc('catalogue_bulk_price_coverage'), /permission denied/); await assert.rejects(rpc('catalogue_bulk_sweep_health'), /permission denied/); await assert.rejects(rpc('read_catalogue_bulk_feed',['last-updated']), /permission denied/); await assert.rejects(db.query('select * from api.catalogue_card_collectors'), /permission denied/); await db.exec('reset role; set role service_role');
  const collectorRows=await db.query<any>("select variant_id from api.catalogue_card_collectors where set_id=$1 and language_code='en' and normalized_collector_base='139' order by variant_id",[id(10)]); assert.deepEqual(collectorRows.rows.map((row:any)=>row.variant_id),[id(30),id(31),id(34)],'collector identity view retains only current published variants');
  assert.equal((await rpc('read_catalogue_bulk_feed',['last-updated']))[0],null);
  await assert.rejects(rpc('read_catalogue_bulk_feed',['../secret']), /invalid feed/);
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc('seed_catalogue_bulk_price_outcomes',[500]), /permission denied/);
  await db.exec('reset role; set role service_role');
  const seeded = [] as any[];
  for (let page = 0; page < 3; page++) { const value=(await rpc('seed_catalogue_bulk_price_outcomes',[2]))[0]; seeded.push(value); if (value.complete) break; }
  assert.equal(seeded.at(-1).complete,true,'physical publication seed completes in bounded pages');
  assert.equal(seeded.reduce((n,row)=>n+row.scanned,0),5);
  assert.equal((await db.query('select * from market.catalogue_price_outcomes')).rows.length,5);
  assert.equal((await db.query<any>('select reason from market.catalogue_price_outcomes where variant_id=$1',[id(33)])).rows[0].reason,'unsupported_provider_language');
  assert.equal((await db.query<any>('select reason from market.catalogue_price_outcomes where variant_id=$1',[id(34)])).rows[0].reason,'unresolved_provider_identity');
  const seededCount=(await db.query<{count: number}>('select count(*)::int as count from market.catalogue_price_outcomes')).rows[0].count;
  await assert.rejects(rpc('begin_catalogue_bulk_sweep',[null,null]),/invalid provider manifest/); await assert.rejects(rpc('store_catalogue_bulk_prices',[null]),/invalid price results/);
  const dataset = new Date(Date.now() - 3600_000).toISOString();
  const manifest = [{ categoryId:3,groupId:100,language:'en',name:'SWSH12: Silver Tempest',abbreviation:'SWSH12' },{ categoryId:85,groupId:100,language:'ja',name:'ストームエメラルダ' },{ categoryId:85,groupId:101,language:'ja',name:'Provider-only set' }];
  const run = (await rpc('begin_catalogue_bulk_sweep',[dataset,encode(manifest)]))[0]; assert.equal(run.totalGroups,3);
  assert.equal((await db.query<{count: number}>('select count(*)::int as count from market.catalogue_price_outcomes')).rows[0].count,seededCount,'begin is idempotent and does not re-enumerate publication outcomes');
  const first = (await rpc('claim_catalogue_bulk_sweep_group',[run.runId]))[0]; assert.equal(first.categoryId,3);
  assert.equal((await rpc('resolve_catalogue_bulk_set',[3,100,'en',manifest[0].name,'SWSH12']))[0].setId,id(10));
  assert.equal((await rpc('resolve_catalogue_bulk_set',[85,100,'ja',manifest[1].name,'']))[0].setId,id(11));
  assert.equal((await rpc('resolve_catalogue_bulk_set',[85,101,'ja',manifest[2].name,'']))[0].status,'unmapped');
  await assert.rejects(rpc('resolve_catalogue_bulk_set',[85,100,'en','Silver Tempest','']),/invalid provider language/);
  const result = (variantId: string, categoryId: number, subtype: string, price: number) => ({variantId,catalogueVersionId:id(1),reason:'priced',nextRetryAt:new Date(Date.now()+86400_000).toISOString(),mapping:{categoryId,groupId:100,productId:200,subtype,method:'exact_name_number'},quote:{categoryId,groupId:100,productId:200,subtype,price,currency:'USD',datasetAt:dataset,exchangeRate:0.75,exchangeRateAt:dataset,exchangeRateSource:'fixture-rate'}});
  const feed = (categoryId:number) => encode({success:true,results:[{categoryId,groupId:100,productId:200,name:categoryId===3?'Lugia VSTAR':'ピカチュウ',extendedData:[{name:'Number',value:categoryId===3?'139/195':'001/100'}]}]});
  await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload,dataset_at) values($1,$2::jsonb,$5),($3,$4::jsonb,$5)', ['tcgplayer/3/100/products',feed(3),'tcgplayer/85/100/products',feed(85),dataset]);
  assert.equal((await rpc('read_catalogue_bulk_feed',['tcgplayer/3/100/products']))[0].payload.results[0].productId,200);
  await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload,dataset_at) values($1,$2::jsonb,$5),($3,$4::jsonb,$5)', ['tcgplayer/3/100/prices',encode({success:true,results:[{productId:200,subTypeName:'Normal',marketPrice:20},{productId:200,subTypeName:'Reverse Holofoil',marketPrice:30}]}),'tcgplayer/85/100/prices',encode({success:true,results:[{productId:200,subTypeName:'Normal',marketPrice:40}]}),dataset]);
  await rpc('store_catalogue_bulk_prices',[encode([result(id(30),3,'Normal',20),result(id(31),3,'Reverse Holofoil',30),result(id(32),85,'Normal',40)])]);
  assert.equal((await db.query('select * from market.catalogue_provider_cards')).rows.length,3);
  await assert.rejects(rpc('store_catalogue_bulk_prices',[encode([result(id(30),3,'Normal',999)])]),/quote does not match stored provider build/);
  await rpc('store_catalogue_bulk_prices',[encode([{...result(id(30),3,'Normal',20),reason:'no_provider_quote',quote:null}])]);
  const remapped=(await rpc('catalogue_bulk_group_candidates',[3,100,null,500])).find((row:any)=>row.variant_id===id(30)); assert.equal(remapped.provider_mapping.product_id,200);
  await assert.rejects(rpc('store_catalogue_bulk_prices',[encode([result(id(32),3,'Normal',99)])]),/invalid provider mapping/);
  const priceRead=createCataloguePriceRead({supabase:{schema:(schema:string)=>{assert.equal(schema,'api');return {rpc:async(name:string,args:any)=>{
    if(name==='read_catalogue_prices') return {data:(await db.query('select * from api.read_catalogue_prices($1::text[],$2)',[args.p_references,args.p_language])).rows};
    if(name==='read_catalogue_printing_general_prices'||name==='read_pricing_classifications') return {data:null,error:{code:'PGRST202',message:'optional additive guide unavailable'}};
    assert.equal(name,'read_cardmarket_blended_general_prices'); return {data:(await db.query('select * from api.read_cardmarket_blended_general_prices($1::uuid[])',[args.p_printing_ids])).rows};
  }};}},toEstimatePrice:()=>null,toSnapshotPrice:()=>null,unavailablePrice:(variantId:string)=>({variantId,status:'unavailable',sample:{sold:0,active:0},estimates:{low:null,central:null,high:null}})});
  const reverse=await priceRead({references:[id(31)],language:'en',estimateMode:'general'}); assert.equal(reverse.prices[0].price.estimates.central,22.5); assert.equal(reverse.prices[0].price.sourceBreakdown[0].subtype,'Reverse Holofoil');
  assert.equal((await priceRead({references:[id(32)],language:'ja',estimateMode:'general'})).prices[0].price.estimates.central,30); assert.equal((await priceRead({references:[id(31)],language:'en',estimateMode:'exact'})).prices[0].price.estimates.central,null);
  const unsupported=(await priceRead({references:[id(33)],language:'ko',estimateMode:'general'})).prices[0]; assert.equal(unsupported.unavailableReason,'unsupported_provider_language');
  assert.equal((await rpc('finish_catalogue_bulk_sweep_group',[run.runId,3,100,first.leaseToken,'complete',encode({cards:3,priced:2}),0]))[0],true);
  const second=(await rpc('claim_catalogue_bulk_sweep_group',[run.runId]))[0]; await rpc('finish_catalogue_bulk_sweep_group',[run.runId,85,100,second.leaseToken,'complete',encode({cards:1,priced:1}),0]); const third=(await rpc('claim_catalogue_bulk_sweep_group',[run.runId]))[0]; await rpc('finish_catalogue_bulk_sweep_group',[run.runId,85,101,third.leaseToken,'unmapped','{}',0]);
  // Finalisation must not depend on the rich presentation view.  A provider
  // product without an exact card mapping becomes a durable repair in one
  // set-based write, while a failed leased group records bounded backoff
  // outcomes from the physical publication relations.
  await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [encode({success:true,results:[{categoryId:3,groupId:100,productId:200,name:'Lugia VSTAR',extendedData:[{name:'Number',value:'139/195'}]},{categoryId:3,groupId:100,productId:201,name:'Unmapped provider product',extendedData:[{name:'Number',value:'140/195'}]}]}),'tcgplayer/3/100/products']);
  await db.exec('revoke select on api.catalogue_cards from service_role');
  const finishDataset = new Date(Date.now()-30_000).toISOString();
  const finishRun=(await rpc('begin_catalogue_bulk_sweep',[finishDataset,encode([manifest[0]])]))[0];
  const finishComplete=(await rpc('claim_catalogue_bulk_sweep_group',[finishRun.runId]))[0];
  assert.equal((await rpc('finish_catalogue_bulk_sweep_group',[finishRun.runId,3,100,finishComplete.leaseToken,'complete',encode({cards:0,priced:0}),0]))[0],true);
  assert.equal((await db.query<any>("select reason from market.catalogue_price_repairs where repair_key='product:3:201'")).rows[0].reason,'unmapped_provider_product');
  const failedDataset = new Date(Date.now()-20_000).toISOString();
  const failedRun=(await rpc('begin_catalogue_bulk_sweep',[failedDataset,encode([manifest[0]])]))[0];
  const failedGroup=(await rpc('claim_catalogue_bulk_sweep_group',[failedRun.runId]))[0];
  assert.equal((await rpc('finish_catalogue_bulk_sweep_group',[failedRun.runId,3,100,failedGroup.leaseToken,'failed',encode({error:'fixture timeout'}),600]))[0],true);
  assert.equal((await db.query<any>('select reason from market.catalogue_price_outcomes where variant_id=$1',[id(30)])).rows[0].reason,'provider_backoff');
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc('finish_catalogue_bulk_sweep_group',[failedRun.runId,3,100,failedGroup.leaseToken,'complete',encode({}),0]),/permission denied/);
  await db.exec('reset role; set role service_role');
  const coverage=(await rpc('catalogue_bulk_price_coverage',[run.runId]))[0]; assert.equal(coverage.runStatus,'needs_mapping'); assert.ok(coverage.openRepairs>=2); assert.equal(coverage.cards.reduce((total:number,row:any)=>total+row.total,0),5);
  const health=(await rpc('catalogue_bulk_sweep_health',[run.runId]))[0]; assert.equal(health.runStatus,'needs_mapping'); assert.equal(health.outcomes.total,5); assert.equal(health.quotes.reduce((n:number,row:any)=>n+row.total,0),3);
  const repairsPage=await rpc('list_catalogue_price_repairs',[null,1]); assert.equal(repairsPage.length,1); const nextRepairsPage=await rpc('list_catalogue_price_repairs',[repairsPage[0].repair_key,1]); assert.ok(nextRepairsPage.length<=1); assert.notEqual(nextRepairsPage[0]?.repair_key,repairsPage[0].repair_key); await assert.rejects(rpc('list_catalogue_price_repairs',[null,101]),/invalid repair page/);
  await db.exec('reset role; set role anon'); await assert.rejects(rpc('list_catalogue_price_repairs',[null,1]),/permission denied/); await db.exec('reset role; set role service_role');
  const products={success:true,results:[{categoryId:3,groupId:100,productId:201,name:'Reviewed provider alias',extendedData:[{name:'Number',value:'139/195'}]}]}; await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload) values($1,$2::jsonb),($3,$4::jsonb) on conflict(feed_key) do update set payload=excluded.payload',['tcgplayer/3/groups',encode({success:true,results:[manifest[0]]}),'tcgplayer/3/100/products',encode(products)]);
  const repair={categoryId:3,groupId:100,setId:id(10),variantId:id(30),productId:201,subtype:'Normal',note:'Reviewed same number and artwork alias'}; assert.equal(validateMappingRepairs([repair]).length,1); assert.throws(()=>validateMappingRepairs([{...repair,subtype:'graded'}])); await assert.rejects(mainCataloguePriceGuide([]),/Use --repair/);
  assert.equal(validateMappingRepairs([repair,{...repair,setId:id(11),variantId:id(31),productId:202,note:'Reviewed multi-set promo product'}]).length,2, 'one provider promo group may span canonical sets when variants/products are distinct');
  assert.throws(() => validateMappingRepairs([repair,{...repair,productId:202,note:'Conflicting provider card review'}]), /multiple provider products/);
  assert.throws(() => validateMappingRepairs([repair,{...repair,groupId:101,setId:id(11),variantId:id(31),note:'Same provider product across a different group'}]), /multiple canonical variants/);
  assert.throws(() => validateMappingRepairs([repair,{...repair,setId:id(11),note:'Same variant supplied under a different set'}]), /canonical sets/);
  await rpc('review_catalogue_bulk_mapping',[encode(repair)]); assert.equal((await db.query('select * from market.catalogue_general_prices where variant_id=$1',[id(30)])).rows.length,0); assert.equal((await db.query<any>('select * from market.catalogue_provider_cards where variant_id=$1',[id(30)])).rows[0].method,'reviewed');
  const newBuild=new Date(Date.now()-60_000).toISOString(); await db.query('update market.catalogue_bulk_feeds set fetched_at=now(),dataset_at=$1 where feed_key=$2',[dataset,'tcgplayer/3/100/prices']); const token=(await rpc('claim_catalogue_bulk_feed_revision',['tcgplayer/3/100/prices',newBuild]))[0]; assert.ok(token); assert.equal((await rpc('finish_catalogue_bulk_feed',['tcgplayer/3/100/prices',token,newBuild,encode({success:true,results:[]}),0]))[0],true); assert.equal((await rpc('claim_catalogue_bulk_feed_revision',['tcgplayer/3/100/prices',newBuild]))[0],null);
  console.log('Full catalogue price guide passed: migrations/RLS, EN/JA/finish maps, identity rejection, resume, coverage, review audit and mapped reverse reads.');
} finally { await db.close(); } }
void main().catch((error)=>{console.error(error);process.exitCode=1;});
