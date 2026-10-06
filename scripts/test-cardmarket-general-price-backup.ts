import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const db=new PGlite(); const sql=(x:unknown)=>JSON.stringify(x);
async function rpc(name:string,args:unknown[]=[]){const p=args.map((_,i)=>`$${i+1}`).join(','); return (await db.query<any>(`select api.${name}(${p}) result`,args)).rows.map(x=>x.result);}
async function main(){try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema api; create schema catalog; create schema market; create table catalog.catalogue_versions(id uuid primary key); create table catalog.card_printings(id uuid primary key); insert into catalog.catalogue_versions values('${id(1)}'); insert into catalog.card_printings values('${id(2)}'); grant usage on schema api,catalog,market to service_role; grant select on all tables in schema catalog to service_role;`);
 await db.exec(`begin; ${readFileSync('supabase/migrations/20261003225832_cardmarket_general_price_backup.sql','utf8')} commit;`);
 await db.exec('set role anon'); await assert.rejects(rpc('claim_cardmarket_public_feed',['products']),/permission denied/); await assert.rejects(rpc('read_cardmarket_blended_general_prices',[[id(2)]]),/permission denied/); await db.exec('reset role; set role service_role');
 await assert.rejects(rpc('claim_cardmarket_public_feed',['bad']),/invalid/);
 const productToken=(await rpc('claim_cardmarket_public_feed',['products']))[0]; const guideToken=(await rpc('claim_cardmarket_public_feed',['price_guide']))[0]; assert.ok(productToken&&guideToken);
 const created=new Date(Date.now()-3_600_000).toISOString(); const sha='a'.repeat(64); const products=(await rpc('finish_cardmarket_public_feed',['products',productToken,created,'"p"',sha,100,'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json',0]))[0]; const guide=(await rpc('finish_cardmarket_public_feed',['price_guide',guideToken,created,'"g"','b'.repeat(64),100,'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',0]))[0]; assert.ok(products&&guide); assert.equal((await rpc('claim_cardmarket_public_feed',['products']))[0],null,'daily lease prevents an extra feed request');
 const mapping={printingId:id(2),catalogueVersionId:id(1),providerCategoryId:51,providerProductId:99,method:'reviewed_exact',languageEvidence:{reference:'language-review'},variantEvidence:{reference:'variant-review'},finishEvidence:{reference:'finish-review'},reviewReference:'CARDMARKET-REVIEW-001'};
 assert.equal((await rpc('review_cardmarket_printing_mapping',[sql(mapping)]))[0],true); await assert.rejects(rpc('review_cardmarket_printing_mapping',[sql({...mapping,variantId:id(9)})]),/invalid/);
 const stored = await rpc('store_cardmarket_blended_general_prices', [guide, products, sql([{ printingId: id(2), catalogueVersionId: id(1), providerCategoryId: 51, providerProductId: 99, price: 12.34, selectedField: 'trend', exchangeRate: 0.85033, exchangeRateAt: new Date(Date.now()-3_600_000).toISOString(), exchangeRateSource: 'fixture-ECB' }])]);
 assert.equal(stored[0], 1);
const row=(await db.query<any>(`select * from api.read_cardmarket_blended_general_prices(array['${id(2)}']::uuid[])`)).rows[0]; assert.equal(row.quote.priceScope,'blended_general_estimate'); assert.equal(row.quote.currency,'GBP'); assert.equal(row.quote.originalCurrency,'EUR'); assert.equal(row.quote.exchangeRateSource,'fixture-ECB'); assert.equal(row.quote.language,null); assert.equal(row.quote.usableForExactVariant,false); assert.equal(row.quote.usableForHoldingsValuation,false);
 await assert.rejects(rpc('store_cardmarket_blended_general_prices', [guide, products, sql([{ printingId: id(2), catalogueVersionId: id(1), providerCategoryId: 51, providerProductId: 99, price: 12, selectedField: 'low', exchangeRate: 0.85033, exchangeRateAt: new Date(Date.now()-3_600_000).toISOString(), exchangeRateSource: 'fixture-ECB' }])]), /invalid/);
await assert.rejects(rpc('store_cardmarket_blended_general_prices', [guide, products, sql([{ printingId: id(2), catalogueVersionId: id(1), providerCategoryId: 51, providerProductId: 99, price: 12, selectedField: 'trend', exchangeRate: 0.85033, exchangeRateAt: new Date(Date.now()+60_000).toISOString(), exchangeRateSource: 'fixture-ECB' }])]), /FX evidence/);
 await rpc('review_cardmarket_printing_mapping',[sql({...mapping,providerProductId:100,reviewReference:'CARDMARKET-REVIEW-002'})]);
 assert.equal((await db.query('select * from market.cardmarket_blended_general_prices')).rows.length,0,'a mapping change invalidates its old blended quote');
 assert.equal((await db.query('select * from market.cardmarket_mapping_reviews')).rows.length,2,'mapping changes append audit records');
 await assert.rejects(db.query('update market.cardmarket_mapping_reviews set action=$1',['removed']),/permission denied/);
 console.log('Cardmarket backup migration passed: service-only feed leases, reviewed printing maps, EUR/GBP FX provenance, and exact/holdings exclusion.');
} finally {await db.close();}}
void main().catch(error=>{console.error(error);process.exitCode=1;});
