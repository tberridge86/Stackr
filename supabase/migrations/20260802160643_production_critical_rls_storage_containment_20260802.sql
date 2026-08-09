-- Production containment for 2026-07 release-audit RLS/storage blockers.
--
-- Scope:
-- - public.profiles: remove public PII reads and block client role updates
-- - public.profile_public_directory: public-safe profile projection
-- - public.market_price_snapshots: public rows plus owner rows only
-- - storage.card-scans: private bucket with owner-prefixed access
--
-- This intentionally does not delete rows or storage objects.

alter table public.profiles enable row level security;
alter table public.market_price_snapshots enable row level security;

create table if not exists public.profile_public_directory (
  id uuid primary key references public.profiles(id) on delete cascade,
  collector_name text,
  avatar_url text,
  avatar_preset text,
  banner_url text,
  pokemon_type text,
  background_key text,
  profile_banner_cosmetic_id text,
  profile_border_cosmetic_id text,
  favorite_card_id text,
  favorite_set_id text,
  chase_card_id text,
  chase_set_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_public_directory_collector_name_idx
  on public.profile_public_directory (lower(collector_name), id);

create or replace function public.sync_profile_public_directory()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profile_public_directory where id = old.id;
    return old;
  end if;

  insert into public.profile_public_directory (
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
    created_at,
    updated_at
  ) values (
    new.id,
    new.collector_name,
    new.avatar_url,
    new.avatar_preset,
    new.banner_url,
    new.pokemon_type,
    new.background_key,
    new.profile_banner_cosmetic_id,
    new.profile_border_cosmetic_id,
    new.favorite_card_id,
    new.favorite_set_id,
    new.chase_card_id,
    new.chase_set_id,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    collector_name = excluded.collector_name,
    avatar_url = excluded.avatar_url,
    avatar_preset = excluded.avatar_preset,
    banner_url = excluded.banner_url,
    pokemon_type = excluded.pokemon_type,
    background_key = excluded.background_key,
    profile_banner_cosmetic_id = excluded.profile_banner_cosmetic_id,
    profile_border_cosmetic_id = excluded.profile_border_cosmetic_id,
    favorite_card_id = excluded.favorite_card_id,
    favorite_set_id = excluded.favorite_set_id,
    chase_card_id = excluded.chase_card_id,
    chase_set_id = excluded.chase_set_id,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_profile_public_directory() from public, anon, authenticated;

drop trigger if exists sync_profile_public_directory_after_write on public.profiles;
create trigger sync_profile_public_directory_after_write
after insert or update or delete on public.profiles
for each row execute function public.sync_profile_public_directory();

insert into public.profile_public_directory (
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
  created_at,
  updated_at
)
select
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
  coalesce(created_at, now()),
  now()
from public.profiles
on conflict (id) do update set
  collector_name = excluded.collector_name,
  avatar_url = excluded.avatar_url,
  avatar_preset = excluded.avatar_preset,
  banner_url = excluded.banner_url,
  pokemon_type = excluded.pokemon_type,
  background_key = excluded.background_key,
  profile_banner_cosmetic_id = excluded.profile_banner_cosmetic_id,
  profile_border_cosmetic_id = excluded.profile_border_cosmetic_id,
  favorite_card_id = excluded.favorite_card_id,
  favorite_set_id = excluded.favorite_set_id,
  chase_card_id = excluded.chase_card_id,
  chase_set_id = excluded.chase_set_id,
  updated_at = now();

alter table public.profile_public_directory enable row level security;

drop policy if exists "Public profile directory is readable" on public.profile_public_directory;
create policy "Public profile directory is readable"
  on public.profile_public_directory
  for select
  to anon, authenticated
  using (true);

revoke all on table public.profile_public_directory from public, anon, authenticated;
grant select on table public.profile_public_directory to anon, authenticated;
grant select, insert, update, delete on table public.profile_public_directory to service_role;

drop policy if exists "Public profiles are viewable" on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "Admins can do anything to profiles" on public.profiles;
drop policy if exists "Users can view own private profile" on public.profiles;
drop policy if exists "Users can insert own private profile" on public.profiles;
drop policy if exists "Users can update own private profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

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

drop policy if exists "Allow authenticated users to read market snapshots"
  on public.market_price_snapshots;
drop policy if exists "Market price snapshots are readable"
  on public.market_price_snapshots;
drop policy if exists "Public or owner market snapshots are readable"
  on public.market_price_snapshots;
create policy "Public or owner market snapshots are readable"
  on public.market_price_snapshots
  for select
  to anon, authenticated
  using (user_id is null or (select auth.uid()) = user_id);

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'card-scans';

drop policy if exists "Allow authenticated uploads to card scans" on storage.objects;
drop policy if exists "Allow public read access to card scans" on storage.objects;
drop policy if exists "Users can upload own card scans" on storage.objects;
drop policy if exists "Users can read own card scans" on storage.objects;
drop policy if exists "Users can delete own card scans" on storage.objects;

create policy "Users can upload own card scans"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'card-scans'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can read own card scans"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'card-scans'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

create policy "Users can delete own card scans"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'card-scans'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

comment on table public.profile_public_directory is
  'Public-safe profile projection maintained from profiles; excludes email, push tokens, roles, and payment identifiers.';

do $$
declare
  bucket_record record;
begin
  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'Containment failed: anon can still select public.profiles';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Public profiles are viewable'
  ) then
    raise exception 'Containment failed: legacy public profiles policy remains';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'stripe_account_id', 'update')
  then
    raise exception 'Containment failed: authenticated can update sensitive profile columns';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'market_price_snapshots'
      and policyname = 'Allow authenticated users to read market snapshots'
  ) then
    raise exception 'Containment failed: permissive market snapshot policy remains';
  end if;

  select public, file_size_limit, allowed_mime_types
  into bucket_record
  from storage.buckets
  where id = 'card-scans';

  if not found then
    raise exception 'Containment failed: card-scans bucket is missing';
  end if;

  if bucket_record.public
    or bucket_record.file_size_limit <> 5242880
    or bucket_record.allowed_mime_types is null
    or bucket_record.allowed_mime_types <> array['image/jpeg', 'image/png', 'image/webp']::text[]
  then
    raise exception 'Containment failed: card-scans bucket controls are not active';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow public read access to card scans'
  ) then
    raise exception 'Containment failed: public card scan read policy remains';
  end if;
end;
$$;
