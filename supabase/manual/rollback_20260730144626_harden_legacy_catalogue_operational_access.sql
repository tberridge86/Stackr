-- Emergency compatibility rollback for 20260730144626.
-- This restores legacy view execution but intentionally keeps service-owned
-- operational tables unavailable to anon and authenticated clients.

alter view public.catalogue_health
  set (security_invoker = false);

alter view public.japanese_catalogue_health
  set (security_invoker = false);

alter view public.tcg_card_printings
  set (security_invoker = false);

alter view public.tcg_set_cover_images
  set (security_invoker = false);

drop policy if exists "Admins can read catalogue image records" on public.card_images;
drop policy if exists "Admins can read catalogue image checks" on public.card_image_checks;
drop policy if exists "Admins can read catalogue price records" on public.card_prices;
drop policy if exists "Admins can read catalogue price checks" on public.card_price_checks;
drop policy if exists "Admins can read catalogue sync runs" on public.catalogue_sync_runs;

revoke all on table public.achievement_coin_rewards from public, anon, authenticated;
revoke all on table public.price_refresh_queue from public, anon, authenticated;
revoke all on table public.price_refresh_runs from public, anon, authenticated;

grant select on table public.achievement_coin_rewards to authenticated;
grant select, insert, update, delete on table public.achievement_coin_rewards to service_role;
grant select, insert, update, delete on table public.price_refresh_queue to service_role;
grant select, insert, update, delete on table public.price_refresh_runs to service_role;
