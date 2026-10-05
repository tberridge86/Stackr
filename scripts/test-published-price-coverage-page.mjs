import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {buildPublishedPriceCoveragePageSql,validatePublishedPriceCoveragePage,summarisePublishedPriceCoverage,ZERO_VARIANT_CURSOR} from './lib/published-price-coverage-page.mjs';
const db=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const version=id(90),set=id(91),observedAt='2026-10-05T23:19:16Z';
try {
 await db.exec(`
 create schema catalog;create schema market;create schema api;
 create table catalog.catalogue_versions(id uuid,status text,deprecated_at timestamptz,language_code text);
 create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text,primary key(catalogue_version_id,variant_id));
 create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,deprecated_at timestamptz);
 create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,deprecated_at timestamptz);
 create table catalog.sets(id uuid primary key,language_code text,deprecated_at timestamptz);
 create table catalog.languages(code text primary key);
 create table market.catalogue_general_prices(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,original_price numeric,central_estimate numeric,stale_after timestamptz,provider text,dataset_at timestamptz);
 create table market.cardmarket_blended_general_prices(printing_id uuid,catalogue_version_id uuid,original_price numeric,central_estimate_gbp numeric,stale_after timestamptz,source_created_at timestamptz);
 create table market.cardmarket_printing_mappings(printing_id uuid,catalogue_version_id uuid);
 create table market.catalogue_printing_general_prices(printing_id uuid,original_price numeric,central_estimate numeric,stale_after timestamptz);
 create function api.read_catalogue_printing_general_prices(ids uuid[]) returns table(printing_id uuid,quote jsonb) language sql as $fn$
 select g.printing_id,jsonb_build_object('centralEstimate',g.central_estimate,'originalPrice',g.original_price,'staleAfter',g.stale_after,'sourceCreatedAt','2026-10-05T20:05:57Z')
 from market.catalogue_printing_general_prices g where g.printing_id=any(ids);$fn$;
 insert into catalog.languages values('en'),('ja');
 insert into catalog.catalogue_versions values('${version}','published',null,'en');
 insert into catalog.sets values('${set}','en',null);
 `);
 for(let n=1;n<=7;n++) await db.exec(`
 insert into catalog.catalogue_version_variants values('${version}','${id(n)}','${id(n+10)}','${set}','en');
 insert into catalog.card_variants values('${id(n)}','${id(n+10)}','${n===4?'ja':'en'}',null);
 insert into catalog.card_printings values('${id(n+10)}','${set}','en',null);
 `);
 for(const [n,amount,expiry] of [[1,10,'2026-10-07'],[2,0,'2026-10-07'],[3,20,'2026-10-04'],[4,20,'2026-10-07']])
 await db.exec(`insert into market.catalogue_general_prices values('${id(n)}','${id(n+10)}','${set}','en','${version}',${amount},${amount},'${expiry}','tcgcsv','2026-10-05');`);
 for(const [n,amount] of [[1,6],[5,8],[6,0]])await db.exec(`
 insert into market.cardmarket_blended_general_prices values('${id(n+10)}','${version}',${amount},${amount},'2026-10-07','2026-10-05');
 insert into market.cardmarket_printing_mappings values('${id(n+10)}','${version}');`);
 await db.exec(`insert into market.catalogue_printing_general_prices values('${id(12)}',7,7,'2026-10-07');`);
 const checkpoint={observation:observedAt,pages:{en:[]}};
 let cursor=ZERO_VARIANT_CURSOR;
 while(true){
 const input={language:'en',version,cursor,observedAt,pageSize:2};
 const result=await db.exec(buildPublishedPriceCoveragePageSql(input));
 const page=validatePublishedPriceCoveragePage(result.at(-1).rows[0],input);
 checkpoint.pages.en.push(page);
 if(page.scanned<2)break;
 cursor=page.next_cursor;
 }
 const summary=summarisePublishedPriceCoverage(checkpoint),en=summary.rows[0];
 assert.equal(en.scanned,7);assert.equal(en.physical,6);
 assert.equal(en.invalidPhysicalMemberships,1);
 assert.equal(en.positiveStoredVariants,3,'overlapping providers counted once; zero and expired quotes excluded');
 assert.equal(en.additionalPrintingGuideVariants,1);
 assert.equal(en.positiveVariantQuotes,1);assert.equal(en.positiveCardmarketVariants,2);
 assert.equal(en.complete,true);assert.equal(summary.complete,false);assert.equal(summary.wholeCataloguePercent,null);
 const page=checkpoint.pages.en[0],input={language:'en',version,cursor:ZERO_VARIANT_CURSOR,pageSize:2};
 assert.throws(()=>validatePublishedPriceCoveragePage({...page,current_catalogue_version_id:id(99)},input),/publication_drift/);
 assert.throws(()=>validatePublishedPriceCoveragePage({...page,printing_guide_candidates:101},input),/batch_too_large/);
 assert.throws(()=>validatePublishedPriceCoveragePage({...page,positive_deduplicated_stored_variants:3},input),/invalid_coverage_counts/);
 const corrupt=structuredClone(checkpoint);corrupt.pages.en[1].cursor=ZERO_VARIANT_CURSOR;
 assert.throws(()=>summarisePublishedPriceCoverage(corrupt),/gap_or_overlap/);
 assert.throws(()=>buildPublishedPriceCoveragePageSql({...input,observedAt,version:"';select 1;--"}),/unsafe page/);
 console.log('Published-price coverage keyset, native identity, expiry, zero, overlap and checkpoint controls passed.');
} finally {await db.close();}

