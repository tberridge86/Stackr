import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { runCatalogueBulkSweep } from './refresh-catalogue-bulk-prices.mjs';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
async function rpc(name: string, args: unknown[] = []) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
  return (await db.query<any>(`select api.${name}(${placeholders}) result`, args)).rows.map((row) => row.result);
}

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.catalogue_versions(id uuid primary key, status text not null default 'published', deprecated_at timestamptz);
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id));
      create table catalog.sets(id uuid primary key,deprecated_at timestamptz);
      create table catalog.languages(code text primary key);
      create table catalog.card_printings(id uuid primary key,collector_number text,language_code text,set_id uuid,deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz,is_default boolean);
      create table api.catalogue_cards(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,variant_code text,finish_code text,catalogue_version_id uuid,collector_number text,card_english_display_name text,card_native_name text);
      create table api.catalogue_sets(set_id uuid,language_code text,set_code text,native_name text,english_display_name text);
      create table catalog.catalogue_version_external_identifiers(external_id text,language_code text,catalogue_version_id uuid,printing_id uuid,variant_id uuid);
      create view api.catalogue_external_identifiers as select * from catalog.catalogue_version_external_identifiers;
      create table api.market_price_estimates(variant_id uuid,product_kind text,display_currency_code text,condition_code text,language_code text,grader_code text,grade_value numeric,fallback_identity_key text,calculated_at timestamptz,price_estimate_id uuid);
      create table public.market_price_snapshots(id bigint,card_id text,language text,calculated_at timestamptz,user_id uuid,pricing_identity_json jsonb,set_id text);
      insert into catalog.catalogue_versions values('${id(1)}','published',null); insert into catalog.languages values('en'),('ja');
      insert into catalog.sets values('${id(10)}',null),('${id(11)}',null);
      insert into api.catalogue_sets values('${id(10)}','en','sm8','Lost Thunder','Lost Thunder'),('${id(11)}','en','g1','Generations','Generations');
      insert into catalog.card_printings values('${id(20)}','001/214','en','${id(10)}',null),('${id(21)}','002/214','en','${id(10)}',null),('${id(22)}','002/214','en','${id(10)}',null);
      insert into catalog.card_variants values('${id(30)}','${id(20)}','en','normal','normal',null,true),('${id(31)}','${id(21)}','en','normal','normal',null,true),('${id(32)}','${id(22)}','en','normal','normal',null,true);
      insert into catalog.catalogue_version_variants values('${id(1)}','${id(30)}'),('${id(1)}','${id(31)}'),('${id(1)}','${id(32)}');
      insert into api.catalogue_cards values('${id(30)}','${id(20)}','${id(10)}','en','normal','normal','${id(1)}','001/214','Card One',null),('${id(31)}','${id(21)}','${id(10)}','en','normal','normal','${id(1)}','002/214','Card Two',null),('${id(32)}','${id(22)}','${id(10)}','en','normal','normal','${id(1)}','002/214','Card Three',null);
      grant usage on schema api,catalog,market,public to service_role; grant select on all tables in schema api,catalog,public to service_role;
    `);
    for (const file of ['20261003224016_catalogue_price_bulk_cache.sql','20261003224031_restore_full_catalogue_price_guide.sql','20261003232812_japanese_exact_price_identities.sql','20261004084131_english_exact_title_price_identities.sql']) {
      await db.exec(`begin; ${readFileSync(`supabase/migrations/${file}`, 'utf8')} commit;`);
    }
    const dataset = new Date(Date.now() - 3_600_000).toISOString();
    const groups = { success: true, results: [
      { categoryId: 3, groupId: 100, abbreviation: 'sm8', name: 'SM - Lost Thunder' },
      { categoryId: 3, groupId: 200, abbreviation: 'g1', name: 'Gym Heroes' },
    ] };
    await db.query('insert into market.catalogue_bulk_feeds(feed_key,payload,dataset_at) values($1,$2::jsonb,$3)', ['tcgplayer/3/groups', JSON.stringify(groups), dataset]);
    const run = (await rpc('begin_catalogue_bulk_sweep', [dataset, JSON.stringify([
      { categoryId: 3, groupId: 100, language: 'en', abbreviation: 'sm8', name: 'SM - Lost Thunder' },
      { categoryId: 3, groupId: 200, language: 'en', abbreviation: 'g1', name: 'Gym Heroes' },
    ])]))[0];
    await db.query("update market.catalogue_bulk_groups set status='unmapped' where run_id=$1", [run.runId]);
    await db.exec('set role anon');
    await assert.rejects(rpc('requeue_english_exact_title_groups', [run.runId]), /permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await rpc('requeue_english_exact_title_groups', [run.runId]))[0], 1, 'only the unique exact title suffix may resume');
    const resolved = (await rpc('resolve_catalogue_bulk_set', [3, 100, 'en', 'SM - Lost Thunder', 'sm8']))[0];
    assert.equal(resolved.status, 'mapped'); assert.equal(resolved.source, 'exact_set_title'); assert.equal(resolved.setId, id(10));
    const collision = (await rpc('resolve_catalogue_bulk_set', [3, 200, 'en', 'Gym Heroes', 'g1']))[0];
    assert.equal(collision.status, 'unmapped', 'the shared g1 code must never map Gym Heroes to Generations');
    assert.equal((await db.query<any>("select method,note from market.catalogue_provider_sets where category_id=3 and group_id=100")).rows[0].method, 'exact_set_title');
    const statuses = await db.query<any>('select group_id,status from market.catalogue_bulk_groups where run_id=$1 order by group_id', [run.runId]);
    assert.deepEqual(statuses.rows, [{ group_id: 100, status: 'pending' }, { group_id: 200, status: 'unmapped' }]);
    assert.equal((await rpc('requeue_english_exact_title_groups', [run.runId]))[0], 0, 'requeue is idempotent once the exact group is pending');
    const candidates = await rpc('catalogue_bulk_group_candidates', [3, 100, null, 500]);
    assert.equal(candidates.length, 3); assert.equal(candidates.find((row: any) => row.variant_id === id(30)).unique_collector_number, true);
    assert.equal(candidates.find((row: any) => row.variant_id === id(31)).unique_collector_number, false, 'duplicate canonical collector numbers remain visible for card-level collision quarantine');
    const duplicateTitle = { ...groups, results: [...groups.results, { categoryId: 3, groupId: 101, abbreviation: 'lt-duplicate', name: 'Lost thunder' }] };
    await db.query('update market.catalogue_bulk_feeds set payload=$1::jsonb where feed_key=$2', [JSON.stringify(duplicateTitle), 'tcgplayer/3/groups']);
    const stale = (await rpc('resolve_catalogue_bulk_set', [3, 100, 'en', 'SM - Lost Thunder', 'sm8']))[0];
    assert.equal(stale.status, 'ambiguous', 'normalized raw and stripped provider titles collide');
    assert.equal((await rpc('english_exact_price_set_is_current', [100, id(10)]))[0], false);
    assert.deepEqual(await rpc('catalogue_bulk_group_candidates', [3, 100, null, 500]), [], 'a stale automatic title mapping cannot yield refresh candidates');
    assert.equal((await db.query<any>('select status from market.catalogue_bulk_groups where run_id=$1 and group_id=100', [run.runId])).rows[0].status, 'unmapped');
    assert.equal((await rpc('requeue_english_exact_title_groups', [run.runId]))[0], 0, 'ambiguous automatic titles remain terminal for review');
    await db.query("update market.catalogue_provider_sets set method='reviewed' where category_id=3 and group_id=100");
    await db.query("update market.catalogue_provider_set_members set method='reviewed' where category_id=3 and group_id=100");
    assert.equal((await rpc('catalogue_bulk_group_candidates', [3, 100, null, 500])).length, 3, 'a reviewed mapping remains usable after automatic title evidence is quarantined');
    const resumed = await runCatalogueBulkSweep({
      datasetAt: dataset, fx: { rate: 0.75, at: dataset, source: 'fixture-fx' }, now: Date.now(), groups: [], maxGroups: 1,
      begin: async () => ({ runId: 'resume-title-mappings' }), requeueEnglishExactTitles: async ({ runId }: any) => { assert.equal(runId, 'resume-title-mappings'); return 1; },
      claim: async () => null, resolveSet: async () => { throw new Error('no group should be claimed'); }, candidates: async () => [], store: async () => 0, finish: async () => true, loader: { load: async () => ({ results: [] }) },
    });
    assert.equal(resumed.requeued, 1, 'the worker resumes only rows released by the service-only exact-title requeue');
    console.log('English exact title identities passed: controlled title suffix, code collision rejection, service-only requeue and card-number uniqueness evidence.');
  } finally { await db.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
