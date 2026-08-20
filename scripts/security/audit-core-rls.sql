\set ON_ERROR_STOP on

create temporary table stackr_core_rls_audit on commit drop as
with table_columns as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.oid as table_oid,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    array_agg(a.attname order by a.attname) filter (where a.attnum > 0 and not a.attisdropped) as columns
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  where c.relkind in ('r', 'p')
    and n.nspname in ('public', 'api', 'market', 'trade', 'seller')
  group by n.nspname, c.relname, c.oid, c.relrowsecurity, c.relforcerowsecurity
), candidate_tables as (
  select *
  from table_columns
  where table_name ~* '(user|profile|binder|collection|inventory|listing|offer|order|trade|payment|sale|watch|notification|child|family|scan|feedback)'
     or columns && array[
       'user_id',
       'owner_id',
       'seller_id',
       'buyer_id',
       'profile_id',
       'parent_user_id',
       'child_user_id',
       'created_by',
       'updated_by'
     ]::name[]
), policy_counts as (
  select schemaname as schema_name, tablename as table_name, count(*)::integer as policy_count
  from pg_policies
  group by schemaname, tablename
), grants as (
  select
    table_schema as schema_name,
    table_name,
    bool_or(grantee = 'anon') as granted_to_anon,
    bool_or(grantee = 'authenticated') as granted_to_authenticated,
    string_agg(distinct grantee || ':' || privilege_type, ', ' order by grantee || ':' || privilege_type)
      filter (where grantee in ('anon', 'authenticated')) as client_grants
  from information_schema.role_table_grants
  where grantee in ('anon', 'authenticated')
  group by table_schema, table_name
)
select
  c.schema_name,
  c.table_name,
  c.rls_enabled,
  c.rls_forced,
  coalesce(p.policy_count, 0) as policy_count,
  coalesce(g.granted_to_anon, false) as granted_to_anon,
  coalesce(g.granted_to_authenticated, false) as granted_to_authenticated,
  coalesce(g.client_grants, '') as client_grants,
  case
    when not c.rls_enabled and (coalesce(g.granted_to_anon, false) or coalesce(g.granted_to_authenticated, false))
      then 'FAIL_CLIENT_EXPOSURE_WITHOUT_RLS'
    when c.rls_enabled and coalesce(p.policy_count, 0) = 0 and (coalesce(g.granted_to_anon, false) or coalesce(g.granted_to_authenticated, false))
      then 'WARN_RLS_DENY_ALL'
    when not c.rls_enabled
      then 'INFO_BACKEND_ONLY_OR_REVOKED'
    else 'PASS'
  end as status
from candidate_tables c
left join policy_counts p using (schema_name, table_name)
left join grants g using (schema_name, table_name)
order by c.schema_name, c.table_name;

\copy (select * from stackr_core_rls_audit order by schema_name, table_name) to 'reports/backend/core-rls-audit.csv' with (format csv, header true)

select *
from stackr_core_rls_audit
order by
  case status
    when 'FAIL_CLIENT_EXPOSURE_WITHOUT_RLS' then 1
    when 'WARN_RLS_DENY_ALL' then 2
    when 'INFO_BACKEND_ONLY_OR_REVOKED' then 3
    else 4
  end,
  schema_name,
  table_name;

do $$
declare
  violations text;
begin
  select string_agg(
    format('%I.%I [%s]', schema_name, table_name, client_grants),
    ', ' order by schema_name, table_name
  )
  into violations
  from stackr_core_rls_audit
  where status = 'FAIL_CLIENT_EXPOSURE_WITHOUT_RLS';

  if violations is not null then
    raise exception 'StackR core RLS audit failed: %', violations;
  end if;
end
$$;
