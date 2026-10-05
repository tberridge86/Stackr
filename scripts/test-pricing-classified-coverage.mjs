import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql = readFileSync(new URL('../supabase/migrations/20261005162643_classified_pricing_coverage.sql', import.meta.url),'utf8');
const at = '2026-10-01T00:00:00Z';
let checks = 0;
async function resolve(identity, evidence) {
 return (await db.query('select api.resolve_pricing_classification($1,$2) result',[JSON.stringify(identity),JSON.stringify(evidence)])).rows[0].result;
}
const identity = {variant_id:id(4),printing_id:id(3),set_id:id(2),catalogue_version_id:id(1),language_code:'en',variant_code:'normal',finish_code:'normal',rarity_code:'common',physical_valid:true};
const evidence = (value, scope='exact_variant_market', overrides={}) => ({...identity,language:'en',finish:'normal',currency:'GBP',value,scope,provider:'tcgcsv',source_at:at,retrieved_at:at,stale_after:'2026-10-02T00:00:00Z',...overrides});
async function expect(identity, evidence, tier, value) {
 const result = await resolve(identity,evidence);
 assert.equal(result.classification,tier); assert.equal(result.value,value); checks++; return result;
}
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema catalog; create schema market; create schema api;
 create table catalog.catalogue_versions(id uuid primary key,language_code text,status text,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz);
 create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz);
 create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,rarity_id uuid,deprecated_at timestamptz);
 create table catalog.sets(id uuid primary key,language_code text,deprecated_at timestamptz);
 create table catalog.rarities(id uuid primary key,code text);
 create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text);
 create table market.catalogue_price_outcomes(variant_id uuid,catalogue_version_id uuid,reason text);
 create table market.catalogue_general_prices(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,
 provider text,product_id bigint,group_id bigint,category_id int,subtype text,central_estimate numeric,original_price numeric,dataset_at timestamptz,recorded_at timestamptz,stale_after timestamptz);
 create table market.catalogue_provider_cards(variant_id uuid,printing_id uuid,set_id uuid,language_code text,product_id bigint,group_id bigint,category_id int,subtype text);
 create table market.catalogue_printing_general_prices(printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,central_estimate numeric,original_price numeric,dataset_at timestamptz,recorded_at timestamptz,stale_after timestamptz);
 create table market.cardmarket_blended_general_prices(printing_id uuid,catalogue_version_id uuid,central_estimate_gbp numeric,original_price numeric,source_created_at timestamptz,recorded_at timestamptz,stale_after timestamptz);
 create table market.cardmarket_printing_mappings(printing_id uuid,catalogue_version_id uuid);
 create function api.catalogue_provider_subtype(text,text) returns text language sql immutable as $$select case when $1='normal' and $2='normal' then 'Normal' when $1='holo' and $2='holo' then 'Holofoil' when $1='reverse_holo' and $2='reverse_holo' then 'Reverse Holofoil' end$$;
 grant usage on schema catalog,market,api to service_role; grant select on all tables in schema catalog,market to service_role; grant execute on all functions in schema api to service_role;`);
 await db.exec(`begin;${sql}commit;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261005163008_bound_classification_evidence_aggregation.sql', import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261005163402_classification_page_custom_plans.sql', import.meta.url),'utf8'));
 for (const [signal,rounded] of [[0.06,0.1],[0.13,0.1],[0.17,0.2],[0.24,0.2],[0.27,0.3],[1.99,2]]) await expect(identity,[evidence(signal)],'ESTIMATED_VALUE',rounded);
 for (const value of [2,20,50,100,500,1000]) {
  const result=await expect(identity,[evidence(value)],'MARKET_GUIDE',value);
  assert.equal(result.exact,false);assert.equal(result.condition,'raw_market_unspecified');
  if(value>=20) await expect(identity,[evidence(value,'printing_market')],'PRICE_UNAVAILABLE',null);
 }
 for (const language of ['en','ja','zh-cn','zh-tw']) await expect({...identity,language_code:language},[evidence(2,'exact_variant_market',{language})],'MARKET_GUIDE',2);
 for (const finish of ['holo','reverse_holo']) await expect({...identity,variant_code:finish,finish_code:finish},[evidence(5,'exact_variant_market',{finish,variant_code:finish})],'MARKET_GUIDE',5);
 await expect(identity,[evidence(500,'exact_variant_market',{language:'ja'})],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(500,'exact_variant_market',{finish:'holo',variant_code:'holo'})],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(500,'exact_variant_market',{printing_id:id(80)})],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(500,'graded')],'PRICE_UNAVAILABLE',null);
 for(const variant_code of ['first_edition','promo','cosmos_holo','special']) await expect({...identity,variant_code},[evidence(0.1,'printing_market')],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(0.1,'blended_printing_market',{language:null,finish:null})],'ESTIMATED_VALUE',0.1);
 await expect({...identity,rarity_code:'secret_rare'},[evidence(0.1,'blended_printing_market',{language:null,finish:null})],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(0.1,'blended_printing_market'),evidence(500,'printing_market')],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(0),evidence(-1)],'PRICE_UNAVAILABLE',null);
 await expect({...identity,physical_valid:false},[evidence(500)],'PRICE_UNAVAILABLE',null);
 await expect(identity,[],'PRICE_UNAVAILABLE',null);
 await expect(identity,[evidence(5,'exact_variant_market',{source_at:'2026-10-02T00:00:00Z'})],'PRICE_UNAVAILABLE',null);
 // Direct variant evidence wins over a cheaper printing guide, including stale
 // direct evidence. Provider failure must not turn another finish into an exact quote.
 await expect(identity,[evidence(50),evidence(0.1,'printing_market')],'MARKET_GUIDE',50);
 await db.exec(`insert into catalog.catalogue_versions values('${id(1)}','en','published',null,now(),now());
 insert into catalog.rarities values('${id(9)}','common'); insert into catalog.sets values('${id(2)}','en',null);
 insert into catalog.card_printings values('${id(3)}','${id(2)}','en','${id(9)}',null);
 insert into catalog.card_variants values('${id(4)}','${id(3)}','en','normal','normal',null),('${id(5)}','${id(3)}','en','reverse_holo','reverse_holo',null);
 insert into catalog.catalogue_version_variants values('${id(1)}','${id(4)}','${id(3)}','${id(2)}','en'),('${id(1)}','${id(5)}','${id(3)}','${id(2)}','en');
 insert into market.catalogue_general_prices values('${id(4)}','${id(3)}','${id(2)}','en','${id(1)}','tcgcsv',100,200,3,'Normal',0.17,0.2,'${at}','${at}','2026-10-02T00:00:00Z');
 insert into market.catalogue_provider_cards values('${id(4)}','${id(3)}','${id(2)}','en',100,200,3,'Normal');`);
 await db.exec('set role service_role');
 const batch=(await db.query('select api.store_pricing_classification_page(null,1) result')).rows[0].result;
 assert.equal(batch.processed,1);assert.equal(batch.changed,1);assert.equal(batch.nextAfter,id(4));
 await db.query('select api.store_pricing_classification_page($1,100)',[batch.nextAfter]);
 const coverage=(await db.query('select api.pricing_classified_coverage() result')).rows[0].result;
 assert.equal(coverage.classifiedCoveragePercent,100);assert.equal(coverage.totalPublishedVariants,2);
 assert.equal(coverage.estimatedValue,2);
 const rows=(await db.query('select * from api.read_pricing_classifications($1)',[[id(4),id(5)]])).rows;
 assert.equal(rows[0].resolution.freshness,'stale'); assert.equal(rows[1].resolution.finishMatch,false);
 await db.query('select api.store_pricing_classification_page(null,100)');
 assert.equal((await db.query('select count(*) n from market.pricing_classification_history')).rows[0].n,2,'outage/repeat retains value without duplicate history');
 await db.exec('reset role');
 await db.exec(`insert into catalog.card_variants values('${id(6)}','${id(3)}','en','special','unsupported',null);
 insert into catalog.catalogue_version_variants values('${id(1)}','${id(6)}','${id(3)}','${id(2)}','en');`);
 assert.equal((await db.query('select api.pricing_classified_coverage() result')).rows[0].result.classifiedCoveragePercent,66.67,'new publication is honestly unprocessed');
 await db.query('select api.store_pricing_classification_page(null,100)');
 assert.equal((await db.query('select api.pricing_classified_coverage() result')).rows[0].result.classifiedCoveragePercent,100);
 await db.exec('set role anon');
 await assert.rejects(db.query('select api.pricing_classified_coverage()'),/permission denied/);
 await assert.rejects(db.query('select * from market.pricing_classifications'),/permission denied/);
 console.log(JSON.stringify({ok:true,policyCases:checks,persistence:true,bulkRead:true,history:true,staleOutage:true,newlyPublished:true,private:true}));
} finally {await db.close();}
