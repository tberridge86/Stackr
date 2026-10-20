import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rpc=async(name,args=[])=> (await db.query(`select api.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args)).rows[0].value;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema api;create schema catalog;create schema market;
  create table catalog.card_printings(id uuid primary key);create table catalog.catalogue_versions(id uuid primary key);
  insert into catalog.card_printings values('${id(1)}');insert into catalog.catalogue_versions values('${id(2)}');
  grant usage on schema api,catalog,market to service_role,anon;`);
  for(const file of ['20261003225832_cardmarket_general_price_backup.sql','20261004094846_cardmarket_daily_revision_resume.sql','20261004102720_cardmarket_source_revision_lease.sql']) await db.exec(`begin;${readFileSync(`supabase/migrations/${file}`,'utf8')}commit;`);
  await db.exec('set role service_role');
  const revisions={};
  for(const [kind,sha,url] of [['products','a'.repeat(64),'productList/products_singles_6.json'],['price_guide','b'.repeat(64),'priceGuide/price_guide_6.json']]) {
    const token=await rpc('claim_cardmarket_public_feed',[kind]);assert.ok(token);
    revisions[kind]=await rpc('finish_cardmarket_public_feed',[kind,token,new Date(Date.now()-3600000).toISOString(),'etag',sha,100,`https://downloads.s3.cardmarket.com/productCatalog/${url}`,0]);
    assert.equal(await rpc('read_cardmarket_retained_feed_revision',[kind,sha]),revisions[kind]);
    assert.equal(await rpc('claim_cardmarket_public_feed',[kind]),null);
  }
  const mapping={printingId:id(1),catalogueVersionId:id(2),providerCategoryId:51,providerProductId:1,method:'reviewed_exact',languageEvidence:{languageCode:'en'},variantEvidence:{reviewed:true},finishEvidence:{scope:'blended'},reviewReference:'root-fixture-reviewed'};
  assert.equal(await rpc('review_cardmarket_printing_mapping',[JSON.stringify(mapping)]),true);
  const quote={printingId:id(1),catalogueVersionId:id(2),providerCategoryId:51,providerProductId:1,selectedField:'trend',price:12,exchangeRate:0.85,exchangeRateAt:new Date(Date.now()-60000).toISOString(),exchangeRateSource:'ECB fixture'};
  assert.equal(await rpc('store_cardmarket_blended_general_prices',[revisions.price_guide,revisions.products,JSON.stringify([quote])]),1);
  await rpc('review_cardmarket_printing_mapping',[JSON.stringify(mapping)]);
  assert.equal((await db.query('select * from market.cardmarket_blended_general_prices')).rows.length,1,'an identical review preserves the last valid quote');
  assert.equal((await db.query('select * from market.cardmarket_mapping_reviews')).rows.length,1,'an identical review adds no replacement audit');
  await rpc('review_cardmarket_printing_mapping',[JSON.stringify({...mapping,reviewReference:'root-new-reviewed-evidence'})]);
  assert.equal((await db.query('select * from market.cardmarket_blended_general_prices')).rows.length,0,'changed evidence still invalidates the prior quote');
  await db.exec("update market.cardmarket_public_feed_leases set last_succeeded_at=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - interval '1 second',lease_until=null where feed_kind='products'");
  assert.ok(await rpc('claim_cardmarket_public_feed',['products']),'a new UTC day does not wait another rolling 24 hours');
  await db.query("update market.cardmarket_public_feed_leases set lease_token=null,lease_until=null,retry_after=null where feed_kind='products'");
  const newer=new Date(Date.now()-30*60_000).toISOString();
  assert.ok(await rpc('claim_cardmarket_source_revision',['products',newer,'c'.repeat(64)]),'newer provider source may supersede an older source retrieved today');
  await db.query("update market.cardmarket_public_feed_leases set lease_token=null,lease_until=null where feed_kind='products'");
  assert.equal(await rpc('claim_cardmarket_source_revision',['products',new Date(Date.now()-2*3600_000).toISOString(),'d'.repeat(64)]),null,'older source is rejected');
  await db.exec('reset role;set role anon');
  await assert.rejects(rpc('read_cardmarket_retained_feed_revision',['products','a'.repeat(64)]),/permission denied/);
  console.log('Cardmarket daily revisions passed: restart reuse, UTC-day leases, idempotent reviews preserve prices, changed reviews invalidate, service-only ACL.');
}finally{await db.close();}
