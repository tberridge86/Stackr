create table if not exists public.local_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  town text,
  postcode text,
  website_url text,
  latitude double precision,
  longitude double precision,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.local_featured_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  venue_name text,
  town text,
  postcode text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz,
  external_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.local_meetups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location_name text not null,
  town text,
  postcode text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz,
  status text not null default 'published',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.local_meetup_attendees (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.local_meetups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.local_stores
  add column if not exists postcode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.local_featured_events
  add column if not exists postcode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.local_meetups
  add column if not exists postcode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists local_meetups_location_idx
  on public.local_meetups (latitude, longitude);

create index if not exists local_featured_events_location_idx
  on public.local_featured_events (latitude, longitude);

create index if not exists local_stores_location_idx
  on public.local_stores (latitude, longitude);

create index if not exists local_meetup_attendees_meetup_idx
  on public.local_meetup_attendees (meetup_id);

create unique index if not exists local_meetup_attendees_meetup_user_unique
  on public.local_meetup_attendees (meetup_id, user_id);

alter table public.local_stores enable row level security;
alter table public.local_featured_events enable row level security;
alter table public.local_meetups enable row level security;
alter table public.local_meetup_attendees enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_stores' and policyname = 'Published local stores are readable'
  ) then
    create policy "Published local stores are readable"
      on public.local_stores for select
      using (is_published = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_featured_events' and policyname = 'Published local featured events are readable'
  ) then
    create policy "Published local featured events are readable"
      on public.local_featured_events for select
      using (is_published = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_meetups' and policyname = 'Published local meetups are readable'
  ) then
    create policy "Published local meetups are readable"
      on public.local_meetups for select
      using (status = 'published');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_meetups' and policyname = 'Users can create local meetups'
  ) then
    create policy "Users can create local meetups"
      on public.local_meetups for insert
      with check (auth.uid() = created_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_meetup_attendees' and policyname = 'Local meetup attendees are readable'
  ) then
    create policy "Local meetup attendees are readable"
      on public.local_meetup_attendees for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_meetup_attendees' and policyname = 'Users can manage their meetup attendance'
  ) then
    create policy "Users can manage their meetup attendance"
      on public.local_meetup_attendees for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
