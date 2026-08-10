-- Expand-first containment for findings from the 2026-07-28 release audit.
-- This creates the public-safe profile replacement before the mobile cutover,
-- while immediately containing market-row and scan-storage exposure.

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
