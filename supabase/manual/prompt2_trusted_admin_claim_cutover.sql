-- Prompt 2 final admin-authority cutover.
-- Precondition: every existing profiles.role=admin account must first receive
-- auth.users.raw_app_meta_data.stackr_admin=true through a trusted admin path.
-- The preflight aborts before DDL if that transition has not happened.

begin;

do $$
begin
  if not exists (
    select 1
    from auth.users as admin_user
    where admin_user.raw_app_meta_data ->> 'stackr_admin' = 'true'
  ) then
    raise exception 'prompt2_admin_claim_cutover_blocked: no trusted admin claim exists';
  end if;

  if exists (
    select 1
    from public.profiles as profile
    join auth.users as admin_user on admin_user.id = profile.id
    where profile.role = 'admin'
      and admin_user.raw_app_meta_data ->> 'stackr_admin' is distinct from 'true'
  ) then
    raise exception 'prompt2_admin_claim_cutover_blocked: profile admin lacks trusted claim';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.stackr_is_trusted_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth, pg_temp
as $$
  select exists (
    select 1
    from auth.users as trusted_user
    where trusted_user.id = auth.uid()
      and trusted_user.raw_app_meta_data ->> 'stackr_admin' = 'true'
  );
$$;

revoke all on function private.stackr_is_trusted_admin()
  from public, anon, authenticated, service_role;
grant execute on function private.stackr_is_trusted_admin()
  to authenticated, service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private, pg_temp
as $$
  select private.stackr_is_trusted_admin();
$$;

create or replace function public.is_scan_lab_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private, pg_temp
as $$
  select private.stackr_is_trusted_admin();
$$;

create or replace function public.is_recognition_feedback_reviewer()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private, pg_temp
as $$
  select private.stackr_is_trusted_admin();
$$;

create or replace function public.admin_binder_directory()
returns table (
  binder_id uuid,
  binder_name text,
  binder_type text,
  is_public boolean,
  owner_user_id uuid,
  owner_email text,
  owner_collector_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if not private.stackr_is_trusted_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
  select
    binder.id,
    binder.name,
    binder.type::text,
    binder.is_public,
    binder.user_id,
    profile.email,
    profile.collector_name,
    binder.created_at
  from public.binders as binder
  left join public.profiles as profile on profile.id = binder.user_id
  order by binder.created_at desc;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_scan_lab_admin() from public, anon;
revoke all on function public.is_recognition_feedback_reviewer() from public, anon;
revoke all on function public.admin_binder_directory() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_scan_lab_admin() to authenticated, service_role;
grant execute on function public.is_recognition_feedback_reviewer() to authenticated, service_role;
grant execute on function public.admin_binder_directory() to authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'is_admin',
        'is_scan_lab_admin',
        'is_recognition_feedback_reviewer'
      )
      and procedure.prosecdef
  ) then
    raise exception 'prompt2_admin_claim_cutover_failed: public helper remains security definer';
  end if;

  if has_function_privilege('anon', 'public.is_admin()', 'execute')
    or has_function_privilege('anon', 'public.admin_binder_directory()', 'execute')
  then
    raise exception 'prompt2_admin_claim_cutover_failed: anonymous execute remains';
  end if;
end;
$$;

commit;
