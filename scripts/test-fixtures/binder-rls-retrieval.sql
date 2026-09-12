-- ISOLATED CI DATABASE ONLY. No production data or credentials are used.
-- Recreate the inspected policy expressions, exercise them, apply the actual
-- guarded migration, and rerun the same positive/negative access checks.
\set ON_ERROR_STOP on
begin;
set local search_path = public, pg_catalog;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.is_admin() returns boolean language sql stable as
  $$ select coalesce(current_setting('request.jwt.claim.is_admin', true), '') = 'true' $$;
-- These functions model an already-verified identity. They are test doubles,
-- not substitutes for production JWT validation or the unchanged is_admin().
grant usage on schema public, auth to anon, authenticated;
create table public.binders (id uuid primary key, user_id uuid not null, is_public boolean not null default false);
create table public.binder_cards (id uuid primary key, binder_id uuid not null references public.binders(id));
alter table public.binders enable row level security;
alter table public.binder_cards enable row level security;
grant select, insert, update, delete on public.binders, public.binder_cards to anon, authenticated;

create policy "Admins can do anything to binders" on public.binders to authenticated using (is_admin()) with check (is_admin());
create policy "Users can delete own binders" on public.binders for delete using (auth.uid() = user_id);
create policy "Users can create own binders" on public.binders for insert with check (auth.uid() = user_id);
create policy "Anyone can view public binders" on public.binders for select using (is_public = true);
create policy "Users can read own binders" on public.binders for select using (auth.uid() = user_id);
create policy "Users can read own or public binders" on public.binders for select using ((auth.uid() = user_id) or (is_public = true));
create policy "Users can update own binders" on public.binders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins can do anything to binder cards" on public.binder_cards to authenticated using (is_admin()) with check (is_admin());
create policy "Users can delete cards in own binders" on public.binder_cards for delete using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Users can delete own binder cards" on public.binder_cards for delete using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Users can create cards in own binders" on public.binder_cards for insert with check (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Users can create own binder cards" on public.binder_cards for insert with check (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Public can view public binders" on public.binder_cards for select using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.is_public = true));
create policy "Users can read cards in own or public binders" on public.binder_cards for select using (exists (select 1 from binders where binders.id = binder_cards.binder_id and (binders.user_id = auth.uid() or binders.is_public = true)));
create policy "Users can read own binder cards" on public.binder_cards for select using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Users can update cards in own binders" on public.binder_cards for update using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid())) with check (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));
create policy "Users can update own binder cards" on public.binder_cards for update using (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid())) with check (exists (select 1 from binders where binders.id = binder_cards.binder_id and binders.user_id = auth.uid()));

insert into public.binders values
 ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',false),
 ('00000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',true),
 ('00000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',false);
insert into public.binder_cards values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000003');

create function public.assert_binder_owner_access() returns void language plpgsql as $test$
declare affected integer;
begin
  if (select array_agg(id order by id)::text from binders) is distinct from '{00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002}' then
    raise exception 'owner/private/public binder visibility changed';
  end if;
  if (select array_agg(id order by id)::text from binder_cards) is distinct from '{00000000-0000-4000-8000-000000000011,00000000-0000-4000-8000-000000000012}' then
    raise exception 'owner/private/public card visibility changed';
  end if;
  update binders set is_public = false where id = '00000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'owner update denied'; end if;
  update binders set is_public = is_public where id in ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner binder update allowed'; end if;
  delete from binder_cards where id in ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner card delete allowed'; end if;
  begin
    insert into binders values ('00000000-0000-4000-8000-000000000009','22222222-2222-4222-8222-222222222222',false);
    raise exception 'forged binder ownership accepted';
  exception when insufficient_privilege then null; end;
  begin
    update binders set user_id = '22222222-2222-4222-8222-222222222222' where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'binder ownership transfer accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into binder_cards values ('00000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000002');
    raise exception 'insert into another public binder accepted';
  exception when insufficient_privilege then null; end;
  begin
    update binder_cards set binder_id = '00000000-0000-4000-8000-000000000002' where id = '00000000-0000-4000-8000-000000000011';
    raise exception 'cross-owner card move accepted';
  exception when insufficient_privilege then null; end;
  insert into binders values ('00000000-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111',false);
  insert into binder_cards values ('00000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000009');
  update binder_cards set binder_id = '00000000-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000000019';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'owner card move denied'; end if;
  delete from binder_cards where id = '00000000-0000-4000-8000-000000000019';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'owner card delete denied'; end if;
  delete from binders where id = '00000000-0000-4000-8000-000000000009';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'owner binder delete denied'; end if;
end
$test$;

create function public.assert_binder_anonymous_access() returns void language plpgsql as $test$
declare affected integer;
begin
  if (select array_agg(id order by id)::text from binders) is distinct from '{00000000-0000-4000-8000-000000000002}' then
    raise exception 'anonymous binder visibility changed';
  end if;
  if (select array_agg(id order by id)::text from binder_cards) is distinct from '{00000000-0000-4000-8000-000000000012}' then
    raise exception 'anonymous card visibility changed';
  end if;
  update binders set is_public = is_public;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'anonymous binder write allowed'; end if;
  delete from binder_cards;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'anonymous card delete allowed'; end if;
  begin
    insert into binder_cards values ('00000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000002');
    raise exception 'anonymous card insert allowed';
  exception when insufficient_privilege then null; end;
end
$test$;

create function public.assert_binder_admin_access() returns void language plpgsql as $test$
declare affected integer;
begin
  if (select count(*) from binders) <> 3 or (select count(*) from binder_cards) <> 3 then
    raise exception 'authenticated admin visibility changed';
  end if;
  update binder_cards set binder_id = binder_id where id = '00000000-0000-4000-8000-000000000013';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'authenticated admin update denied'; end if;
end
$test$;

create function public.run_binder_access_matrix() returns void language plpgsql as $test$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  perform set_config('request.jwt.claim.is_admin','false',true);
  perform public.assert_binder_owner_access();
  perform set_config('request.jwt.claim.is_admin','true',true);
  perform public.assert_binder_admin_access();
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.is_admin','false',true);
  perform public.assert_binder_anonymous_access();
  -- Even a true admin function must not grant the authenticated-only policy
  -- to the anonymous database role.
  perform set_config('request.jwt.claim.is_admin','true',true);
  perform public.assert_binder_anonymous_access();
  execute 'reset role';
end
$test$;

select public.run_binder_access_matrix();
\echo 'Original 17-policy access matrix passed.'

\ir ../../supabase/migrations/20260911075500_optimize_binder_rls_reads.sql

select public.run_binder_access_matrix();
do $assert$
begin
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('binders','binder_cards')) <> 10 then
    raise exception 'Expected ten retained binder policies';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('binders','binder_cards') and c.relrowsecurity) <> 2 then
    raise exception 'RLS must remain enabled on both tables';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('binders','binder_cards') and cmd='ALL' and roles::text='{authenticated}' and qual='is_admin()' and with_check='is_admin()') <> 2 then
    raise exception 'Authenticated admin policy definitions changed';
  end if;
end
$assert$;
\echo 'Migrated 10-policy access matrix and unchanged admin/RLS guards passed.'
rollback;
