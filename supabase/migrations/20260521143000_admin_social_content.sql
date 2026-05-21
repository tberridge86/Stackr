create table if not exists public.community_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'Latest',
  icon text not null default 'newspaper-outline',
  external_url text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  published_at timestamptz default now(),
  created_at timestamptz not null default now()
);

alter table public.community_news enable row level security;

create index if not exists community_news_published_idx
  on public.community_news (is_published, sort_order, published_at);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_news' and policyname = 'Published community news is readable'
  ) then
    create policy "Published community news is readable"
      on public.community_news for select
      using (is_published = true or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_news' and policyname = 'Admins can manage community news'
  ) then
    create policy "Admins can manage community news"
      on public.community_news for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_stores' and policyname = 'Admins can manage local stores'
  ) then
    create policy "Admins can manage local stores"
      on public.local_stores for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_featured_events' and policyname = 'Admins can manage local featured events'
  ) then
    create policy "Admins can manage local featured events"
      on public.local_featured_events for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'local_meetups' and policyname = 'Admins can manage local meetups'
  ) then
    create policy "Admins can manage local meetups"
      on public.local_meetups for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
