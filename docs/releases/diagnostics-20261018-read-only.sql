-- Proposed production diagnosis only. Do not execute without owner approval.
-- No ANALYZE, refresh, job, DDL, DML, authentication data or SQL query text.
-- Project: oakdbbzdqwurpjnoqhmu. Run in a read-only transaction; always roll back.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

select state, wait_event_type, wait_event, count(*) as sessions
from pg_stat_activity
where datname = current_database() and backend_type = 'client backend'
group by state, wait_event_type, wait_event
order by sessions desc limit 20;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('catalog', 'market')
  and tablename in ('sets', 'printings', 'variants', 'catalogue_version_cards',
    'catalogue_version_variants', 'catalogue_version_assets', 'assets',
    'cardmarket_product_printing_mappings', 'price_snapshots')
order by schemaname, tablename, indexname;

select n.nspname as schema_name, c.relname as view_name,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'api' and c.relkind in ('v', 'm')
  and c.relname in ('catalogue_sets', 'catalogue_cards', 'asset_manifest');

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'api' and p.proname in ('catalogue_set_card_rows',
  'list_reviewed_cardmarket_printing_mappings', 'latest_stored_exact_prices',
  'card_image_manifest_for_identities');

explain (format json)
select catalogue_version_id from api.catalogue_sets
where set_id = '903d5baa-27c7-5690-b1d7-2395c770204a'::uuid;

explain (format json)
select * from api.catalogue_cards
where set_id = '903d5baa-27c7-5690-b1d7-2395c770204a'::uuid
  and catalogue_version_id = (
    select catalogue_version_id from api.catalogue_sets
    where set_id = '903d5baa-27c7-5690-b1d7-2395c770204a'::uuid limit 1)
  and language_code = 'ja'
order by variant_id limit 4;

rollback;
