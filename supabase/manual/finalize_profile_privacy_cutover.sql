-- Run only after the mobile build using profile_public_directory has been
-- verified in production. This is intentionally not an automatic migration.

drop policy if exists "Public profiles are viewable" on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "Admins can do anything to profiles" on public.profiles;

create policy "Users can view own private profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert own private profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update own private profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Admins can manage profiles"
  on public.profiles
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (
  id,
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  has_seen_onboarding,
  expo_push_token
) on public.profiles to authenticated;
grant update (
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  has_seen_onboarding,
  expo_push_token
) on public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

do $$
begin
  if to_regprocedure('public.admin_binder_directory()') is not null then
    revoke all on function public.admin_binder_directory() from public, anon;
    grant execute on function public.admin_binder_directory() to authenticated, service_role;
  end if;
end;
$$;
