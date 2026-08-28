-- Prompt 2 emergency containment: make profile authority server-controlled.
-- Safe to run before the trusted admin-claim cutover. This preserves the
-- existing profile-role admin while preventing client self-promotion.

begin;

alter table public.profiles enable row level security;

create or replace function public.stackr_protect_profile_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null or new.id is distinct from auth.uid() then
      raise exception 'profile_authority_violation: id must match verified identity'
        using errcode = '42501';
    end if;

    if coalesce(new.role, 'user') <> 'user'
      or new.email is not null
      or new.stripe_account_id is not null
    then
      raise exception 'profile_authority_violation: protected fields are server-controlled'
        using errcode = '42501';
    end if;
  elsif new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'profile_authority_violation: protected fields are immutable to clients'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.stackr_protect_profile_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists stackr_protect_profile_authority on public.profiles;
create trigger stackr_protect_profile_authority
before insert or update on public.profiles
for each row execute function public.stackr_protect_profile_authority();

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
) on table public.profiles to authenticated;
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
) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

do $$
begin
  if has_table_privilege('anon', 'public.profiles', 'select')
    or has_column_privilege('authenticated', 'public.profiles', 'role', 'insert')
    or has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'email', 'insert')
    or has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'stripe_account_id', 'insert')
    or has_column_privilege('authenticated', 'public.profiles', 'stripe_account_id', 'update')
    or has_function_privilege('anon', 'public.is_admin()', 'execute')
  then
    raise exception 'prompt2_profile_authority_containment_failed';
  end if;
end;
$$;

commit;

