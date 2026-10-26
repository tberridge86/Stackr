import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { captureRestoreSecurity, compareRestoreSecurity } from './deploy/postgres-restore-security.mjs';

const fixture = String.raw`
  create role anon; create role authenticated; create role service_role bypassrls;
  create role app_operator; create role app_reader;
  create schema private; create schema auth; create schema api; create schema storage;
  create table auth.users(id uuid primary key, encrypted_password text, raw_app_meta_data jsonb);
  create table auth.identities(id text primary key, user_id uuid references auth.users, identity_data jsonb);
  insert into auth.users values
    ('00000000-0000-4000-8000-000000000001','SECRET_PASSWORD_A','{"admin":false}'),
    ('00000000-0000-4000-8000-000000000002','SECRET_PASSWORD_B','{"admin":false}');
  insert into auth.identities values
    ('SECRET_IDENTITY_A','00000000-0000-4000-8000-000000000001','{"email":"SECRET_EMAIL_A"}');
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.holdings(id int primary key, owner_id uuid, secret text);
  insert into public.holdings values
    (1,'00000000-0000-4000-8000-000000000001','SECRET_HOLDING_A'),
    (2,'00000000-0000-4000-8000-000000000002','SECRET_HOLDING_B');
  alter table public.holdings enable row level security;
  create policy owner_only on public.holdings for all to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  grant usage on schema public,auth to anon,authenticated;
  grant select,insert,update,delete on public.holdings to authenticated;
  create table private.admins(user_id uuid primary key);
  create function private.is_trusted_admin() returns boolean language sql stable security definer
    set search_path = pg_catalog,private as
    $$select exists(select 1 from private.admins where user_id = auth.uid())$$;
  revoke all on function private.is_trusted_admin() from public;
  create function api.admin_only() returns boolean language plpgsql security definer
    set search_path = pg_catalog,private as $$
    begin
      if not private.is_trusted_admin() then raise exception 'admin_required'; end if;
      return true;
    end $$;
  revoke all on function api.admin_only() from public;
  grant usage on schema api to authenticated;
  grant execute on function api.admin_only() to authenticated;
  create sequence public.fixture_sequence;
  create table storage.objects(id int, owner_id uuid, name text);
  alter table storage.objects enable row level security;
  create policy owner_path on storage.objects to authenticated using(owner_id=auth.uid());
  create function private.protect_authority() returns trigger language plpgsql as $$begin return new; end$$;
  create trigger protect_authority before update on public.holdings for each row execute function private.protect_authority();
  create trigger protect_auth before update on auth.users for each row execute function private.protect_authority();
  set row_security = off;
`;
const source = new PGlite();
const target = new PGlite();
const passed = [];
try {
  await source.exec(fixture);
  // Force different catalog OIDs without adding a compared object.
  await target.exec('create table public.oid_offset(id int); drop table public.oid_offset;');
  await target.exec(fixture);
  const baseline = await captureRestoreSecurity(source);
  const equal = compareRestoreSecurity(baseline, await captureRestoreSecurity(target));
  assert.equal(equal.ok, true, JSON.stringify(equal));
  assert.equal(equal.scope.installedAppLogin, 'not_verified');
  passed.push('identical security with different OIDs');

  const cases = [
    ['app trigger disabled', 'triggers', 'alter table public.holdings disable trigger protect_authority'],
    ['Auth trigger disabled', 'triggers', 'alter table auth.users disable trigger protect_auth'],
    ['Auth trigger dropped', 'triggers', 'drop trigger protect_auth on auth.users'],
    ['storage owner policy widened', 'policies', 'alter policy owner_path on storage.objects using (true)'],
    ['storage anonymous grant', 'privileges', 'grant select on storage.objects to anon'],
    ['global role setting', 'databaseRoleSettings', "alter role authenticated set search_path=private,public"],
    ['RLS disabled', 'relations', 'alter table public.holdings disable row level security'],
    ['RLS forced', 'relations', 'alter table public.holdings force row level security'],
    ['policy removed', 'policies', 'drop policy owner_only on public.holdings'],
    ['policy USING widened', 'policies', 'alter policy owner_only on public.holdings using (true)'],
    ['policy WITH CHECK widened', 'policies', 'alter policy owner_only on public.holdings with check (true)'],
    ['policy roles widened', 'policies', 'alter policy owner_only on public.holdings to public'],
    ['restrictive policy', 'policies', 'drop policy owner_only on public.holdings; create policy owner_only on public.holdings as restrictive to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())'],
    ['anonymous table grant', 'privileges', 'grant select on public.holdings to anon'],
    ['anonymous column grant', 'privileges', 'grant select(secret) on public.holdings to anon'],
    ['private schema grant', 'privileges', 'grant usage on schema private to anon'],
    ['function PUBLIC execute', 'privileges', 'grant execute on function private.is_trusted_admin() to public'],
    ['grant option', 'privileges', 'grant select on public.holdings to authenticated with grant option'],
    ['sequence grant', 'privileges', 'grant usage on sequence public.fixture_sequence to anon'],
    ['table owner', 'relations', 'alter table public.holdings owner to app_operator'],
    ['schema owner', 'schemas', 'alter schema private owner to app_operator'],
    ['function owner', 'functions', 'alter function private.is_trusted_admin() owner to app_operator'],
    ['security definer', 'functions', 'alter function private.is_trusted_admin() security invoker'],
    ['search path', 'functions', "alter function private.is_trusted_admin() set search_path = public,private"],
    ['trusted helper replaced', 'functions', 'create or replace function private.is_trusted_admin() returns boolean language sql stable security definer set search_path=pg_catalog,private as $$select true$$'],
    ['trusted helper removed', 'functions', 'drop function private.is_trusted_admin()'],
    ['expired login role', 'roles', "alter role app_operator valid until '-infinity'"],
    ['role bypass', 'roles', 'alter role authenticated bypassrls'],
    ['role membership', 'memberships', 'grant app_operator to authenticated'],
    ['empty default ACL differs from absent default', 'defaultPrivilegeObjects', 'alter default privileges revoke execute on functions from public; alter default privileges revoke execute on functions from postgres'],
    ['default grants', 'defaultPrivileges', 'alter default privileges in schema public grant select on tables to anon'],
    ['Auth claims', 'authIdentities', "update auth.users set raw_app_meta_data='{\"admin\":true}' where id='00000000-0000-4000-8000-000000000001'"],
    ['Auth identity binding', 'authIdentities', "update auth.identities set user_id='00000000-0000-4000-8000-000000000002'"],
    ['Auth password', 'authIdentities', "update auth.users set encrypted_password='SECRET_CHANGED'"],
  ];
  for (const [name, category, sql] of cases) {
    await target.exec('begin; ' + sql);
    try {
      const comparison = compareRestoreSecurity(baseline, await captureRestoreSecurity(target));
      assert.equal(comparison.ok, false, name);
      assert.equal(comparison.categories[category].ok, false, name);
      assert.doesNotMatch(JSON.stringify(comparison), /SECRET_|00000000-0000-4000|owner_id =|encrypted_password|admin_required/);
      passed.push(name);
    } finally { await target.exec('rollback'); }
  }
  await target.exec('begin; drop table auth.identities');
  await assert.rejects(captureRestoreSecurity(target), /restore_security_query_failed:auth.identities/);
  await target.exec('rollback');
  passed.push('missing Auth table fails closed');

  await target.exec('begin; drop schema private cascade');
  await assert.rejects(captureRestoreSecurity(target), /restore_security_required_schema_missing:private/);
  await target.exec('rollback');
  passed.push('missing private schema fails closed');

  await assert.rejects(captureRestoreSecurity({ query: async () => { throw new Error('SECRET_CONNECTION'); } }),
    (error) => error.message === 'restore_security_requires_row_security_off');
  passed.push('query errors redacted and fail closed');

  const reordered = Object.fromEntries(Object.entries(baseline).map(([category, rows]) => [category, [...rows].reverse()]));
  assert.equal(compareRestoreSecurity(baseline, reordered).ok, true);
  passed.push('stable ordering');

  for (const [owner, expectedId] of [['00000000-0000-4000-8000-000000000001',1],['00000000-0000-4000-8000-000000000002',2]]) {
    await target.exec("begin; set local role authenticated; set local row_security=on; select set_config('request.jwt.claim.sub','" + owner + "',true)");
    assert.deepEqual((await target.query('select id from public.holdings order by id')).rows, [{id:expectedId}]);
    await assert.rejects(target.query('select api.admin_only()'), /admin_required/);
    await target.exec('rollback');
    passed.push('principal ' + expectedId + ' isolated and admin denied');
  }
  await target.exec('begin; set local role anon; set local row_security=on');
  await assert.rejects(target.query('select * from public.holdings'), /permission denied/);
  await target.exec('rollback');
  passed.push('anonymous read denied');

  await target.exec('begin; set local role authenticated');
  await assert.rejects(captureRestoreSecurity(target), /restore_security_query_failed:auth.users/);
  await target.exec('rollback');
  passed.push('unreadable Auth rows fail closed');

  await target.exec('begin; set local row_security=on');
  await assert.rejects(captureRestoreSecurity(target), /restore_security_requires_row_security_off/);
  await target.exec('rollback');
  passed.push('filtered fingerprints refused');

  console.log(JSON.stringify({ok:true, engine:'local PGlite PostgreSQL', checks:passed.length, passed,
    hostedRestore:'not_run', phoneAcceptance:'not_verified'}, null, 2));
} finally {
  await Promise.allSettled([source.close(), target.close()]);
}
