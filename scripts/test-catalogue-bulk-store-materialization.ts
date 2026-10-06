import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = [readFileSync('supabase/migrations/20261004094851_thin_published_price_identities.sql', 'utf8'), readFileSync('supabase/migrations/20261004101533_catalogue_bulk_store_materialization.sql', 'utf8'), readFileSync('supabase/migrations/20261005093440_printing_general_price_guide.sql','utf8'), readFileSync('supabase/migrations/20261005095334_printing_guide_native_set_language.sql','utf8')].join('\n');
const db = new PGlite();

async function rpc(name: string, args: unknown[] = []) {
  const slots = args.map((_, index) => `$${index + 1}`).join(',');
  return (await db.query<any>(`select api.${name}(${slots}) as value`, args)).rows.map((row) => row.value);
}

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.catalogue_versions(id uuid primary key,language_code text,status text,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz default now());
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text,primary key(catalogue_version_id,variant_id));
      create table catalog.languages(code text primary key);
      create table catalog.sets(id uuid primary key,deprecated_at timestamptz,language_code text);
      create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,collector_number text,english_display_name text,native_name text,deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz);
      create table market.catalogue_provider_set_members(category_id integer,group_id bigint,set_id uuid,language_code text,method text,primary key(category_id,group_id,set_id));
      create table market.catalogue_provider_cards(variant_id uuid primary key,printing_id uuid,set_id uuid,catalogue_version_id uuid,language_code text,category_id integer,group_id bigint,product_id bigint,subtype text,method text,verified_at timestamptz default now());
      create table market.catalogue_bulk_feeds(feed_key text primary key,payload jsonb,dataset_at timestamptz);
      create table market.catalogue_general_prices(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,provider text,category_id integer,product_id bigint,group_id bigint,subtype text,original_price numeric,original_currency text,exchange_rate numeric,exchange_rate_at timestamptz,exchange_rate_source text,central_estimate numeric,dataset_at timestamptz,stale_after timestamptz,recorded_at timestamptz default now());
      create table market.catalogue_price_outcomes(variant_id uuid primary key,catalogue_version_id uuid,reason text,checked_at timestamptz,next_retry_at timestamptz,provider text);
      create table market.catalogue_price_repairs(repair_key text primary key,variant_id uuid,reason text,detail jsonb,status text default 'open',last_seen_at timestamptz default now());
      create function api.normalized_price_collector(value text) returns text language sql immutable as $$ select lower(trim(value)) $$;
      create function api.catalogue_provider_subtype(variant text, finish text) returns text language sql immutable as $$ select case when variant='normal' then 'Normal' when variant='reverse_holo' then 'Reverse Holofoil' end $$;
      create function api.catalogue_provider_name(value text) returns text language sql immutable as $$ select lower(trim(value)) $$;
      create function api.japanese_exact_price_set_is_current(group_id bigint,set_id uuid) returns boolean language sql stable as $$ select true $$;
      create function api.english_exact_price_set_is_current(group_id bigint,set_id uuid) returns boolean language sql stable as $$ select group_id<>101 $$;
      grant usage on schema api,catalog,market to service_role;
      grant select,insert,update,delete on all tables in schema api,catalog,market to service_role;
    `);
    await db.exec(`begin; ${migration} commit;`);

    const version = id(1); const oldVersion = id(2); const jaVersion = id(3); const set = id(10); const jaSet = id(12);
    const retiredSet = id(11); const printing = id(20); const normal = id(30); const reverse = id(31); const languageMismatch = id(32); const retiredVariant = id(33); const jaNormal = id(34); const duplicateNormal = id(35);
    await db.query("insert into catalog.catalogue_versions(id,language_code,status,deprecated_at,published_at) values($1,$2,$3,null,now()),($4,$2,$3,null,now()-interval '1 day'),($5,$6,$3,null,now())", [version, 'en', 'published', oldVersion, jaVersion, 'ja']);
    await db.query('insert into catalog.languages values($1),($2)', ['en', 'ja']);
    await db.query('insert into catalog.sets values($1,null,$4),($2,now(),$4),($3,null,$5)', [set, retiredSet, jaSet,'en','ja']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [printing, set, 'en', '139/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [id(21), set, 'ja', '139/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [id(22), retiredSet, 'en', '140/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null),($6,$7,$8,$9,$10,null)', [id(23), jaSet, 'ja', '001/100', 'Lugia VSTAR', id(24), set, 'en', '139/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,null),($6,$2,$3,$7,$8,null),($9,$10,$3,$4,$5,null),($11,$12,$3,$4,$5,null),($13,$14,$15,$4,$5,null),($16,$17,$3,$4,$5,null)', [normal, printing, 'en', 'normal', 'normal', reverse, 'reverse_holo', 'reverse_holo', languageMismatch, id(21), retiredVariant, id(22), jaNormal, id(23), 'ja', duplicateNormal, id(24)]);
    await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5),($1,$6,$3,$4,$5),($1,$7,$8,$4,$5),($1,$9,$10,$11,$5),($12,$2,$3,$4,$5),($13,$14,$15,$16,$17),($1,$18,$19,$4,$5)', [version, normal, printing, set, 'en', reverse, languageMismatch, id(21), retiredVariant, id(22), retiredSet, oldVersion, jaVersion, jaNormal, id(23), jaSet, 'ja', duplicateNormal, id(24)]);
    await db.query('insert into market.catalogue_provider_set_members values(3,100,$1,$2,$3)', [set, 'en', 'exact_set_name']);
    await db.query('insert into market.catalogue_provider_set_members values(85,200,$1,$2,$3)', [jaSet, 'ja', 'exact_set_code']);
    await db.exec('set role service_role');

    const datasetAt = new Date().toISOString();
    const retryAt = new Date(Date.now() + 86_400_000).toISOString();
    const mapping = (categoryId: number, groupId: number, productId: number, subtype = 'Normal', method = 'exact_name_number') => ({ categoryId, groupId, productId, subtype, method });
    const quote = (entry: ReturnType<typeof mapping>, price = 12) => ({ ...entry, price, currency: 'USD', datasetAt, exchangeRate: 0.8, exchangeRateAt: datasetAt, exchangeRateSource: 'fixture' });
    const item = (variantId: string, catalogueVersionId: string, entry: ReturnType<typeof mapping> | null, evidence: ReturnType<typeof quote> | null, reason = evidence ? 'priced' : 'no_provider_quote') => ({ variantId, catalogueVersionId, reason, nextRetryAt: retryAt, mapping: entry, quote: evidence });
    const retained = async (category: number, group: number, products: unknown[], prices: unknown[], at = datasetAt) => {
      await db.query('insert into market.catalogue_bulk_feeds values($1,$2::jsonb,$3),($4,$5::jsonb,$3)', [
        `tcgplayer/${category}/${group}/products`, JSON.stringify({ results: products }), at,
        `tcgplayer/${category}/${group}/prices`, JSON.stringify({ results: prices }),
      ]);
    };

    const en = mapping(3, 100, 200);
    await retained(3, 100,
      [{ categoryId: 3, groupId: 100, productId: 200, name: 'Lugia VSTAR', extendedData: [{ name: 'Number', value: '139/195' }] }],
      [{ productId: 200, subTypeName: 'Normal', marketPrice: 12 }]);
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, en, quote(en))])]))[0], 1, 'valid English mapping and retained quote store together');
    assert.equal((await db.query<any>('select count(*)::int count from market.catalogue_general_prices')).rows[0].count, 1);

    const printingQuote = { ...quote(en), priceScope:'printing_general_estimate', usableForExactVariant:false, usableForHoldingsValuation:false };
    const printingItem = { ...item(reverse, version, mapping(3,100,200,'Reverse Holofoil'),null), printingQuote };
    assert.equal((await rpc('store_catalogue_bulk_prices',[JSON.stringify([printingItem])]))[0],1);
    const guide = (await db.query<any>('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows[0].quote;
    assert.equal(Number(guide.centralEstimate),9.6); assert.equal(guide.providerSubtype,'Normal');
    assert.equal(guide.usableForExactVariant,false); assert.equal(guide.usableForHoldingsValuation,false);
    assert.equal(guide.language,'en'); assert.equal(guide.finish,null);
    await db.query('update catalog.sets set language_code=$1 where id=$2',['ja',set]);
    assert.equal((await db.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows.length,0,'native set language mismatch excludes saved guide');
    await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([printingItem])]),/catalogue revision changed/,'native set language mismatch blocks new writes');
    await db.query('update catalog.sets set language_code=$1 where id=$2',['en',set]);
    assert.equal((await db.query<any>('select count(*)::int count from market.catalogue_general_prices where variant_id=$1',[reverse])).rows[0].count,0,'alternate finish stays out of the exact variant table');
    for (const patch of [{price:0},{price:0.001},{usableForExactVariant:true},{usableForHoldingsValuation:true},{subtype:'Reverse Holofoil'},{exchangeRateSource:''},{exchangeRateAt:null}]) {
      await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([{...printingItem,printingQuote:{...printingQuote,...patch}}])]),/unsupported printing general quote/);
    }
    await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([{...printingItem,printingQuote:{...printingQuote,price:99}}])]),/printing quote does not match stored provider build/);
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2',[JSON.stringify({results:[{productId:200,subTypeName:'Normal',marketPrice:12},{productId:200,subTypeName:'Normal',marketPrice:12}]}),'tcgplayer/3/100/prices']);
    await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([printingItem])]),/printing quote does not match stored provider build/,'duplicated basic finish evidence is not silently chosen');
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2',[JSON.stringify({results:[{productId:200,subTypeName:'Normal',marketPrice:12}]}),'tcgplayer/3/100/prices']);
    await db.query('insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method) values($1,$2,$3,$4,$5,3,100,200,$6,$7)',[duplicateNormal,id(24),set,version,'en','Holofoil','reviewed']);
    await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([printingItem])]),/printing provider product collision/,'ownership is checked across all finishes');
    assert.equal((await db.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows.length,0,'later conflicting ownership also invalidates reads');
    await db.query('delete from market.catalogue_provider_cards where variant_id=$1',[duplicateNormal]);
    await db.query('update catalog.card_variants set deprecated_at=now() where id=$1',[reverse]);
    assert.equal((await db.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows.length,0,'retired anchors do not leak saved prices');
    await db.query('update catalog.card_variants set deprecated_at=null where id=$1',[reverse]);
    await db.query('update catalog.catalogue_version_variants set printing_id=$1 where variant_id=$2 and catalogue_version_id=$3',[id(24),reverse,version]);
    assert.equal((await db.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows.length,0,'corrupted membership excludes printing guides');
    await db.query('update catalog.catalogue_version_variants set printing_id=$1 where variant_id=$2 and catalogue_version_id=$3',[printing,reverse,version]);
    assert.equal((await db.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows.length,1);
    await assert.rejects(rpc('read_catalogue_printing_general_prices',[Array(101).fill(printing)]),/invalid printing guide batch/);

    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, oldVersion, en, quote(en))])]), /catalogue revision changed/, 'old catalogue version is rejected');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(reverse, version, mapping(3, 100, 200, 'Normal'), null)])]), /invalid provider mapping/, 'wrong finish is rejected');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, mapping(85, 200, 200, 'Normal', 'exact_set_code_number'), null)])]), /invalid provider mapping/, 'wrong provider language is rejected');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, mapping(3, 999, 200), null)])]), /invalid provider mapping/, 'wrong provider set is rejected');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, mapping(3, 100, 999), null)])]), /invalid provider product evidence/, 'unknown provider product is rejected');
    await db.query('insert into market.catalogue_provider_set_members values(3,102,$1,$2,$3)', [set, 'en', 'exact_set_name']);
    await retained(3, 102, [{ categoryId: 3, groupId: 102, productId: 202, name: 'Lugia VSTAR', presaleInfo: { isPresale: true }, extendedData: [{ name: 'Number', value: '139/195' }] }], []);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, mapping(3, 102, 202), null)])]), /invalid provider product evidence/, 'presale provider products are rejected');

    await db.query('update catalog.card_printings set english_display_name=$1 where id=$2', ['Renamed after reviewed mapping', printing]);
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, en, quote(en))])]))[0], 1, 'existing exact-name mapping remains valid when the current display title changes');
    await db.query('update market.catalogue_bulk_feeds set dataset_at=now() where feed_key=$1', ['tcgplayer/3/100/products']);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, en, quote(en))])]), /quote does not match stored provider build/, 'revised retained product feed invalidates a formerly matching quote');
    await db.query('update market.catalogue_bulk_feeds set dataset_at=$1 where feed_key=$2', [datasetAt, 'tcgplayer/3/100/products']);

    await db.query('insert into market.catalogue_provider_set_members values(3,101,$1,$2,$3)', [set, 'en', 'exact_set_title']);
    await retained(3, 101, [{ categoryId: 3, groupId: 101, productId: 201, name: 'Renamed after reviewed mapping', extendedData: [{ name: 'Number', value: '139/195' }] }], []);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, mapping(3, 101, 201), null)])]), /exact title set identity changed/, 'changed exact-title group rejects atomically before writes');

    await retained(85, 200,
      [{ categoryId: 85, groupId: 200, productId: 300, name: 'ルギア', extendedData: [{ name: 'Number', value: '001/100' }] }, { categoryId: 85, groupId: 200, productId: 301, name: 'ルギア', extendedData: [{ name: 'Number', value: '001/100' }] }],
      [{ productId: 300, subTypeName: 'Normal', marketPrice: 4 }]);
    const ja = mapping(85, 200, 300, 'Normal', 'exact_set_code_number');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(jaNormal, jaVersion, ja, quote(ja, 4))])]), /invalid exact-code product identity/, 'duplicate Japanese provider collector numbers are rejected even with different product IDs');

    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify({ results: [{ categoryId: 85, groupId: 200, productId: 300, name: 'ルギア', extendedData: [{ name: 'Number', value: '001/100' }] }] }), 'tcgplayer/85/200/products']);
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify({ results: [] }), 'tcgplayer/85/200/prices']);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(jaNormal, jaVersion, ja, quote(ja, 4))])]), /quote does not match stored provider build/, 'missing retained price proof is rejected');
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify({ results: [{ productId: 300, subTypeName: 'Normal', marketPrice: 4 }, { productId: 300, subTypeName: 'Normal', marketPrice: 4 }] }), 'tcgplayer/85/200/prices']);
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify([item(jaNormal, jaVersion, ja, quote(ja, 4))])]))[0], 1, 'identical duplicate price observations preserve valid proof');
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify({ results:[{productId:300,subTypeName:'Normal',marketPrice:4}] }), 'tcgplayer/85/200/prices']);
    const jaPrintingQuote = { ...quote(ja,4), priceScope:'printing_general_estimate', usableForExactVariant:false, usableForHoldingsValuation:false };
    assert.equal((await rpc('store_catalogue_bulk_prices',[JSON.stringify([{...item(jaNormal,jaVersion,ja,quote(ja,4)),printingQuote:jaPrintingQuote}])]))[0],1);
    const jaGuide = (await db.query<any>('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[id(23)]])).rows[0].quote;
    assert.equal(jaGuide.language,'ja'); assert.equal(jaGuide.providerCategoryId,85,'Japanese guide keeps its native provider category');

    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(duplicateNormal, version, en, null)])]), /provider mapping collision/, 'one provider product cannot map to a different canonical variant');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, en, quote(en)), item(duplicateNormal, version, en, null)])]), /provider mapping collision/, 'a rejected batch is atomic');
    assert.equal((await db.query<any>('select count(*)::int count from market.catalogue_price_outcomes where variant_id=$1', [duplicateNormal])).rows[0].count, 0, 'rejected rows create no outcome');
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify(Array.from({ length: 500 }, () => item(normal.toUpperCase(), version.toUpperCase(), en, quote(en))))]))[0], 500, 'the bounded maximum accepts canonicalized UUID input without weakening proof checks');
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([])]), /invalid price results/);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify(Array.from({ length: 501 }, () => item(normal, version, en, null)))]), /invalid price results/);
    const nextDataset = new Date(Date.parse(datasetAt)+1).toISOString();
    await db.query('update market.catalogue_bulk_feeds set dataset_at=$1 where feed_key in ($2,$3)',[nextDataset,'tcgplayer/3/100/products','tcgplayer/3/100/prices']);
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2',[JSON.stringify({results:[{productId:200,subTypeName:'Normal',marketPrice:12.5}]}),'tcgplayer/3/100/prices']);
    assert.equal((await rpc('store_catalogue_bulk_prices',[JSON.stringify([{...printingItem,printingQuote:{...printingQuote,datasetAt:nextDataset,price:12.5}}])]))[0],1);
    const refreshedGuide = (await db.query<any>('select * from api.read_catalogue_printing_general_prices($1::uuid[])',[[printing]])).rows[0].quote;
    assert.equal(Number(refreshedGuide.centralEstimate),10,'next provider build refreshes the printing guide without rebuilding the catalogue');
    await assert.rejects(rpc('store_catalogue_bulk_prices',[JSON.stringify([printingItem])]),/printing quote does not match stored provider build/,'old retained amounts cannot overwrite a newer build');

    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('read_catalogue_printing_general_prices',[[printing]]),/permission denied/);
    await assert.rejects(db.query('select * from market.catalogue_printing_general_prices'),/permission denied/);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([item(normal, version, en, null)])]), /permission denied/);
    console.log('Materialized bulk store passed: bounded current identities, retained product/price proof, collision and atomicity guards, and service-only access.');
  } finally { await db.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
