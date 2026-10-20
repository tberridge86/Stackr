import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const baseMigration = readFileSync('supabase/migrations/20261004094851_thin_published_price_identities.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261004171309_shared_set_authoritative_provider_card_exclusion.sql', 'utf8');
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
      create function api.catalogue_provider_subtype(variant text, finish text) returns text language sql immutable as $$ select case when variant='normal' and finish='normal' then 'Normal' end $$;
      create function api.catalogue_provider_name(value text) returns text language sql immutable as $$ select lower(trim(value)) $$;
      create function api.japanese_exact_price_set_is_current(group_id bigint,set_id uuid) returns boolean language sql stable as $$ select true $$;
      create function api.english_exact_price_set_is_current(group_id bigint,set_id uuid) returns boolean language sql stable as $$ select group_id<>203 $$;
      grant usage on schema api,catalog,market to service_role;
      grant select,insert,update,delete on all tables in schema api,catalog,market to service_role;
    `);
    await db.exec(`begin; ${baseMigration} ${migration} commit;`);

    const version = id(1); const set = id(10);
    const ownPrinting = id(20); const unmappedPrinting = id(21); const otherPrinting = id(22); const invalidPrinting = id(23); const stalePrinting = id(24); const wrongCategoryPrinting = id(25); const staleMemberPrinting = id(26);
    const own = id(30); const unmapped = id(31); const other = id(32); const invalid = id(33); const stale = id(34); const wrongCategory = id(35); const staleMember = id(36);
    await db.query('insert into catalog.catalogue_versions(id,language_code,status,deprecated_at,published_at) values($1,$2,$3,null,now())', [version, 'en', 'published']);
    await db.query('insert into catalog.languages values($1)', ['en']);
    await db.query('insert into catalog.sets values($1,null)', [set]);
    for (const [printing, collector, name] of [[ownPrinting, '1/100', 'Own map'], [unmappedPrinting, '2/100', 'Unmapped'], [otherPrinting, '3/100', 'Other map'], [invalidPrinting, '4/100', 'Invalid map'], [stalePrinting, '5/100', 'Stale map'], [wrongCategoryPrinting, '6/100', 'Wrong category'], [staleMemberPrinting, '7/100', 'Stale member']] as const) {
      await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,null)', [printing, set, 'en', collector, name]);
    }
    for (const [variant, printing] of [[own, ownPrinting], [unmapped, unmappedPrinting], [other, otherPrinting], [invalid, invalidPrinting], [stale, stalePrinting], [wrongCategory, wrongCategoryPrinting], [staleMember, staleMemberPrinting]] as const) {
      await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,null)', [variant, printing, 'en', 'normal', 'normal']);
      await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)', [version, variant, printing, set, 'en']);
    }
    await db.query('insert into market.catalogue_provider_set_members values(3,200,$1,$2,$3),(3,201,$1,$2,$3),(85,202,$1,$2,$3),(3,203,$1,$2,$4)', [set, 'en', 'reviewed', 'exact_set_title']);
    await db.query(
      'insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method) values($1,$2,$3,$4,$5,3,200,1000,$6,$7),($8,$9,$3,$4,$5,3,201,2000,$6,$7),($10,$11,$3,$4,$5,3,201,2001,$6,$7),($12,$13,$3,$14,$5,3,201,2002,$6,$7)',
      [own, ownPrinting, set, version, 'en', 'Normal', 'reviewed', other, otherPrinting, invalid, id(99), stale, stalePrinting, id(2)],
    );
    await db.query('insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method) values($1,$2,$3,$4,$5,85,202,2003,$6,$7),($8,$9,$3,$4,$5,3,203,2004,$6,$7)', [wrongCategory, wrongCategoryPrinting, set, version, 'en', 'Normal', 'reviewed', staleMember, staleMemberPrinting]);
    await db.query('insert into market.catalogue_general_prices(variant_id,printing_id,set_id,language_code,catalogue_version_id,provider,category_id,product_id,group_id,subtype,central_estimate) values($1,$2,$3,$4,$5,$6,3,2000,201,$7,42)', [other, otherPrinting, set, 'en', version, 'tcgplayer', 'Normal']);
    await db.query('insert into market.catalogue_price_outcomes values($1,$2,$3,now(),now()+interval \'1 day\',$4)', [other, version, 'priced', 'tcgplayer']);
    await db.exec('set role service_role');

    assert.equal((await db.query<any>('select count(*)::int as count from catalog.catalogue_version_variants where catalogue_version_id=$1', [version])).rows[0].count, 7, 'shared-group filtering must not change the published denominator');
    const candidates = await rpc('catalogue_bulk_group_candidates', [3, 200, null, 500]);
    assert.deepEqual(candidates.map((row: any) => row.variant_id), [own, unmapped, invalid, stale, wrongCategory, staleMember], 'own maps and unmapped, invalid, stale, wrong-category, or stale-member other maps remain candidates; only a valid other-group map is suppressed');
    assert.ok(candidates.find((row: any) => row.variant_id === own).provider_mapping, 'the requested group keeps its own authoritative map');
    assert.equal(candidates.find((row: any) => row.variant_id === invalid).provider_mapping, null, 'a wrong physical identity is not treated as an authoritative provider map');
    assert.equal(candidates.find((row: any) => row.variant_id === stale).provider_mapping, null, 'a stale catalogue revision is not treated as an authoritative provider map');
    assert.equal(candidates.find((row: any) => row.variant_id === wrongCategory).provider_mapping, null, 'a cross-language category is not treated as an authoritative provider map');
    assert.equal(candidates.find((row: any) => row.variant_id === staleMember).provider_mapping, null, 'a stale exact-title provider-set membership is not treated as authoritative');
    assert.deepEqual((await rpc('catalogue_bulk_group_candidates', [3, 200, own, 500])).map((row: any) => row.variant_id), [unmapped, invalid, stale, wrongCategory, staleMember], 'pagination remains ordered after filtering the valid other-group map');

    const retryAt = new Date(Date.now() + 86_400_000).toISOString();
    const outcomes = candidates.map((candidate: any) => ({ variantId: candidate.variant_id, catalogueVersionId: version, reason: 'no_provider_quote', nextRetryAt: retryAt, mapping: null, quote: null }));
    assert.equal((await rpc('store_catalogue_bulk_prices', [JSON.stringify(outcomes)]))[0], 6, 'the existing writer receives only repairable candidates');
    assert.deepEqual((await db.query<any>('select central_estimate from market.catalogue_general_prices where variant_id=$1', [other])).rows, [{ central_estimate: '42' }], 'the excluded group’s stored quote remains untouched');
    assert.deepEqual((await db.query<any>('select reason,catalogue_version_id from market.catalogue_price_outcomes where variant_id=$1', [other])).rows, [{ reason: 'priced', catalogue_version_id: version }], 'the excluded group’s stored outcome remains untouched');
    assert.equal((await db.query<any>('select count(*)::int as count from catalog.catalogue_version_variants where catalogue_version_id=$1', [version])).rows[0].count, 7, 'writer activity does not affect the published denominator');

    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('catalogue_bulk_group_candidates', [3, 200, null, 500]), /permission denied/);
    console.log('Shared-set provider mapping exclusion passed: preserves own/unmapped/invalid repairs and protects valid other-group outcomes.');
  } finally {
    await db.close();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
