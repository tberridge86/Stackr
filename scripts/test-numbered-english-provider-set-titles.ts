import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const oldGrammar = '^(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:][[:space:]]*';
const numberedGrammar = '^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*';
const db = new PGlite();

async function rpc(name: string, args: unknown[] = []) {
  const slots = args.map((_, index) => '$' + (index + 1)).join(',');
  return (await db.query<any>('select api.' + name + '(' + slots + ') as value', args)).rows.map((row) => row.value);
}
async function definition(signature: string) {
  return (await db.query<{ value: string }>('select pg_get_functiondef($1::regprocedure) as value', [signature])).rows[0].value;
}

async function main() {
  try {
    await db.exec([
      'create role anon; create role authenticated; create role service_role;',
      'create schema api; create schema catalog; create schema market;',
      'create table catalog.catalogue_versions(id uuid primary key,status text,deprecated_at timestamptz);',
      'create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id));',
      'create table catalog.sets(id uuid primary key,deprecated_at timestamptz); create table catalog.languages(code text primary key);',
      'create table catalog.card_printings(id uuid primary key,collector_number text,language_code text,set_id uuid,deprecated_at timestamptz);',
      'create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz,is_default boolean);',
      'create table api.catalogue_cards(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,variant_code text,finish_code text,catalogue_version_id uuid,collector_number text,card_english_display_name text,card_native_name text);',
      'create table api.catalogue_sets(set_id uuid,language_code text,set_code text,native_name text,english_display_name text);',
      'create table catalog.catalogue_version_external_identifiers(external_id text,language_code text,catalogue_version_id uuid,printing_id uuid,variant_id uuid); create view api.catalogue_external_identifiers as select * from catalog.catalogue_version_external_identifiers;',
      'create table api.market_price_estimates(variant_id uuid,product_kind text,display_currency_code text,condition_code text,language_code text,grader_code text,grade_value numeric,fallback_identity_key text,calculated_at timestamptz,price_estimate_id uuid);',
      'create table public.market_price_snapshots(id bigint,card_id text,language text,calculated_at timestamptz,user_id uuid,pricing_identity_json jsonb,set_id text);',
      'grant usage on schema api,catalog,market,public to service_role; grant select on all tables in schema api,catalog,public to service_role;',
    ].join('\n'));
    for (const file of ['20261003224016_catalogue_price_bulk_cache.sql','20261003224031_restore_full_catalogue_price_guide.sql','20261003232812_japanese_exact_price_identities.sql','20261004084131_english_exact_title_price_identities.sql']) {
      await db.exec('begin; ' + readFileSync('supabase/migrations/' + file, 'utf8') + ' commit;');
    }
    const beforeResolver = await definition('api.resolve_catalogue_bulk_set(integer,bigint,text,text,text)');
    const beforeCurrent = await definition('api.english_exact_price_set_is_current(bigint,uuid)');
    const beforeJapanese = await definition('api.resolve_catalogue_bulk_set_by_code_or_name(integer,bigint,text,text,text)');
    await db.exec('begin; ' + readFileSync('supabase/migrations/20261004190319_numbered_english_provider_set_titles.sql', 'utf8') + ' commit;');
    assert.equal((await definition('api.resolve_catalogue_bulk_set(integer,bigint,text,text,text)')).replaceAll(numberedGrammar, oldGrammar), beforeResolver, 'resolver body only changes the finite grammar');
    assert.equal((await definition('api.english_exact_price_set_is_current(bigint,uuid)')).replaceAll(numberedGrammar, oldGrammar), beforeCurrent, 'currentness body only changes the finite grammar');
    assert.equal(await definition('api.resolve_catalogue_bulk_set_by_code_or_name(integer,bigint,text,text,text)'), beforeJapanese, 'Japanese wrapper is unchanged');

    const version = id(1); const set = id(10); const printing = id(20); const variant = id(30);
    await db.query('insert into catalog.catalogue_versions values($1,$2,null)', [version, 'published']);
    await db.query('insert into catalog.languages values($1)', ['en']);
    await db.query('insert into catalog.sets values($1,null)', [set]);
    await db.query('insert into api.catalogue_sets values($1,$2,$3,$4,$5)', [set, 'en', 'sv02', 'Paldea Evolved', 'Paldea Evolved']);
    await db.query('insert into catalog.card_printings values($1,$2,$3,$4,null)', [printing, '001/193', 'en', set]);
    await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,null,true)', [variant, printing, 'en', 'normal', 'normal']);
    await db.query('insert into catalog.catalogue_version_variants values($1,$2)', [version, variant]);
    await db.query('insert into api.catalogue_cards values($1,$2,$3,$4,$5,$6,$7,$8,$9,null)', [variant, printing, set, 'en', 'normal', 'normal', version, '001/193', 'Hoppip']);
    const dataset = new Date(Date.now() - 3600000).toISOString();
    const primary = { categoryId: 3, groupId: 23120, abbreviation: 'SV02', name: 'SV02: Paldea Evolved' };
    await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload,dataset_at) values($1,$2::jsonb,$3)', ['tcgplayer/3/groups', JSON.stringify({ success: true, results: [primary] }), dataset]);
    const run = (await rpc('begin_catalogue_bulk_sweep', [dataset, JSON.stringify([Object.assign({ language: 'en' }, primary)])]))[0];
    await db.query('update market.catalogue_bulk_groups set status=$1 where run_id=$2', ['unmapped', run.runId]);
    await db.exec('set role service_role');
    const mapped = (await rpc('resolve_catalogue_bulk_set', [3, 23120, 'en', primary.name, primary.abbreviation]))[0];
    assert.deepEqual({ status: mapped.status, source: mapped.source, setId: mapped.setId }, { status: 'mapped', source: 'exact_set_title', setId: set }, 'SV02 positive case requires exact suffix and physical set');
    assert.equal((await rpc('english_exact_price_set_is_current', [23120, set]))[0], true, 'numbered automatic mapping remains current');
    assert.equal((await rpc('requeue_english_exact_title_groups', [run.runId]))[0], 1, 'only exact numbered group requeues');
    assert.deepEqual((await rpc('catalogue_bulk_group_candidates', [3, 23120, null, 500])).map((row: any) => row.variant_id), [variant], 'candidate uses current physical row');
    for (const bad of ['SV02 Paldea Evolved', 'SV2: Paldea Evolved', 'XX02: Paldea Evolved']) {
      assert.equal((await rpc('resolve_catalogue_bulk_set', [3, 23121, 'en', bad, '']))[0].status, 'unmapped', 'malformed label rejected: ' + bad);
    }
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify({ success: true, results: [primary, { categoryId: 3, groupId: 23124, abbreviation: 'SV02D', name: primary.name }] }), 'tcgplayer/3/groups']);
    assert.equal((await rpc('resolve_catalogue_bulk_set', [3, 23120, 'en', primary.name, primary.abbreviation]))[0].status, 'ambiguous', 'duplicate provider suffix quarantines mapping');
    assert.equal((await rpc('english_exact_price_set_is_current', [23120, set]))[0], false, 'duplicate provider suffix is not authoritative');
    assert.deepEqual(await rpc('catalogue_bulk_group_candidates', [3, 23120, null, 500]), [], 'quarantined automatic mapping returns no candidates');
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('resolve_catalogue_bulk_set', [3, 23120, 'en', primary.name, primary.abbreviation]), /permission denied/, 'service-only permission remains');
    console.log('Numbered English provider set titles passed: SV02, unchanged Japanese path, physical guards, malformed labels and ambiguity quarantine.');
  } finally { await db.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
