-- STAGING ONLY. Synthetic legacy surfaces for containment rehearsal.
-- This file is intentionally outside supabase/migrations so production deploys
-- cannot apply it. It contains no production or customer data.

create table if not exists public.stackr_staging_fixture_guard (
  singleton boolean primary key default true check (singleton),
  project_ref text not null unique,
  created_at timestamptz not null default now()
);

insert into public.stackr_staging_fixture_guard (singleton, project_ref)
values (true, 'lmwfhvexfcoyeuoyrlco')
on conflict (singleton) do update set project_ref = excluded.project_ref;

alter table public.stackr_staging_fixture_guard enable row level security;
revoke all on public.stackr_staging_fixture_guard from public, anon, authenticated;

create table public.profiles (
  id uuid primary key,
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
  email text,
  expo_push_token text,
  stripe_account_id text,
  role text not null default 'user',
  has_seen_onboarding boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    raise exception 'Refusing to replace an existing public.is_admin() fixture dependency';
  end if;
end;
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

alter table public.profiles enable row level security;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;

create policy "Public profiles are viewable"
  on public.profiles for select to anon, authenticated
  using (true);

create policy "users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create table public.market_price_snapshots (
  id uuid primary key,
  user_id uuid,
  card_id text not null,
  observed_price numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

alter table public.market_price_snapshots enable row level security;
grant select on public.market_price_snapshots to anon, authenticated;

create policy "Market price snapshots are readable"
  on public.market_price_snapshots for select to public
  using (user_id is null or (select auth.uid()) = user_id);

create policy "Allow authenticated users to read market snapshots"
  on public.market_price_snapshots for select to authenticated
  using (true);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'card-scans',
  'card-scans',
  true,
  null,
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Allow authenticated uploads to card scans"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'card-scans');

create policy "Allow public read access to card scans"
  on storage.objects for select to public
  using (bucket_id = 'card-scans');

insert into public.profiles (
  id,
  collector_name,
  email,
  expo_push_token,
  stripe_account_id,
  role
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'Staging Collector A',
    'collector-a@stackr.invalid',
    'staging-push-a',
    'staging-stripe-a',
    'user'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Staging Collector B',
    'collector-b@stackr.invalid',
    'staging-push-b',
    'staging-stripe-b',
    'user'
  );

insert into public.market_price_snapshots (
  id,
  user_id,
  card_id,
  observed_price
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    null,
    'staging-public-card',
    10.00
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '11111111-1111-4111-8111-111111111111',
    'staging-private-card-a',
    20.00
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    '22222222-2222-4222-8222-222222222222',
    'staging-private-card-b',
    30.00
  );

comment on table public.stackr_staging_fixture_guard is
  'Staging-only marker for synthetic critical-security rehearsal data.';
