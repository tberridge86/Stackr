-- Make legacy compatibility views obey the RLS and grants of their callers.
-- The catalogue views remain readable through their existing grants, while
-- operational health details are visible only to authenticated admins.

alter view public.catalogue_health
  set (security_invoker = true);

alter view public.japanese_catalogue_health
  set (security_invoker = true);

alter view public.tcg_card_printings
  set (security_invoker = true);

alter view public.tcg_set_cover_images
  set (security_invoker = true);

alter table public.achievement_coin_rewards enable row level security;
alter table public.price_refresh_queue enable row level security;
alter table public.price_refresh_runs enable row level security;

revoke all on table public.achievement_coin_rewards from public, anon, authenticated;
revoke all on table public.price_refresh_queue from public, anon, authenticated;
revoke all on table public.price_refresh_runs from public, anon, authenticated;

grant select, insert, update, delete on table public.achievement_coin_rewards to service_role;
grant select, insert, update, delete on table public.price_refresh_queue to service_role;
grant select, insert, update, delete on table public.price_refresh_runs to service_role;

drop policy if exists "Admins can read catalogue image records" on public.card_images;
create policy "Admins can read catalogue image records"
  on public.card_images
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read catalogue image checks" on public.card_image_checks;
create policy "Admins can read catalogue image checks"
  on public.card_image_checks
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read catalogue price records" on public.card_prices;
create policy "Admins can read catalogue price records"
  on public.card_prices
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read catalogue price checks" on public.card_price_checks;
create policy "Admins can read catalogue price checks"
  on public.card_price_checks
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can read catalogue sync runs" on public.catalogue_sync_runs;
create policy "Admins can read catalogue sync runs"
  on public.catalogue_sync_runs
  for select
  to authenticated
  using ((select public.is_admin()));

comment on view public.catalogue_health is
  'Administrative catalogue coverage view. Runs with caller permissions and exposes operational details only through admin-scoped RLS.';
