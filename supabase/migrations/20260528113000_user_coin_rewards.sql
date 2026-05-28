create table if not exists public.user_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  achievement_id text,
  cosmetic_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_coin_ledger_non_zero_amount check (amount <> 0)
);

create unique index if not exists user_coin_ledger_achievement_unique
  on public.user_coin_ledger (user_id, achievement_id)
  where achievement_id is not null and reason = 'achievement_unlock';

create index if not exists user_coin_ledger_user_created_idx
  on public.user_coin_ledger (user_id, created_at desc);

create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null,
  source text not null default 'coins',
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, cosmetic_id)
);

alter table public.profiles
  add column if not exists profile_banner_cosmetic_id text,
  add column if not exists profile_border_cosmetic_id text;

create index if not exists user_cosmetics_user_idx
  on public.user_cosmetics (user_id, unlocked_at desc);

alter table public.user_coin_ledger enable row level security;
alter table public.user_cosmetics enable row level security;

drop policy if exists "Users can read own coin ledger" on public.user_coin_ledger;
create policy "Users can read own coin ledger"
  on public.user_coin_ledger
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own coin ledger" on public.user_coin_ledger;
create policy "Users can insert own coin ledger"
  on public.user_coin_ledger
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own cosmetics" on public.user_cosmetics;
create policy "Users can read own cosmetics"
  on public.user_cosmetics
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own cosmetics" on public.user_cosmetics;
create policy "Users can insert own cosmetics"
  on public.user_cosmetics
  for insert
  with check (auth.uid() = user_id);

grant select, insert on table public.user_coin_ledger to authenticated;
grant select, insert on table public.user_cosmetics to authenticated;
grant select, insert, update, delete on table public.user_coin_ledger to service_role;
grant select, insert, update, delete on table public.user_cosmetics to service_role;
