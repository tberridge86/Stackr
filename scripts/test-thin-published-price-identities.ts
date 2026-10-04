import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync('supabase/migrations/20261004094851_thin_published_price_identities.sql', 'utf8');
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
      create table catalog.sets(id uuid primary key,deprecated_at timestamptz);
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

    const version = id(1); const oldVersion = id(2); const set = id(10);
    const retiredSet = id(11); const printing = id(20); const normal = id(30); const reverse = id(31); const languageMismatch = id(32); const retiredVariant = id(33);
    await db.query("insert into catalog.catalogue_versions(id,language_code,status,deprecated_at,published_at) values($1,$2,$3,null,now()),($4,$2,$3,null,now()-interval '1 day')", [version, 'en', 'published', oldVersion]);
    await db.query('insert into catalog.languages values($1),($2)', ['en', 'ja']);
    await db.query('insert into catalog.sets values($1,null),($2,now())', [set, retiredSet]);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [printing, set, 'en', '139/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [id(21), set, 'ja', '139/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [id(22), retiredSet, 'en', '140/195', 'Lugia VSTAR']);
    await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,null),($6,$2,$3,$7,$8,null),($9,$10,$3,$4,$5,null),($11,$12,$3,$4,$5,null)', [normal, printing, 'en', 'normal', 'normal', reverse, 'reverse_holo', 'reverse_holo', languageMismatch, id(21), retiredVariant, id(22)]);
    await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5),($1,$6,$3,$4,$5),($1,$7,$8,$4,$5),($1,$9,$10,$11,$5),($12,$2,$3,$4,$5)', [version, normal, printing, set, 'en', reverse, languageMismatch, id(21), retiredVariant, id(22), retiredSet, oldVersion]);
    await db.query('insert into market.catalogue_provider_set_members values(3,100,$1,$2,$3)', [set, 'en', 'exact_set_name']);
    await db.exec('set role service_role');

    const candidates = await rpc('catalogue_bulk_group_candidates', [3, 100, null, 500]);
    assert.deepEqual(candidates.map((row: any) => row.variant_id), [normal, reverse], 'only the requested current version is visible');
    assert.ok(candidates.every((row: any) => row.catalogue_version_id === version && row.unique_collector_number), 'candidate identity retains version and collector safeguards');
    assert.ok(!candidates.some((row: any) => row.variant_id === languageMismatch), 'candidate rejects a printing/variant language mismatch');
    await db.query('insert into market.catalogue_provider_set_members values(3,102,$1,$2,$3)', [retiredSet, 'en', 'exact_set_name']);
    assert.deepEqual(await rpc('catalogue_bulk_group_candidates', [3, 102, null, 500]), [], 'candidate rejects a deprecated set');
    const identity = await db.query<any>('select * from api.published_catalogue_price_identity($1,$2)', [normal, version]);
    assert.deepEqual(identity.rows, [{ variant_id: normal, printing_id: printing, set_id: set, language_code: 'en', catalogue_version_id: version, collector_number: '139/195', variant_code: 'normal', finish_code: 'normal', card_english_display_name: 'Lugia VSTAR', card_native_name: null }]);
    assert.deepEqual((await db.query('select * from api.published_catalogue_price_identity($1,$2)', [normal, oldVersion])).rows, [], 'identity refuses a non-current catalogue version');
    const retryAt = new Date(Date.now() + 86_400_000).toISOString();
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify([{ variantId: normal, catalogueVersionId: version, reason: 'unresolved_provider_identity', nextRetryAt: retryAt, mapping: null, quote: null }])]))[0], 1, 'store uses the physical current identity');
    assert.equal((await db.query<any>('select catalogue_version_id from market.catalogue_price_outcomes where variant_id=$1', [normal])).rows[0].catalogue_version_id, version);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([{ variantId: normal, catalogueVersionId: oldVersion, reason: 'unresolved_provider_identity', nextRetryAt: retryAt, mapping: null, quote: null }])]), /catalogue revision changed/);
    await db.query("insert into market.catalogue_bulk_feeds values($1,$2::jsonb,now())", ['tcgplayer/3/100/products', JSON.stringify({ results: [{ categoryId: 3, groupId: 100, productId: 200, name: 'Wrong title', extendedData: [{ name: 'Number', value: '139/195' }] }] })]);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([{ variantId: normal, catalogueVersionId: version, reason: 'no_provider_quote', nextRetryAt: retryAt, quote: null, mapping: { categoryId: 3, groupId: 100, productId: 200, subtype: 'Normal', method: 'exact_name_number' } }])]), /invalid provider product evidence/, 'physical lookup retains English title collision protection');
    await db.query('insert into market.catalogue_provider_set_members values(3,101,$1,$2,$3)', [set, 'en', 'exact_set_title']);
    await db.query("insert into market.catalogue_bulk_feeds values($1,$2::jsonb,now())", ['tcgplayer/3/101/products', JSON.stringify({ results: [{ categoryId: 3, groupId: 101, productId: 201, name: 'Lugia VSTAR', extendedData: [{ name: 'Number', value: '139/195' }] }] })]);
    await assert.rejects(rpc('store_catalogue_bulk_prices', [JSON.stringify([{ variantId: normal, catalogueVersionId: version, reason: 'no_provider_quote', nextRetryAt: retryAt, quote: null, mapping: { categoryId: 3, groupId: 101, productId: 201, subtype: 'Normal', method: 'exact_name_number' } }])]), /exact title set identity changed/, 'store preflights changed English title identities before writes');
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('published_catalogue_price_identity', [normal, version]), /permission denied/);
    console.log('Thin published price identities passed: physical publication membership, language/version guard, bounded candidates and service-only access.');
  } finally { await db.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
