-- Production schema baselines contain grants and policies for this application role,
-- but intentionally omit environment-specific role credentials. Recreate only the
-- canonical no-login role contract required to restore the schema in isolation.
do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'stackr_recognition'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'stackr_recognition_role_not_least_privilege';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'stackr_recognition'
  ) then
    create role stackr_recognition
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end
$$;

alter role stackr_recognition nologin;
alter role stackr_recognition set statement_timeout = '10s';
alter role stackr_recognition set idle_in_transaction_session_timeout = '10s';
alter role stackr_recognition set search_path = public, ml, api, audit, catalog, extensions;

grant connect on database postgres to stackr_recognition;
grant usage on schema extensions to stackr_recognition;
