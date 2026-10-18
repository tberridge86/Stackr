-- Prepared follow-up only. Requires separate owner approval before execution.
-- Four independent read-only parts; collect each once sequentially so the tool
-- cannot hide earlier result sets. Project: oakdbbzdqwurpjnoqhmu.
-- No ANALYZE, DDL, DML, price refresh, jobs, private account data or query text.
-- These improve coverage; estimates and point observations do not prove runtime.

-- PART 1: exact physical tables omitted by the earlier index-name filter.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select schemaname, tablename, indexname, indexdef
from pg_indexes
where (schemaname = 'catalog' and tablename in
  ('card_printings', 'card_variants', 'catalogue_version_sets', 'catalogue_versions'))
  or (schemaname = 'market' and tablename = 'cardmarket_printing_mappings')
  or (schemaname = 'public' and tablename = 'market_price_snapshots')
order by schemaname, tablename, indexname;
rollback;

-- PART 2: view used by the approved stored-price function; metadata only.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select n.nspname as schema_name, c.relname as view_name,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'api' and c.relkind in ('v', 'm')
  and c.relname = 'market_price_estimates';
rollback;

-- PART 3: existing per-set logo REST query shape; EXPLAIN without execution.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
explain (format json)
select * from api.asset_manifest
where asset_type = 'set_logo'
  and set_id = '903d5baa-27c7-5690-b1d7-2395c770204a'::uuid
order by catalogue_version_id, asset_row_id
limit 251;
rollback;

-- PART 4: factual-card REST shape with the independently observed exact version.
-- Unlike the initial estimate, this does not use a LIMIT 1 version subquery.
-- The actual service role/flags and runtime are still separate evidence.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
explain (format json)
select * from api.catalogue_cards
where set_id = '903d5baa-27c7-5690-b1d7-2395c770204a'::uuid
  and catalogue_version_id = '1a23b7a7-c50e-4601-9180-a25c950d27ea'::uuid
  and language_code = 'ja'
order by variant_id
limit 4;
rollback;
