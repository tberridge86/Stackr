-- Preserve all existing grants, admin policies, RLS flags and ownership rules.
-- Production and staging were independently inspected on 2026-09-11 and had
-- this exact 17-policy fingerprint. Abort rather than overwrite policy drift.
-- The seven removed permissive policies are already covered by surviving ones.
set local search_path = public, pg_catalog;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
lock table public.binders, public.binder_cards in share row exclusive mode;

do $guard$
declare
  observed text;
begin
  select md5(string_agg(jsonb_build_object(
    'table',tablename,'name',policyname,'permissive',permissive,
    'roles',roles::text,'cmd',cmd,'qual',qual,'check',with_check
  )::text, E'\n' order by tablename,policyname)) into observed
  from pg_policies
  where schemaname='public' and tablename in ('binders','binder_cards');
  if observed is distinct from 'c08f4853e389f65a9dabb9ce6c8e03a7' then
    raise exception 'Binder RLS differs from inspected baseline; review before applying (fingerprint %)', observed;
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('binders','binder_cards')
      and not c.relrowsecurity
  ) then
    raise exception 'Binder RLS must already be enabled';
  end if;
end
$guard$;

alter policy "Users can read own or public binders" on public.binders
  using (((select auth.uid()) = user_id) or (is_public = true));
alter policy "Users can create own binders" on public.binders
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own binders" on public.binders
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own binders" on public.binders
  using ((select auth.uid()) = user_id);

drop policy "Anyone can view public binders" on public.binders;
drop policy "Users can read own binders" on public.binders;

alter policy "Users can read cards in own or public binders" on public.binder_cards
  using (exists (
    select 1 from public.binders b
    where b.id = binder_cards.binder_id
      and ((b.user_id = (select auth.uid())) or (b.is_public = true))
  ));
alter policy "Users can create cards in own binders" on public.binder_cards
  with check (exists (
    select 1 from public.binders b
    where b.id = binder_cards.binder_id and b.user_id = (select auth.uid())
  ));
alter policy "Users can update cards in own binders" on public.binder_cards
  using (exists (
    select 1 from public.binders b
    where b.id = binder_cards.binder_id and b.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.binders b
    where b.id = binder_cards.binder_id and b.user_id = (select auth.uid())
  ));
alter policy "Users can delete cards in own binders" on public.binder_cards
  using (exists (
    select 1 from public.binders b
    where b.id = binder_cards.binder_id and b.user_id = (select auth.uid())
  ));

drop policy "Public can view public binders" on public.binder_cards;
drop policy "Users can read own binder cards" on public.binder_cards;
drop policy "Users can create own binder cards" on public.binder_cards;
drop policy "Users can update own binder cards" on public.binder_cards;
drop policy "Users can delete own binder cards" on public.binder_cards;

-- Admin policies intentionally remain unchanged and authenticated-only. Do not
-- replace them with a public-role policy or disable RLS to improve a benchmark.
