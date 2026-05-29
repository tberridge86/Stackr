create table if not exists public.user_pokedex_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  set_id text,
  created_at timestamptz not null default now(),
  unique (user_id, card_id, set_id)
);

alter table public.user_pokedex_cards enable row level security;

drop policy if exists "Users can read own pokedex cards" on public.user_pokedex_cards;
create policy "Users can read own pokedex cards"
  on public.user_pokedex_cards
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own pokedex cards" on public.user_pokedex_cards;
create policy "Users can insert own pokedex cards"
  on public.user_pokedex_cards
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own pokedex cards" on public.user_pokedex_cards;
create policy "Users can update own pokedex cards"
  on public.user_pokedex_cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own pokedex cards" on public.user_pokedex_cards;
create policy "Users can delete own pokedex cards"
  on public.user_pokedex_cards
  for delete
  using (auth.uid() = user_id);

create index if not exists user_pokedex_cards_user_id_idx
  on public.user_pokedex_cards (user_id);

create index if not exists user_pokedex_cards_card_id_idx
  on public.user_pokedex_cards (card_id);

grant select, insert, update, delete on table public.user_pokedex_cards to authenticated;
grant select, insert, update, delete on table public.user_pokedex_cards to service_role;
