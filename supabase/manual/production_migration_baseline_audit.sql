-- Read-only production migration-baseline evidence for Stackr.
-- This script does not create schemas, write migration history, or change data.

select
  current_database() as database_name,
  current_setting('server_version') as postgres_version,
  pg_catalog.current_timestamp as inspected_at;

select
  n.nspname as schema_name,
  count(*) filter (where c.relkind = 'r') as tables,
  count(*) filter (where c.relkind = 'v') as views,
  count(*) filter (where c.relkind = 'm') as materialized_views,
  count(*) filter (where c.relkind = 'S') as sequences
from pg_catalog.pg_namespace n
left join pg_catalog.pg_class c on c.relnamespace = n.oid
where n.nspname in (
  'public',
  'catalog',
  'ingest',
  'market',
  'ml',
  'api',
  'audit',
  'supabase_migrations'
)
group by n.nspname
order by n.nspname;

select
  required.schema_name,
  required.relation_name,
  pg_catalog.to_regclass(
    pg_catalog.format('%I.%I', required.schema_name, required.relation_name)
  ) is not null as present
from (
  values
    ('catalog', 'catalogue_versions'),
    ('catalog', 'catalogue_change_log'),
    ('catalog', 'sets'),
    ('catalog', 'card_printings'),
    ('catalog', 'card_variants'),
    ('ingest', 'sources'),
    ('ingest', 'raw_source_records'),
    ('ingest', 'import_runs'),
    ('api', 'catalogue_cards'),
    ('api', 'catalogue_sets'),
    ('api', 'catalogue_delta_changes'),
    ('audit', 'catalogue_events')
) as required(schema_name, relation_name)
order by required.schema_name, required.relation_name;

select
  c.relname as legacy_view,
  c.reloptions,
  pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
  pg_catalog.md5(pg_catalog.pg_get_viewdef(c.oid, true)) as definition_md5
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in (
    'catalogue_health',
    'japanese_catalogue_health',
    'tcg_card_printings',
    'tcg_set_cover_images'
  )
order by c.relname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('catalog', 'ingest', 'market', 'ml', 'api', 'audit')
order by n.nspname, p.proname;
