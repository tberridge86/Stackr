create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, achievement_id)
);

create table if not exists public.user_achievement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id, unlocked_at desc);

create index if not exists user_achievement_events_user_type_idx
  on public.user_achievement_events (user_id, event_type, created_at desc);

alter table public.user_achievements enable row level security;
alter table public.user_achievement_events enable row level security;

drop policy if exists "Users can read own achievements" on public.user_achievements;
create policy "Users can read own achievements"
  on public.user_achievements
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own achievements" on public.user_achievements;
create policy "Users can insert own achievements"
  on public.user_achievements
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own achievement events" on public.user_achievement_events;
create policy "Users can read own achievement events"
  on public.user_achievement_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own achievement events" on public.user_achievement_events;
create policy "Users can insert own achievement events"
  on public.user_achievement_events
  for insert
  with check (auth.uid() = user_id);

grant select, insert on table public.user_achievements to authenticated;
grant select, insert on table public.user_achievement_events to authenticated;
grant select, insert, update, delete on table public.user_achievements to service_role;
grant select, insert, update, delete on table public.user_achievement_events to service_role;
