import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite(); const json = JSON.stringify;
async function rpc(name: string, args: unknown[] = []) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
  return (await db.query<any>(`select api.${name}(${placeholders}) result`, args)).rows.map(row => row.result);
}

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.catalogue_versions(id uuid primary key, status text not null default 'published', deprecated_at timestamptz);
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id));
      create table catalog.sets(id uuid primary key, deprecated_at timestamptz); create table catalog.languages(code text primary key);
      create table catalog.card_printings(id uuid primary key,collector_number text,language_code text,set_id uuid,deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz,is_default boolean);
      create table api.catalogue_cards(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,variant_code text,finish_code text,catalogue_version_id uuid,collector_number text,card_english_display_name text,card_native_name text);
      create table api.catalogue_sets(set_id uuid,language_code text,set_code text,native_name text,english_display_name text);
      create table catalog.catalogue_version_external_identifiers(external_id text,language_code text,catalogue_version_id uuid,printing_id uuid,variant_id uuid);
      create view api.catalogue_external_identifiers as select * from catalog.catalogue_version_external_identifiers;
      create table api.market_price_estimates(variant_id uuid,product_kind text,display_currency_code text,condition_code text,language_code text,grader_code text,grade_value numeric,fallback_identity_key text,calculated_at timestamptz,price_estimate_id uuid);
      create table public.market_price_snapshots(id bigint,card_id text,language text,calculated_at timestamptz,user_id uuid,pricing_identity_json jsonb,set_id text);
      insert into catalog.catalogue_versions values('${id(1)}','published',null); insert into catalog.languages values('en'),('ja'),('ko'),('zh-cn'),('zh-tw');
      insert into catalog.sets values('${id(10)}',null),('${id(11)}',null),('${id(12)}',null),('${id(13)}',null),('${id(14)}',null);
      insert into api.catalogue_sets values
        ('${id(10)}','ja','sv1a','Japanese native A','Deliberately unrelated English'),
        ('${id(11)}','ja','sv2','Japanese native B','English name that must not decide identity'),
        ('${id(12)}','ja','sv2','Japanese native C','Another English name'),
        ('${id(13)}','en','sv1a','English set','English set'),
        ('${id(14)}','ja','sv3','Japanese native duplicate','Not identity evidence');
      insert into catalog.card_printings values
        ('${id(20)}','001/078','ja','${id(10)}',null),
        ('${id(21)}','002/078','ja','${id(10)}',null),
        ('${id(22)}','002/078','ja','${id(10)}',null),
        ('${id(23)}','003/078','ja','${id(10)}',null),
        ('${id(24)}','','ja','${id(10)}',null),
        ('${id(25)}','001/100','en','${id(13)}',null);
      insert into catalog.card_variants values
        ('${id(30)}','${id(20)}','ja','normal','normal',null,true),('${id(31)}','${id(21)}','ja','normal','normal',null,true),('${id(32)}','${id(22)}','ja','normal','normal',null,true),('${id(33)}','${id(23)}','ja','normal','normal',null,true),('${id(34)}','${id(24)}','ja','normal','normal',null,true),('${id(35)}','${id(25)}','en','normal','normal',null,true);
      insert into catalog.catalogue_version_variants values
        ('${id(1)}','${id(30)}'),('${id(1)}','${id(31)}'),('${id(1)}','${id(32)}'),('${id(1)}','${id(33)}'),('${id(1)}','${id(34)}'),('${id(1)}','${id(35)}');
      insert into api.catalogue_cards values
        ('${id(30)}','${id(20)}','${id(10)}','ja','normal','normal','${id(1)}','001/078',null,'Japanese native A'),
        ('${id(31)}','${id(21)}','${id(10)}','ja','normal','normal','${id(1)}','002/078',null,'Different native B'),
        ('${id(32)}','${id(22)}','${id(10)}','ja','normal','normal','${id(1)}','002/078',null,'Different native C'),
        ('${id(33)}','${id(23)}','${id(10)}','ja','normal','normal','${id(1)}','003/078',null,'Different native D'),
        ('${id(34)}','${id(24)}','${id(10)}','ja','normal','normal','${id(1)}','',null,'Blank number'),
        ('${id(35)}','${id(25)}','${id(13)}','en','normal','normal','${id(1)}','001/100','English card',null);
      grant usage on schema api,catalog,market,public to service_role;
      grant select on all tables in schema api,catalog,public to service_role;
    `);
    for (const file of [
      '20261003224016_catalogue_price_bulk_cache.sql', '20261003224031_restore_full_catalogue_price_guide.sql',
      '20261003224558_catalogue_price_feed_access_indexes.sql', '20261003225316_catalogue_price_repair_reads.sql',
      '20261003225832_cardmarket_general_price_backup.sql', '20261003231006_batch_catalogue_price_identity_reads.sql',
      '20261003232812_japanese_exact_price_identities.sql',
      '20261003234257_bounded_published_price_read.sql',
      '20261003234442_cover_general_price_foreign_keys.sql',
    ]) await db.exec(`begin; ${readFileSync(`supabase/migrations/${file}`, 'utf8')} commit;`);

    await db.exec('set role anon');
    await assert.rejects(rpc('resolve_catalogue_bulk_set',[85,100,'ja','Japanese native A','sv1a']),/permission denied/);
    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([])]),/permission denied/);
    await db.exec('reset role; set role service_role');

    const dataset = new Date(Date.now() - 3_600_000).toISOString();
    const groups = { success:true, results:[
      { categoryId:85,groupId:100,name:'Provider Japanese text unrelated',abbreviation:'SV1A' },
      { categoryId:85,groupId:101,name:'English name that must not decide identity',abbreviation:'SV2' },
      { categoryId:85,groupId:102,name:'Other provider duplicate code',abbreviation:'SV2' },
    ] };
    const products = { success:true, results:[
      { categoryId:85,groupId:100,productId:500,name:'No English or native-name match',extendedData:[{name:'Number',value:'001/078'}] },
      { categoryId:85,groupId:100,productId:501,name:'Duplicate provider one',extendedData:[{name:'Number',value:'003/078'}] },
      { categoryId:85,groupId:100,productId:502,name:'Duplicate provider two',extendedData:[{name:'Number',value:'003/078'}] },
      { categoryId:85,groupId:100,productId:503,name:'Blank number provider',extendedData:[{name:'Number',value:''}] },
      { categoryId:85,groupId:100,productId:504,name:'Duplicate canonical number',extendedData:[{name:'Number',value:'002/078'}] },
    ] };
    const prices = { success:true, results:[{productId:500,subTypeName:'Normal',marketPrice:100}] };
    await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload,dataset_at) values($1,$2::jsonb,$3),($4,$5::jsonb,$3),($6,$7::jsonb,$3)', [
      'tcgplayer/85/groups',json(groups),dataset,'tcgplayer/85/100/products',json(products),'tcgplayer/85/100/prices',json(prices),
    ]);

    const run = (await rpc('begin_catalogue_bulk_sweep',[dataset,json([
      { categoryId:85,groupId:100,language:'ja',name:'Provider Japanese text unrelated',abbreviation:'SV1A' },
      { categoryId:85,groupId:101,language:'ja',name:'English name that must not decide identity',abbreviation:'SV2' },
      { categoryId:85,groupId:102,language:'ja',name:'Other provider duplicate code',abbreviation:'SV2' },
    ])]))[0];
    await db.query("update market.catalogue_bulk_groups set status='unmapped' where run_id=$1 and category_id=85 and group_id in (100,101)",[run.runId]);
    await db.query("update market.catalogue_bulk_groups set status='running',lease_until=now()+interval '5 minutes' where run_id=$1 and category_id=85 and group_id=102",[run.runId]);
    const exactSet = (await rpc('resolve_catalogue_bulk_set',[85,100,'ja','Provider Japanese text unrelated','SV1A']))[0];
    assert.equal(exactSet.status,'mapped'); assert.equal(exactSet.setId,id(10)); assert.equal(exactSet.source,'exact_set_code');
    const ambiguous = (await rpc('resolve_catalogue_bulk_set',[85,101,'ja','English name that must not decide identity','SV2']))[0];
    assert.equal(ambiguous.status,'ambiguous','duplicate published/provider codes block name fallback');
    assert.equal((await db.query("select method from market.catalogue_provider_sets where category_id=85 and group_id=101")).rows.length,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('requeue_japanese_exact_code_groups',[run.runId]),/permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await rpc('requeue_japanese_exact_code_groups',[run.runId]))[0],1,'only the unique exact-code unmapped group is requeued');
    const requeueStates = await db.query<any>('select group_id,status from market.catalogue_bulk_groups where run_id=$1 and category_id=85 order by group_id',[run.runId]);
    assert.deepEqual(requeueStates.rows.map(row => [Number(row.group_id),row.status]),[[100,'pending'],[101,'unmapped'],[102,'running']]);
    assert.equal((await rpc('requeue_japanese_exact_code_groups',[run.runId]))[0],0,'requeue is idempotent');

    const quote = { categoryId:85,groupId:100,productId:500,subtype:'Normal',price:100,currency:'USD',datasetAt:dataset,exchangeRate:0.75,exchangeRateAt:dataset,exchangeRateSource:'fixture-fx' };
    const result = (variantId:string, productId:number, collector = true) => ({ variantId,catalogueVersionId:id(1),reason:'priced',nextRetryAt:new Date(Date.now()+86_400_000).toISOString(),mapping:{categoryId:85,groupId:100,productId,subtype:'Normal',method:'exact_set_code_number'},quote:collector ? {...quote,productId} : null });
    await rpc('store_catalogue_bulk_prices',[json([result(id(30),500)])]);
    const stored = (await db.query<any>('select * from market.catalogue_general_prices where variant_id=$1',[id(30)])).rows[0];
    assert.equal(Number(stored.central_estimate),75,'JA exact code plus collector commits GBP guide despite name mismatch');
    assert.equal((await db.query<any>('select method from market.catalogue_provider_cards where variant_id=$1',[id(30)])).rows[0].method,'exact_set_code_number');

    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([result(id(31),504)])]),/invalid exact-code product identity/,'duplicate canonical printings reject exact-code mapping');
    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([result(id(33),501)])]),/invalid exact-code product identity/,'duplicate provider products reject exact-code mapping');
    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([result(id(34),503)])]),/invalid exact-code product identity/,'blank collector number rejects exact-code mapping');

    await db.query('insert into market.catalogue_provider_sets(category_id,group_id,language_code,set_id,method) values(3,200,$1,$2,$3)', ['en',id(13),'exact_set_name']);
    await db.query('insert into market.catalogue_provider_set_members(category_id,group_id,set_id,language_code,method) values(3,200,$1,$2,$3)', [id(13),'en','exact_set_name']);
    const englishBypass = { variantId:id(35),catalogueVersionId:id(1),reason:'priced',nextRetryAt:new Date(Date.now()+86_400_000).toISOString(),mapping:{categoryId:3,groupId:200,productId:999,subtype:'Normal',method:'exact_set_code_number'},quote:null };
    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([englishBypass])]),/invalid exact-code product identity/,'English cannot use Japanese exact-code method');

    await db.exec('reset role');
    await db.query("update api.catalogue_sets set set_code='sv1a-revised' where set_id=$1 and language_code='ja'",[id(10)]);
    await db.exec('set role service_role');
    const staleCode = (await rpc('resolve_catalogue_bulk_set',[85,100,'ja','Provider Japanese text unrelated','SV1A']))[0];
    assert.notEqual(staleCode.status,'mapped','a stale published set code cannot retain an automatic mapping');
    assert.equal((await db.query('select variant_id from market.catalogue_general_prices where variant_id=$1',[id(30)])).rows.length,0,'an invalid automatic identifier quarantines its old quote');
    assert.equal((await rpc('catalogue_bulk_group_candidates',[85,100,null,500])).length,0,'stale automatic code mappings have no candidates');
    await assert.rejects(rpc('store_catalogue_bulk_prices',[json([result(id(30),500)])]),/invalid exact-code product identity/,'stale automatic code mappings cannot write a quote');
    console.log('Japanese exact price identities passed: service-only exact codes, ambiguity quarantine, collector uniqueness, and no English-name inference.');
  } finally { await db.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
